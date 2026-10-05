"""Public report download: ``GET /api/v1/reports/{order_id}/download`` (mounted with the prefix in main.py).

Access needs the order's browser token or the latest email token as ``Authorization: Bearer``.
Unknown orders and wrong tokens get the same 404, so the endpoint never reveals which orders exist.
"""

from __future__ import annotations

import logging
import os
import uuid
from collections.abc import Iterator
from typing import BinaryIO

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ApiError
from app.models import Order, OrderStatus, Report
from app.ratelimit import limiter
from app.reports import storage
from app.security import token_matches
from app.utils import client_ip, utcnow

logger = logging.getLogger(__name__)

router = APIRouter()

DOWNLOAD_RATE_LIMIT = 30
DOWNLOAD_RATE_WINDOW_SECONDS = 60
MAX_TOKEN_LENGTH = 256
CHUNK_SIZE = 64 * 1024

_NO_STORE = {"Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow"}
_GONE_STATUSES = frozenset({OrderStatus.EXPIRED, OrderStatus.REFUNDED})


def _not_found() -> ApiError:
    return ApiError(404, "not_found", "Report not found", headers=_NO_STORE)


def _not_ready() -> ApiError:
    return ApiError(409, "report_not_ready", "The report is not ready yet", headers=_NO_STORE)


def _expired() -> ApiError:
    return ApiError(410, "report_expired", "The download link has expired", headers=_NO_STORE)


def bearer_token(authorization: str | None) -> str | None:
    """Token from an ``Authorization: Bearer <token>`` header (scheme case-insensitive)."""
    if not authorization:
        return None
    scheme, _, token = authorization.strip().partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token or len(token) > MAX_TOKEN_LENGTH:
        return None
    return token


def _parse_order_id(raw: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None


def _authorize(db: Session, order_id: str, token: str | None) -> tuple[Order, Report | None]:
    parsed = _parse_order_id(order_id)
    order = db.get(Order, parsed) if parsed is not None and token else None
    if order is None or token is None:
        raise _not_found()
    report = db.scalar(select(Report).where(Report.order_id == order.id))
    browser_ok = token_matches(token, order.access_token_hash)
    email_ok = report is not None and token_matches(token, report.email_token_hash)
    if not (browser_ok or email_ok):
        raise _not_found()
    return order, report


def _check_downloadable(order: Order, report: Report | None) -> Report:
    if order.status in _GONE_STATUSES:
        raise _expired()
    if order.status != OrderStatus.READY or report is None:
        raise _not_ready()
    if report.deleted_at is not None or utcnow() >= report.expires_at:
        raise _expired()
    return report


def _iter_file(handle: BinaryIO) -> Iterator[bytes]:
    try:
        while chunk := handle.read(CHUNK_SIZE):
            yield chunk
    finally:
        handle.close()


@router.get(
    "/{order_id}/download",
    response_class=StreamingResponse,
    responses={
        200: {"content": {"application/pdf": {}}, "description": "The report PDF"},
        404: {"description": "Unknown order or wrong token"},
        409: {"description": "report_not_ready"},
        410: {"description": "report_expired"},
    },
)
def download_report(
    order_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    limiter.hit(f"report-download:{client_ip(request)}", DOWNLOAD_RATE_LIMIT, DOWNLOAD_RATE_WINDOW_SECONDS)
    order, report = _authorize(db, order_id, bearer_token(authorization))
    report = _check_downloadable(order, report)

    # Open before committing: an open handle keeps streaming even if cleanup unlinks the file meanwhile.
    try:
        handle = storage.open_report(report.file_key)
    except (FileNotFoundError, storage.InvalidFileKey):
        logger.error("Report file missing for order %s", order.id)
        raise _expired() from None
    try:
        size = os.fstat(handle.fileno()).st_size
        db.execute(
            update(Report)
            .where(Report.id == report.id)
            .values(download_count=Report.download_count + 1, last_download_at=utcnow())
        )
        db.commit()
    except BaseException:
        handle.close()
        raise

    headers = {
        **_NO_STORE,
        "Content-Disposition": f'attachment; filename="{storage.DOWNLOAD_FILENAME}"',
        "Content-Length": str(size),
        "Pragma": "no-cache",
    }
    return StreamingResponse(_iter_file(handle), media_type="application/pdf", headers=headers)

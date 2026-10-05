"""Public free plan API, mounted at ``/api/v1/free-reading`` (docs/ARCHITECTURE.md §5)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.free_reading import service
from app.free_reading.schemas import FreeReadingIn, FreeReadingResult
from app.utils import client_ip

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.post("", response_model=FreeReadingResult)
def create_free_reading(
    payload: FreeReadingIn, request: Request, response: Response, db: DbSession
) -> FreeReadingResult:
    result = service.create_free_reading(db, payload, client_ip(request))
    db.commit()
    # The answer is personal (derived from the visitor's birth date): never cache it.
    response.headers["Cache-Control"] = "no-store"
    return result

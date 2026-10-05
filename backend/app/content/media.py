"""CMS image uploads: size-capped multipart parsing, Pillow verification, metadata stripping, storage.

Files live in ``settings.media_dir`` under random names (``<32 hex>.<ext>``) and are served publicly by
``GET /api/v1/media/{file_name}``; only names matching ``FILE_NAME_RE`` are ever read or deleted, which
rules out path traversal.
"""

from __future__ import annotations

import logging
import re
import secrets
from collections.abc import AsyncGenerator, AsyncIterator
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from fastapi import Request
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from app.config import get_settings
from app.content.admin_schemas import MediaOut
from app.content.common import field_error, paginate
from app.errors import ApiError, not_found
from app.models import BlogPost, Book, BookSeries, Media, Offer

logger = logging.getLogger(__name__)

# Pillow format -> (file extension, Content-Type). SVG is deliberately absent: it can carry scripts.
ALLOWED_FORMATS: dict[str, tuple[str, str]] = {
    "JPEG": ("jpg", "image/jpeg"),
    "PNG": ("png", "image/png"),
    "WEBP": ("webp", "image/webp"),
    "GIF": ("gif", "image/gif"),
}
CONTENT_TYPES: dict[str, str] = dict(ALLOWED_FORMATS.values())
FILE_NAME_RE = re.compile(r"[a-f0-9]{32}\.(?:jpg|png|webp|gif)")
MEDIA_URL_PREFIX = "/api/v1/media/"
MAX_DIMENSION = 6000
# Re-encoding an animation decodes every frame; cap frames x width x height to bound CPU and memory.
MAX_ANIMATION_PIXELS = 200_000_000
# Room for the multipart boundary and part headers around the file itself.
MULTIPART_OVERHEAD_BYTES = 64 * 1024
_PILLOW_ERRORS = (UnidentifiedImageError, OSError, SyntaxError, ValueError, EOFError, Image.DecompressionBombError)


@dataclass(frozen=True)
class UploadedFile:
    data: bytes
    filename: str


@dataclass(frozen=True)
class ProcessedImage:
    data: bytes
    extension: str
    content_type: str
    width: int
    height: int


def file_too_large(max_bytes: int) -> ApiError:
    return ApiError(
        413, "file_too_large", f"The file is larger than {max_bytes // (1024 * 1024)} MB", {"max_bytes": max_bytes}
    )


def _invalid_image() -> ApiError:
    return ApiError(422, "invalid_image", "Upload a valid JPEG, PNG, WEBP or GIF image")


def _image_too_large() -> ApiError:
    return ApiError(
        422,
        "image_too_large",
        f"Images may be at most {MAX_DIMENSION} x {MAX_DIMENSION} pixels",
        {"max_width": MAX_DIMENSION, "max_height": MAX_DIMENSION},
    )


# ---------------------------------------------------------------------------
# Reading the multipart request
# ---------------------------------------------------------------------------


async def _capped(stream: AsyncIterator[bytes], limit: int, max_bytes: int) -> AsyncGenerator[bytes, None]:
    received = 0
    async for chunk in stream:
        received += len(chunk)
        if received > limit:
            raise file_too_large(max_bytes)
        yield chunk


async def read_upload(request: Request, max_bytes: int) -> UploadedFile:
    """Parse the ``file`` field without ever buffering much more than ``max_bytes``.

    FastAPI's ``File()`` would spool the whole body to disk before any dependency (even auth) runs,
    so the endpoint parses the stream itself, after authentication, with a hard cap.
    """
    if not request.headers.get("content-type", "").lower().startswith("multipart/form-data"):
        raise ApiError(415, "unsupported_media_type", "Send the image as multipart/form-data in the 'file' field")
    limit = max_bytes + MULTIPART_OVERHEAD_BYTES
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise file_too_large(max_bytes)
    parser = MultiPartParser(request.headers, _capped(request.stream(), limit, max_bytes), max_files=1, max_fields=10)
    try:
        form = await parser.parse()
    except MultiPartException as exc:
        raise ApiError(422, "invalid_upload", exc.message) from exc
    try:
        upload = form.get("file")
        if not isinstance(upload, UploadFile):
            raise field_error("file", "Field required")
        data = await upload.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise file_too_large(max_bytes)
        if not data:
            raise ApiError(422, "invalid_image", "The file is empty")
        return UploadedFile(data=data, filename=upload.filename or "")
    finally:
        await form.close()


def clean_original_name(name: str) -> str:
    """Display-only: the base name without directories or control characters."""
    base = name.replace("\\", "/").rsplit("/", 1)[-1]
    return "".join(ch for ch in base if ch.isprintable()).strip()[:300]


# ---------------------------------------------------------------------------
# Image verification & re-encoding
# ---------------------------------------------------------------------------


def _probe(data: bytes) -> tuple[str, int, int]:
    """Identify the format (only the allowed decoders are tried) and check dimensions before decoding."""
    try:
        with Image.open(BytesIO(data), formats=list(ALLOWED_FORMATS)) as probe:
            fmt = probe.format or ""
            width, height = probe.size
            if width > MAX_DIMENSION or height > MAX_DIMENSION:
                raise _image_too_large()
            probe.verify()
    except Image.DecompressionBombError as exc:
        raise _image_too_large() from exc
    except _PILLOW_ERRORS as exc:
        raise _invalid_image() from exc
    if fmt not in ALLOWED_FORMATS or width < 1 or height < 1:
        raise _invalid_image()
    return fmt, width, height


def _webp_is_lossless(data: bytes) -> bool:
    """True when the WebP bitstream is VP8L (lossless), so logos are not re-encoded lossily."""
    pos = 12  # after "RIFF" <size> "WEBP"
    while pos + 8 <= len(data):
        tag = data[pos : pos + 4]
        if tag == b"VP8L":
            return True
        if tag == b"VP8 ":
            return False
        size = int.from_bytes(data[pos + 4 : pos + 8], "little")
        pos += 8 + size + (size & 1)
    return False


def _reencode(img: Image.Image, fmt: str, source: bytes) -> tuple[bytes, int, int]:
    """Write pixels only: EXIF (GPS, camera serials), XMP and text chunks are not carried over.

    The ICC profile is kept: it is colour data, not personal data, and dropping it shifts colours.
    """
    out = BytesIO()
    options: dict[str, object] = {}
    if img.info.get("icc_profile"):
        options["icc_profile"] = img.info["icc_profile"]
    animated = bool(getattr(img, "is_animated", False))
    if fmt == "JPEG":
        img = ImageOps.exif_transpose(img)  # bake the orientation into the pixels before EXIF is dropped
        if img.mode not in ("L", "RGB", "CMYK"):
            img = img.convert("RGB")
        img.save(out, "JPEG", quality=90, optimize=True, **options)
    elif fmt == "PNG":
        if "transparency" in img.info:
            options["transparency"] = img.info["transparency"]
        img.save(out, "PNG", save_all=animated, **options)
    else:  # WEBP
        if not animated:
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if img.has_transparency_data else "RGB")
        img.save(out, "WEBP", save_all=animated, lossless=_webp_is_lossless(source), quality=90, **options)
    return out.getvalue(), img.width, img.height


def process_image(data: bytes) -> ProcessedImage:
    """Verify an upload and return the bytes to store (re-encoded, except GIF)."""
    fmt, width, height = _probe(data)
    extension, content_type = ALLOWED_FORMATS[fmt]
    try:
        with Image.open(BytesIO(data), formats=[fmt]) as img:
            img.load()  # verify() only checks structure; decoding catches truncated pixel data
            if fmt == "GIF":
                # Re-encoding GIFs degrades palettes and animation timing, and GIF has no EXIF block.
                return ProcessedImage(data, extension, content_type, width, height)
            if getattr(img, "n_frames", 1) * width * height > MAX_ANIMATION_PIXELS:
                raise _image_too_large()
            encoded, width, height = _reencode(img, fmt, data)
    except _PILLOW_ERRORS as exc:
        raise _invalid_image() from exc
    return ProcessedImage(encoded, extension, content_type, width, height)


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------


def media_url(file_name: str) -> str:
    return f"{MEDIA_URL_PREFIX}{file_name}"


def stored_path(file_name: str) -> Path | None:
    """Path of a stored media file, or None for an invalid name or a missing file."""
    if not FILE_NAME_RE.fullmatch(file_name):
        return None
    path = get_settings().media_dir / file_name
    return path if path.is_file() else None


def content_type_for(file_name: str) -> str:
    return CONTENT_TYPES[file_name.rsplit(".", 1)[-1]]


def store_file(image: ProcessedImage) -> str:
    """Write atomically under a fresh random name; returns the file name."""
    directory = get_settings().media_dir
    directory.mkdir(parents=True, exist_ok=True)
    file_name = f"{secrets.token_hex(16)}.{image.extension}"
    partial = directory / f".{file_name}.part"
    try:
        with partial.open("xb") as fh:
            fh.write(image.data)
        partial.replace(directory / file_name)
    except BaseException:
        partial.unlink(missing_ok=True)
        raise
    return file_name


def remove_file(file_name: str) -> None:
    if not FILE_NAME_RE.fullmatch(file_name):
        return
    try:
        (get_settings().media_dir / file_name).unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not delete media file %s", file_name, exc_info=True)


# ---------------------------------------------------------------------------
# Media rows
# ---------------------------------------------------------------------------


def create_media(db: Session, image: ProcessedImage, original_name: str) -> Media:
    """Store the file and add its row (caller commits; on failure the caller removes the file)."""
    file_name = store_file(image)
    media = Media(
        file_name=file_name,
        original_name=clean_original_name(original_name),
        content_type=image.content_type,
        size_bytes=len(image.data),
        width=image.width,
        height=image.height,
        alt={},
    )
    db.add(media)
    try:
        db.flush()
    except BaseException:
        remove_file(file_name)
        raise
    return media


def list_media(db: Session, page: int, page_size: int) -> tuple[list[Media], int]:
    return paginate(db, select(Media).order_by(Media.created_at.desc(), Media.id.desc()), page, page_size)


def get_media(db: Session, media_id: int) -> Media:
    media = db.get(Media, media_id)
    if media is None:
        raise not_found("media")
    return media


def references(db: Session, file_name: str) -> list[dict[str, object]]:
    """Content rows whose image URL points at this file (relative or absolute URL)."""
    found: list[dict[str, object]] = []
    columns = (
        ("offer", Offer, (Offer.image_url,)),
        ("blog_post", BlogPost, (BlogPost.cover_image_url,)),
        ("book_series", BookSeries, (BookSeries.cover_image_url,)),
        ("book", Book, (Book.cover_image_url,)),
    )
    for entity_type, model, urls in columns:
        # file_name is [a-f0-9.] only, so it contains no LIKE wildcards.
        ids = db.scalars(select(model.id).where(or_(*(url.contains(file_name) for url in urls))))
        found.extend({"entity_type": entity_type, "id": row_id} for row_id in ids)
    return found


def delete_media(db: Session, media: Media) -> None:
    """Delete the row (caller commits, then removes the file). Refuses while content still shows it."""
    in_use = references(db, media.file_name)
    if in_use:
        raise ApiError(
            409, "media_in_use", "The image is still used; remove it from that content first", {"references": in_use}
        )
    db.delete(media)
    db.flush()


def media_out(media: Media) -> MediaOut:
    return MediaOut(
        id=media.id,
        url=media_url(media.file_name),
        file_name=media.file_name,
        original_name=media.original_name,
        content_type=media.content_type,
        size_bytes=media.size_bytes,
        width=media.width,
        height=media.height,
        alt=media.alt or {},
        created_at=media.created_at,
    )

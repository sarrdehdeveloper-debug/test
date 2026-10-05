"""Private on-disk storage for generated report PDFs.

Files live in ``settings.reports_dir`` as ``<file_key>.pdf`` where ``file_key`` is 64 random hex
characters. The directory is never served statically: downloads go through the token-checked
API. Keys are validated before touching the filesystem so a crafted key can never escape the
directory.
"""

from __future__ import annotations

import contextlib
import os
import re
import tempfile
from pathlib import Path
from typing import BinaryIO

from app.config import get_settings

FILE_KEY_PATTERN = re.compile(r"[a-f0-9]{64}")
DOWNLOAD_FILENAME = "ZodiacBlend-Report.pdf"  # name shown to the customer (download & attachment)
_DIR_MODE = 0o700
_FILE_MODE = 0o600


class InvalidFileKey(ValueError):
    """Raised when a file key is not exactly 64 lower-case hex characters."""


def validate_file_key(file_key: str) -> str:
    if not isinstance(file_key, str) or not FILE_KEY_PATTERN.fullmatch(file_key):
        raise InvalidFileKey("Invalid report file key")
    return file_key


def reports_dir() -> Path:
    # Read on every call: the storage location is configuration (and tests point it elsewhere).
    return get_settings().reports_dir


def report_path(file_key: str) -> Path:
    return reports_dir() / f"{validate_file_key(file_key)}.pdf"


def ensure_reports_dir() -> Path:
    directory = reports_dir()
    directory.mkdir(parents=True, exist_ok=True, mode=_DIR_MODE)
    # mkdir's mode is filtered by the umask (and ignored for existing dirs), so enforce it.
    os.chmod(directory, _DIR_MODE)
    return directory


def save_report(file_key: str, data: bytes) -> Path:
    """Write the PDF atomically (temp file + fsync + rename) with owner-only permissions."""
    target = report_path(file_key)
    directory = ensure_reports_dir()
    fd, tmp_name = tempfile.mkstemp(prefix=".tmp-", suffix=".pdf", dir=directory)
    try:
        os.fchmod(fd, _FILE_MODE)
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_name, target)
    except BaseException:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(tmp_name)
        raise
    return target


def report_exists(file_key: str) -> bool:
    return report_path(file_key).is_file()


def open_report(file_key: str) -> BinaryIO:
    """Open the stored PDF for reading. Raises ``FileNotFoundError`` if it is gone."""
    return report_path(file_key).open("rb")


def read_report(file_key: str) -> bytes:
    return report_path(file_key).read_bytes()


def delete_report(file_key: str) -> bool:
    """Delete the stored PDF. Returns False if it did not exist (not an error)."""
    try:
        report_path(file_key).unlink()
    except FileNotFoundError:
        return False
    return True

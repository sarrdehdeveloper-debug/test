"""Outgoing email: SMTP in production, ``.eml`` files in ``<storage>/outbox`` for development.

Messages are ``multipart/alternative`` (plain text + HTML), wrapped in ``multipart/mixed`` when
there are attachments. Message bodies are never logged (they contain download tokens).
"""

from __future__ import annotations

import logging
import os
import secrets
import smtplib
import ssl
from collections.abc import Sequence
from email.message import EmailMessage
from email.utils import formatdate, make_msgid, parseaddr
from pathlib import Path

from app.config import get_settings
from app.utils import utcnow

logger = logging.getLogger(__name__)

SMTP_TIMEOUT_SECONDS = 30
OUTBOX_SUBDIR = "outbox"

Attachment = tuple[str, bytes, str]  # (filename, content, mime type)


class EmailSendError(RuntimeError):
    """Delivery failed; the caller (a job) should retry later."""


class InvalidEmailAddress(ValueError):
    pass


def send_email(
    to: str,
    subject: str,
    text: str,
    html: str,
    attachments: Sequence[Attachment] | None = None,
) -> str:
    """Send one email with the configured backend. Returns the Message-ID."""
    message = build_message(to, subject, text, html, attachments)
    backend = get_settings().email_backend
    if backend == "smtp":
        _send_smtp(message)
    else:
        _write_to_outbox(message)
    return str(message["Message-ID"])


def build_message(
    to: str,
    subject: str,
    text: str,
    html: str,
    attachments: Sequence[Attachment] | None = None,
) -> EmailMessage:
    settings = get_settings()
    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = _validated_address(to)
    message["Subject"] = subject
    if settings.email_reply_to:
        message["Reply-To"] = settings.email_reply_to
    message["Date"] = formatdate(localtime=False)
    message["Message-ID"] = make_msgid(domain=_sender_domain(settings.email_from))
    message["Auto-Submitted"] = "auto-generated"
    message.set_content(text)
    message.add_alternative(html, subtype="html")
    for filename, content, mime in attachments or ():
        maintype, _, subtype = mime.partition("/")
        message.add_attachment(content, maintype=maintype, subtype=subtype or "octet-stream", filename=filename)
    return message


def _validated_address(address: str) -> str:
    # Header injection guard: a single plain address, no CR/LF or extra recipients.
    if any(ch in address for ch in "\r\n,;<>") or len(address) > 320:
        raise InvalidEmailAddress("Invalid recipient address")
    _, parsed = parseaddr(address)
    if parsed != address.strip() or "@" not in parsed:
        raise InvalidEmailAddress("Invalid recipient address")
    return parsed


def _sender_domain(from_header: str) -> str:
    _, address = parseaddr(from_header)
    return address.rpartition("@")[2] or "zodiacblend.com"


def _send_smtp(message: EmailMessage) -> None:
    settings = get_settings()
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS) as smtp:
            smtp.ehlo()
            if settings.smtp_starttls:
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        # The exception text may echo addresses; keep only the type and SMTP code.
        code = getattr(exc, "smtp_code", None)
        raise EmailSendError(f"SMTP delivery failed: {type(exc).__name__}{f' ({code})' if code else ''}") from exc
    logger.info("Email sent via SMTP: %s", message["Message-ID"])


def outbox_dir() -> Path:
    return get_settings().storage_dir / OUTBOX_SUBDIR


def _write_to_outbox(message: EmailMessage) -> Path:
    directory = outbox_dir()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = directory / f"{utcnow():%Y%m%dT%H%M%S}-{secrets.token_hex(6)}.eml"
    # The file holds a live download link: owner-only permissions.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as fh:
        fh.write(message.as_bytes())
    logger.info("Email written to outbox (console backend): %s", path.name)
    return path

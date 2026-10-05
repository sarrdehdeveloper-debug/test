"""Small security helpers shared by all modules."""

from __future__ import annotations

import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_hasher = PasswordHasher()


def new_token(nbytes: int = 32) -> str:
    """URL-safe random token (32 bytes -> 43 chars)."""
    return secrets.token_urlsafe(nbytes)


def new_report_file_key() -> str:
    """Random report file name: 32 random bytes as 64 hex chars (client requires >= 64)."""
    return secrets.token_hex(32)


def hash_token(token: str) -> str:
    """SHA-256 hex digest. Tokens are high-entropy, so a fast hash is appropriate."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_matches(token: str, token_hash: str | None) -> bool:
    if not token or not token_hash:
        return False
    return hmac.compare_digest(hash_token(token), token_hash)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)

"""Request/response models for admin authentication, admin user management and the audit log."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    ValidationInfo,
    field_validator,
)

from app.models import AdminRole, AdminUser

PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 200
# Login/confirmation fields accept more than the policy maximum so passwords set elsewhere (CLI) keep
# working; the cap only bounds the request size and hashing cost.
SUBMITTED_PASSWORD_MAX_LENGTH = 1024
EMAIL_MAX_LENGTH = 320
MAX_DB_ID = 2**63 - 1  # BIGINT primary keys


def _reject_blank(value: str) -> str:
    if not value.strip():
        raise ValueError("Password must not be blank")
    return value


def _lower(value: str) -> str:
    return value.strip().lower()


NewPassword = Annotated[
    str,
    Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH),
    AfterValidator(_reject_blank),
]
SubmittedPassword = Annotated[str, Field(min_length=1, max_length=SUBMITTED_PASSWORD_MAX_LENGTH)]
LoginEmail = Annotated[
    str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=EMAIL_MAX_LENGTH)
]
NewEmail = Annotated[EmailStr, AfterValidator(_lower)]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
TotpCode = Annotated[str, Field(max_length=16)]
DbId = Annotated[int, Field(ge=1, le=MAX_DB_ID)]
AuditLabel = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]


class _Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class LoginIn(_Input):
    email: LoginEmail
    password: SubmittedPassword
    totp_code: TotpCode | None = None


class PasswordChangeIn(_Input):
    current_password: SubmittedPassword
    new_password: NewPassword

    @field_validator("new_password")
    @classmethod
    def _must_differ(cls, value: str, info: ValidationInfo) -> str:
        if value == info.data.get("current_password"):
            raise ValueError("New password must differ from the current password")
        return value


class MfaEnableIn(_Input):
    code: TotpCode


class MfaDisableIn(_Input):
    password: SubmittedPassword
    code: TotpCode


class AdminUserOut(BaseModel):
    id: int
    email: str
    name: str
    role: AdminRole
    mfa_enabled: bool
    last_login_at: datetime | None

    @classmethod
    def from_user(cls, user: AdminUser) -> Self:
        return cls(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role,
            mfa_enabled=user.totp_secret is not None,
            last_login_at=user.last_login_at,
        )


class UserEnvelopeOut(BaseModel):
    user: AdminUserOut


class OkOut(BaseModel):
    ok: bool = True


class MfaSetupOut(BaseModel):
    secret: str
    otpauth_url: str


# ---------------------------------------------------------------------------
# Admin users (owner)
# ---------------------------------------------------------------------------


class UserCreateIn(_Input):
    email: NewEmail
    name: DisplayName
    role: AdminRole
    password: NewPassword


class UserUpdateIn(_Input):
    """Partial update: omitted fields are left unchanged; explicit ``null`` is rejected."""

    name: DisplayName | None = None
    role: AdminRole | None = None
    is_active: bool | None = None
    password: NewPassword | None = None
    # Clears a user's MFA enrolment (lost authenticator); they can enrol again after logging in.
    reset_mfa: bool = False

    @field_validator("name", "role", "is_active", "password", mode="before")
    @classmethod
    def _no_explicit_null(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("Field cannot be null; omit it to keep the current value")
        return value


class ManagedUserOut(AdminUserOut):
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_user(cls, user: AdminUser) -> Self:
        base = AdminUserOut.from_user(user).model_dump()
        return cls(**base, is_active=user.is_active, created_at=user.created_at, updated_at=user.updated_at)


class PageQuery(BaseModel):
    page: int = Field(default=1, ge=1, le=100_000)
    page_size: int = Field(default=20, ge=1, le=100)


class UserListOut(BaseModel):
    items: list[ManagedUserOut]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Audit log (manager)
# ---------------------------------------------------------------------------


class AuditLogQuery(PageQuery):
    entity_type: AuditLabel | None = None
    action: AuditLabel | None = None
    user_id: DbId | None = None


class AuditLogOut(BaseModel):
    id: int
    created_at: datetime
    user_id: int | None
    user_email: str | None
    action: str
    entity_type: str
    entity_id: str | None
    data: dict[str, Any]
    ip: str | None


class AuditLogListOut(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    page_size: int

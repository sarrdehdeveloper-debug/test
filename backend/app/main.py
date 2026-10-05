"""FastAPI application factory. Run: ``uvicorn app.main:app``."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import get_settings
from app.db import engine
from app.errors import install_error_handlers

API = "/api/v1"


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Zodiac Blend API",
        version="1.0.0",
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/api/openapi.json",
    )
    install_error_handlers(app)

    from app.admin_auth.router import router as admin_auth_router
    from app.admin_auth.users_router import router as admin_users_router
    from app.content.admin_router import router as content_admin_router
    from app.content.router import router as content_router
    from app.free_reading.router import router as free_reading_router
    from app.geo.router import router as geo_router
    from app.orders.admin_router import router as orders_admin_router
    from app.orders.router import router as orders_router
    from app.payments.router import router as payments_router
    from app.prompts.admin_router import router as prompts_admin_router
    from app.reports.router import router as reports_router

    # Public API
    app.include_router(geo_router, prefix=f"{API}/geo", tags=["geo"])
    app.include_router(free_reading_router, prefix=f"{API}/free-reading", tags=["free-reading"])
    app.include_router(orders_router, prefix=f"{API}/orders", tags=["orders"])
    app.include_router(payments_router, prefix=f"{API}/payments", tags=["payments"])
    app.include_router(reports_router, prefix=f"{API}/reports", tags=["reports"])
    app.include_router(content_router, prefix=f"{API}", tags=["content"])

    # Admin API (each router applies its own auth/role dependencies)
    app.include_router(admin_auth_router, prefix=f"{API}/admin/auth", tags=["admin-auth"])
    app.include_router(admin_users_router, prefix=f"{API}/admin", tags=["admin-users"])
    app.include_router(content_admin_router, prefix=f"{API}/admin", tags=["admin-content"])
    app.include_router(prompts_admin_router, prefix=f"{API}/admin/prompts", tags=["admin-prompts"])
    app.include_router(orders_admin_router, prefix=f"{API}/admin", tags=["admin-orders"])

    @app.get(f"{API}/health", tags=["health"])
    def health() -> JSONResponse:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return JSONResponse({"status": "ok"}, headers={"Cache-Control": "no-store"})

    @app.middleware("http")
    async def security_headers(request, call_next):  # type: ignore[no-untyped-def]
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Frame-Options", "DENY")
        if request.url.path.startswith(f"{API}/admin") or request.url.path.startswith(f"{API}/orders"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    return app


app = create_app()

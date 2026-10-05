"""Management commands: ``python -m app.cli <command>``.

create-admin --email E --password P [--role owner|admin|editor] [--name N]
import-geo [--min-population N]       load countries & cities (GeoNames via geonamescache)
seed [--force]                        load sample content, prompts, readings (idempotent)
worker                                run the job worker (same as python -m app.worker)
"""

from __future__ import annotations

import argparse
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-admin")
    p.add_argument("--email", required=True)
    p.add_argument("--password", required=True)
    p.add_argument("--name", default="")
    p.add_argument("--role", default="owner", choices=["owner", "admin", "editor"])

    p = sub.add_parser("import-geo")
    p.add_argument("--min-population", type=int, default=15000)

    p = sub.add_parser("seed")
    p.add_argument("--force", action="store_true", help="overwrite existing sample rows")

    sub.add_parser("worker")

    args = parser.parse_args(argv)

    if args.command == "create-admin":
        from sqlalchemy import select

        from app.db import session_scope
        from app.models import AdminRole, AdminUser
        from app.security import hash_password

        email = args.email.strip().lower()
        if len(args.password) < 12:
            print("Password must be at least 12 characters", file=sys.stderr)
            return 2
        with session_scope() as db:
            user = db.scalar(select(AdminUser).where(AdminUser.email == email))
            if user is None:
                user = AdminUser(email=email, name=args.name, role=AdminRole(args.role), password_hash="")
                db.add(user)
            user.password_hash = hash_password(args.password)
            user.role = AdminRole(args.role)
            user.is_active = True
        print(f"Admin {email} ready ({args.role})")
        return 0

    if args.command == "import-geo":
        from app.geo.importer import import_geo

        counts = import_geo(min_population=args.min_population)
        print(f"Imported {counts}")
        return 0

    if args.command == "seed":
        from app.seed.loader import run_seed

        print(run_seed(force=args.force))
        return 0

    if args.command == "worker":
        from app.worker import main as worker_main

        return worker_main()

    return 1


if __name__ == "__main__":
    raise SystemExit(main())

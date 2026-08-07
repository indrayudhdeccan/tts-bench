#!/usr/bin/env python3
"""Apply migration 007 to Supabase. Requires DATABASE_URL in web/.env.local or env."""
from __future__ import annotations

import os
import sys
from pathlib import Path

MIGRATION = Path(__file__).resolve().parent / "supabase/migrations/007_leaderboard_public_views.sql"


def load_database_url() -> str | None:
    env_path = Path(__file__).resolve().parent / "web/.env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("DATABASE_URL")


def main() -> int:
    url = load_database_url()
    if not url:
        print("Set DATABASE_URL in web/.env.local (Supabase → Settings → Database → URI)", file=sys.stderr)
        print("\nOr paste this SQL in Supabase SQL Editor:\n")
        print(MIGRATION.read_text())
        return 1

    try:
        import psycopg2
    except ImportError:
        print("pip install psycopg2-binary", file=sys.stderr)
        return 1

    sql = MIGRATION.read_text()
    conn = psycopg2.connect(url)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.close()
    print("Applied 007_leaderboard_public_views.sql")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

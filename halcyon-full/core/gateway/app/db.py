import asyncpg
from .config import settings
_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    """Get or create database connection pool."""
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(str(settings.pg_dsn))
    return _pool


async def init_db() -> None:
    """Initialize database tables (run migrations)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Run all migrations in order
        import os
        import glob
        migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
        migration_files = sorted(glob.glob(os.path.join(migrations_dir, "*.sql")))
        for migration_path in migration_files:
            with open(migration_path, "r") as f:
                migration_sql = f.read()
            await conn.execute(migration_sql)


async def close_pool() -> None:
    """Close database connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None

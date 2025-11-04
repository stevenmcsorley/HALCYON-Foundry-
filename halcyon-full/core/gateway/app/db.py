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
        # Read migration SQL file
        import os
        migration_path = os.path.join(os.path.dirname(__file__), "migrations", "004_saved_dashboards.sql")
        if os.path.exists(migration_path):
            with open(migration_path, "r") as f:
                migration_sql = f.read()
            await conn.execute(migration_sql)


async def close_pool() -> None:
    """Close database connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None

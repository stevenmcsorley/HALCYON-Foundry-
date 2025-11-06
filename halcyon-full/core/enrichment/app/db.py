"""Database connection pool for enrichment service."""
import asyncpg
import os
from typing import Optional

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Get or create database connection pool."""
    global _pool
    if _pool is None:
        db_url = os.getenv(
            "DATABASE_URL",
            os.getenv("POSTGRES_URL", "postgresql://postgres:postgres@postgres:5432/halcyon")
        )
        _pool = await asyncpg.create_pool(db_url, min_size=2, max_size=10)
    return _pool


async def close_pool():
    """Close database connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


"""ML weights management for online learning."""
import os
import asyncpg
from typing import Dict, Optional
from .db import get_pool

MODEL_VERSION = os.getenv("ML_MODEL_VERSION", "1.0.0")
LEARNING_RATE = float(os.getenv("ML_LR", "0.05"))
MIN_WEIGHT = -3.0
MAX_WEIGHT = 3.0


async def load_weights(model_version: str = MODEL_VERSION) -> Dict[str, float]:
    """Load all weights for a model version."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT feature, weight FROM ml_weights WHERE model_version = $1",
            model_version
        )
        return {row["feature"]: float(row["weight"]) for row in rows}


async def save_weight(
    model_version: str,
    feature: str,
    weight: float,
    conn: Optional[asyncpg.Connection] = None
) -> None:
    """Save or update a weight for a feature."""
    if conn:
        await conn.execute(
            """
            INSERT INTO ml_weights (model_version, feature, weight)
            VALUES ($1, $2, $3)
            ON CONFLICT (model_version, feature)
            DO UPDATE SET weight = EXCLUDED.weight, updated_at = NOW()
            """,
            model_version, feature, weight
        )
    else:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await save_weight(model_version, feature, weight, conn)


async def apply_online_update(
    feature: str,
    reward: float,
    model_version: str = MODEL_VERSION,
    lr: float = LEARNING_RATE,
    clip: tuple[float, float] = (MIN_WEIGHT, MAX_WEIGHT)
) -> None:
    """
    Apply online learning update: weight += lr * reward, then clip.
    
    Args:
        feature: Feature name (e.g., "kw_critical")
        reward: Reward value (-1, 0, +1, or 0.5, -0.5)
        model_version: Model version (default from env)
        lr: Learning rate (default from env)
        clip: (min, max) weight bounds
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Load current weight or use 0 as default
        row = await conn.fetchrow(
            "SELECT weight FROM ml_weights WHERE model_version = $1 AND feature = $2",
            model_version, feature
        )
        current_weight = float(row["weight"]) if row else 0.0
        
        # Update: weight += lr * reward
        new_weight = current_weight + (lr * reward)
        
        # Clip to bounds
        new_weight = max(clip[0], min(clip[1], new_weight))
        
        # Save
        await save_weight(model_version, feature, new_weight, conn)


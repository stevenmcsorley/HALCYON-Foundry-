"""Background worker for processing alert action retries."""
import os
import asyncio
from .actions import retry_due_actions

INTERVAL = int(os.getenv("ACTIONS_RETRY_INTERVAL_SEC", "30"))


async def start_retry_worker():
    """Start the background retry worker loop."""
    while True:
        try:
            await retry_due_actions()
        except Exception as e:
            # Log warning but continue
            print(f"Warning: retry worker error: {e}")
        await asyncio.sleep(INTERVAL)

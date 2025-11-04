import time
import httpx
import asyncio
from typing import Dict, Any, Optional
from .repo_alerts import log_action
from .config import settings


async def exec_slack(alert_id: int, cfg: Dict[str, Any], text: str):
    """Execute Slack webhook action."""
    url = cfg.get("webhook_url") or settings.slack_webhook_url
    if not url:
        return
    
    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.post(url, json={"text": text})
            r.raise_for_status()
        await log_action(alert_id, "slack", "success", r.status_code, None, int((time.time() - t0) * 1000))
    except Exception as e:
        await log_action(alert_id, "slack", "failed", None, str(e), int((time.time() - t0) * 1000))


async def exec_webhook(alert_id: int, cfg: Dict[str, Any], payload: Dict[str, Any]):
    """Execute generic webhook action."""
    url = cfg.get("url")
    if not url:
        return
    
    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.post(url, json=payload)
            r.raise_for_status()
        await log_action(alert_id, "webhook", "success", r.status_code, None, int((time.time() - t0) * 1000))
    except Exception as e:
        await log_action(alert_id, "webhook", "failed", None, str(e), int((time.time() - t0) * 1000))


async def exec_email(alert_id: int, cfg: Dict[str, Any], text: str):
    """Execute email action (stub for future implementation)."""
    # TODO: Implement SMTP email sending
    await log_action(alert_id, "email", "failed", None, "Email action not yet implemented", None)

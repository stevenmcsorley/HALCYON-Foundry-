"""Alert action execution: Slack and Webhook delivery with retry logic."""
import os
import json
import random
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Tuple, Optional
import httpx
from .metrics import alert_notifications_total, alert_retry_total, alert_retry_exhausted_total
from .repo_alerts import (
    insert_action_log,
    select_pending_retries_update,
    mark_action_success,
    mark_action_retry,
    mark_action_failed,
    log_action,
)

logger = logging.getLogger("gateway.actions")

# Configuration from environment
BACKOFF_SERIES = [int(x) for x in os.getenv("ACTIONS_BACKOFF_MINUTES", "1,5,15,60,120,240").split(",")]
MAX_RETRIES = int(os.getenv("ACTIONS_MAX_RETRIES", "6"))
JITTER_PCT = float(os.getenv("ACTIONS_JITTER_PCT", "0.2"))


def _with_jitter(minutes: int) -> datetime:
    """Add jitter to backoff time."""
    base = minutes * 60
    jitter = base * random.uniform(-JITTER_PCT, JITTER_PCT)
    return datetime.utcnow() + timedelta(seconds=int(base + jitter))


async def _send_slack(alert: Dict[str, Any], route: Dict[str, Any]) -> Tuple[bool, str]:
    """Send alert to Slack webhook."""
    url = route.get("webhook_url") or route.get("url")
    if not url:
        return False, "missing slack webhook url"

    payload = {
        "text": f":rotating_light: {alert.get('message', 'Alert')}",
        "attachments": [{
            "fields": [
                {"title": "Severity", "value": alert.get("severity", "n/a"), "short": True},
                {"title": "Count", "value": str(alert.get("count", 1)), "short": True},
            ]
        }]
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.post(url, json=payload)
        if 200 <= r.status_code < 300:
            return True, ""
        return False, f"slack status {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, str(e)[:200]


async def _send_webhook(alert: Dict[str, Any], route: Dict[str, Any]) -> Tuple[bool, str]:
    """Send alert to generic webhook."""
    url = route.get("url")
    headers = route.get("headers") or {}
    if not url:
        return False, "missing webhook url"

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.post(url, headers=headers, json=alert)
        if 200 <= r.status_code < 300:
            return True, ""
        return False, f"webhook status {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, str(e)[:200]


async def dispatch_on_create(alert: Dict[str, Any], rule_route: Optional[Dict[str, Any]]):
    """
    Dispatch notifications on alert creation.
    Never dispatches on dedup or if alert is suppressed.
    """
    # Non-applicable: dedup or suppressed handled in resolver
    if not rule_route:
        return

    alert_id = alert.get("id")
    if not alert_id:
        return

    # Slack
    if "slack" in rule_route:
        ok, err = await _send_slack(alert, rule_route["slack"])
        status = "success" if ok else "retry"
        
        try:
            await insert_action_log(
                alert_id, "slack", status, err if not ok else None,
                0, None, {"summary": "slack create"}
            )
        except Exception as exc:  # pragma: no cover - legacy fallback
            logger.warning("Falling back to legacy alert action log for slack: %s", exc)
            await log_action(alert_id, "slack", status, error=err if not ok else None)
        
        alert_notifications_total.labels(dest="slack", status=status).inc()
        
        if not ok:
            next_at = _with_jitter(BACKOFF_SERIES[0])
            await mark_action_retry(alert_id, "slack", 1, next_at)
            alert_retry_total.labels(dest="slack").inc()

    # Webhook
    if "webhook" in rule_route:
        ok, err = await _send_webhook(alert, rule_route["webhook"])
        status = "success" if ok else "retry"
        
        try:
            await insert_action_log(
                alert_id, "webhook", status, err if not ok else None,
                0, None, {"summary": "webhook create"}
            )
        except Exception as exc:  # pragma: no cover - legacy fallback
            logger.warning("Falling back to legacy alert action log for webhook: %s", exc)
            await log_action(alert_id, "webhook", status, error=err if not ok else None)
        
        alert_notifications_total.labels(dest="webhook", status=status).inc()
        
        if not ok:
            next_at = _with_jitter(BACKOFF_SERIES[0])
            await mark_action_retry(alert_id, "webhook", 1, next_at)
            alert_retry_total.labels(dest="webhook").inc()


async def retry_due_actions():
    """Process pending retries (called by background worker)."""
    rows = await select_pending_retries_update()
    
    for row in rows:
        action_id = row["id"]
        dest = row["dest"]
        alert = row["alert"]
        retry_count = row["retry_count"]
        route = row["route"]

        # Dispatch based on destination
        if dest == "slack":
            ok, err = await _send_slack(alert, route.get("slack", {}))
        else:  # webhook
            ok, err = await _send_webhook(alert, route.get("webhook", {}))

        if ok:
            await mark_action_success(action_id)
            alert_notifications_total.labels(dest=dest, status="success").inc()
        else:
            if retry_count + 1 >= MAX_RETRIES:
                await mark_action_failed(action_id, err)
                alert_notifications_total.labels(dest=dest, status="failed").inc()
                alert_retry_exhausted_total.labels(dest=dest).inc()
            else:
                next_idx = min(retry_count + 1, len(BACKOFF_SERIES) - 1)
                next_at = _with_jitter(BACKOFF_SERIES[next_idx])
                # Find alert_id from the row
                await mark_action_retry(row["alert_id"], dest, retry_count + 1, next_at, err)
                alert_notifications_total.labels(dest=dest, status="retry").inc()
                alert_retry_total.labels(dest=dest).inc()


# Backward compatibility aliases
async def exec_slack(alert_id: int, config: Dict[str, Any], message: str):
    """Legacy function - now handled by dispatch_on_create."""
    # This is kept for backward compatibility but shouldn't be called directly
    pass


async def exec_webhook(alert_id: int, config: Dict[str, Any], payload: Dict[str, Any]):
    """Legacy function - now handled by dispatch_on_create."""
    # This is kept for backward compatibility but shouldn't be called directly
    pass

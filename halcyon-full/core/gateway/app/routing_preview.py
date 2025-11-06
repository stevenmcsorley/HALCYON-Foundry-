"""Routing preview: determine which destinations would fire for an alert."""
from typing import List, Dict, Any, Optional
from .rule_engine import is_suppressed
from .repo_suppress import list_active_silences, list_active_maintenance
from datetime import datetime


def preview_routes(
    alert: Dict[str, Any],
    rule_route: Optional[Dict[str, Any]],
    now: Optional[datetime] = None
) -> List[Dict[str, Any]]:
    """
    Preview which routes would fire for an alert.
    
    Args:
        alert: Alert dict with id, rule_id, status, suppressed_by_kind, etc.
        rule_route: Route configuration from alert_rules.route JSONB
        now: Current time (defaults to datetime.utcnow())
    
    Returns:
        List of RouteDecision dicts with:
        - dest: destination identifier (e.g., "slack", "webhook:https://...")
        - wouldSend: boolean (would this destination receive the alert?)
        - reason: string explanation
        - suppressed: boolean (is this alert suppressed?)
    """
    if now is None:
        now = datetime.utcnow()
    
    decisions = []
    
    # Check if alert is suppressed
    suppressed = False
    suppression_reason = None
    
    if alert.get("suppressed_by_kind"):
        suppressed = True
        suppression_reason = f"Suppressed by {alert.get('suppressed_by_kind')}"
    
    # Also check active silences/maintenance (if not already marked)
    if not suppressed:
        # We need to check if the alert entity would match any active suppression
        # For now, if suppressed_by_kind is not set, we assume not suppressed
        # (In a full implementation, we'd check the entity against silence/maintenance filters)
        pass
    
    if not rule_route:
        decisions.append({
            "dest": "none",
            "wouldSend": False,
            "reason": "No route configured in rule",
            "suppressed": suppressed
        })
        return decisions
    
    # Check Slack route
    if "slack" in rule_route:
        slack_config = rule_route["slack"]
        channel = slack_config.get("channel", "default")
        dest = f"slack:{channel}" if channel else "slack"
        would_send = not suppressed
        
        if suppressed:
            reason = suppression_reason or "Alert is suppressed"
        elif slack_config.get("webhook_url") or slack_config.get("url"):
            reason = f"Slack webhook configured (channel: {channel})"
        else:
            reason = "Slack route missing webhook URL"
            would_send = False
        
        decisions.append({
            "dest": dest,
            "wouldSend": would_send,
            "reason": reason,
            "suppressed": suppressed
        })
    
    # Check Webhook route
    if "webhook" in rule_route:
        webhook_config = rule_route["webhook"]
        url = webhook_config.get("url", "")
        # For retry, we need just "webhook" not the full URL
        dest = "webhook"
        would_send = not suppressed
        
        if suppressed:
            reason = suppression_reason or "Alert is suppressed"
        elif url:
            # Truncate long URLs for display
            display_url = url if len(url) <= 50 else url[:47] + "..."
            reason = f"Webhook configured: {display_url}"
        else:
            reason = "Webhook route missing URL"
            would_send = False
        
        decisions.append({
            "dest": dest,
            "wouldSend": would_send,
            "reason": reason,
            "suppressed": suppressed
        })
    
    # If no routes configured
    if not decisions:
        decisions.append({
            "dest": "none",
            "wouldSend": False,
            "reason": "No routes configured in rule",
            "suppressed": suppressed
        })
    
    return decisions


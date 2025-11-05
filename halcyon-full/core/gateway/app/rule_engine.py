from typing import Dict, Any, List, Tuple, Optional
import time
import hashlib
import json

# In-memory counters for windowed thresholds (key: (rule_id, group_value) -> list[timestamps])
WINDOW: Dict[Tuple[int, str], List[float]] = {}


def _ts() -> float:
    """Get current timestamp."""
    return time.time()


def parse_window_seconds(s: str) -> int:
    """Parse window string (e.g., '5m', '1h', '30s') to seconds."""
    if not s:
        return 0
    s = s.strip().lower()
    if s.endswith("ms"):
        return max(1, int(int(s[:-2]) / 1000))
    if s.endswith("s"):
        return int(s[:-1])
    if s.endswith("m"):
        return int(s[:-1]) * 60
    if s.endswith("h"):
        return int(s[:-1]) * 3600
    try:
        return int(s)
    except ValueError:
        return 0


def _get_path(obj: Dict[str, Any], path: str) -> Any:
    """Get nested value from object using dot-notation path."""
    cur = obj
    for p in path.split("."):
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur


def event_matches(condition: Dict[str, Any], entity: Dict[str, Any]) -> bool:
    """Check if entity matches the condition match criteria."""
    match = condition.get("match", {})
    if not match:
        return True  # No match criteria means always match
    
    for key, val in match.items():
        if key.startswith("attrs."):
            path = key.split(".", 1)[1]
            got = _get_path(entity.get("attrs", {}), path)
            if got != val:
                return False
        else:
            if entity.get(key) != val:
                return False
    return True


def within_window(rule_id: int, condition: Dict[str, Any], entity: Dict[str, Any]) -> bool:
    """Check if threshold is met within the time window."""
    window_s = parse_window_seconds(condition.get("window", "0"))
    if window_s <= 0:
        return True  # No window means immediate trigger
    
    group_field = condition.get("group_by")
    if group_field:
        # Support both "source" and "attrs.source" paths
        if group_field.startswith("attrs."):
            group_val = _get_path(entity.get("attrs", {}), group_field.split(".", 1)[1])
        else:
            group_val = entity.get(group_field) or _get_path(entity.get("attrs", {}), group_field)
    else:
        group_val = "_"
    if group_field and group_val is None:
        # If group_by field doesn't exist, can't group, so skip
        return False
    
    key = (rule_id, str(group_val))
    now = _ts()
    hist = WINDOW.setdefault(key, [])
    hist.append(now)
    
    # Prune old timestamps
    cutoff = now - window_s
    WINDOW[key] = [t for t in hist if t >= cutoff]
    
    threshold = max(1, int(condition.get("threshold", 1)))
    return len(WINDOW[key]) >= threshold


def render_message(condition: Dict[str, Any], entity: Dict[str, Any]) -> str:
    """Render alert message with template variables."""
    msg = condition.get("message") or "Rule triggered"
    
    # Naive ${path} replacement across entity
    while "${" in msg:
        s = msg.find("${") + 2
        e = msg.find("}", s)
        if e == -1:
            break
        path = msg[s:e]
        val = _get_path(entity, path)
        msg = msg.replace("${" + path + "}", "" if val is None else str(val))
    
    return msg


def render_fingerprint(template: Optional[str], entity: Dict[str, Any], condition: Dict[str, Any]) -> str:
    """Render fingerprint from template, or generate fallback hash from key attrs."""
    if template:
        # Render template with ${path} replacement (same logic as render_message)
        fp = template
        while "${" in fp:
            s = fp.find("${") + 2
            e = fp.find("}", s)
            if e == -1:
                break
            path = fp[s:e]
            val = _get_path(entity, path)
            fp = fp.replace("${" + path + "}", "" if val is None else str(val))
        return fp
    
    # Fallback: hash of type + key attrs from match condition
    match = condition.get("match", {})
    key_attrs = [entity.get("type", "")]
    for key in sorted(match.keys()):
        if key.startswith("attrs."):
            path = key.split(".", 1)[1]
            val = _get_path(entity.get("attrs", {}), path)
        else:
            val = entity.get(key)
        key_attrs.append(str(val))
    
    h = hashlib.sha256(":".join(key_attrs).encode()).hexdigest()[:16]
    return f"{entity.get('type', 'unknown')}:{h}"


def compute_group_key(correlation_keys: Optional[List[str]], entity: Dict[str, Any]) -> Optional[str]:
    """Compute group_key from correlation_keys list."""
    if not correlation_keys:
        return None
    
    values = []
    for key in correlation_keys:
        if key.startswith("attrs."):
            path = key.split(".", 1)[1]
            val = _get_path(entity.get("attrs", {}), path)
        else:
            val = entity.get(key)
        if val is None:
            return None  # Can't group if any key is missing
        values.append(str(val))
    
    return ":".join(values)


def should_dedupe(existing_alert: Dict[str, Any], mute_seconds: int, now: float) -> bool:
    """Check if alert should be deduped based on mute window."""
    if mute_seconds <= 0:
        return False  # No mute window means never dedupe
    
    if existing_alert.get("status") != "open":
        return False  # Only dedupe open alerts
    
    # Check if within mute window
    last_seen_str = existing_alert.get("last_seen")
    if not last_seen_str:
        return False  # No last_seen means can't check
    
    try:
        # Parse ISO timestamp
        from datetime import datetime
        if isinstance(last_seen_str, str):
            last_seen_dt = datetime.fromisoformat(last_seen_str.replace('Z', '+00:00'))
            last_seen_ts = last_seen_dt.timestamp()
        else:
            last_seen_ts = float(last_seen_str)
        
        age = now - last_seen_ts
        return age < mute_seconds
    except (ValueError, TypeError):
        return False  # Can't parse timestamp, don't dedupe


def matches_filter(entity: Dict[str, Any], match_json: Dict[str, Any]) -> bool:
    """
    Check if entity matches a filter (silence/maintenance match_json).
    Supports:
    - Exact string/number/boolean matches
    - Arrays: value in array
    - Dot-paths: "attrs.source" → nested lookup
    """
    for key, expected_value in match_json.items():
        # Handle dot-path (e.g., "attrs.source")
        if "." in key:
            parts = key.split(".")
            value = entity
            for part in parts:
                if isinstance(value, dict):
                    value = value.get(part)
                else:
                    value = None
                    break
        else:
            value = entity.get(key)

        # Compare values
        if expected_value is None:
            if value is not None:
                return False
        elif isinstance(expected_value, list):
            # Array: value must be in the list
            if value not in expected_value:
                return False
        else:
            # Exact match
            if value != expected_value:
                return False

    return True


async def is_suppressed(entity: Dict[str, Any], now: Optional[float] = None) -> Optional[Dict[str, Any]]:
    """
    Check if entity is suppressed by an active silence or maintenance window.
    Returns None if not suppressed, or {kind, id, name} if suppressed.
    Prefers silences over maintenance if both match.
    """
    from .repo_suppress import list_active_silences, list_active_maintenance
    from datetime import datetime

    if now is None:
        now_dt = datetime.utcnow()
    else:
        now_dt = datetime.fromtimestamp(now)

    # Check silences first (preferred over maintenance)
    silences = await list_active_silences(now_dt)
    for silence in silences:
        if matches_filter(entity, silence["match_json"]):
            return {
                "kind": "silence",
                "id": silence["id"],
                "name": silence["name"]
            }

    # Check maintenance windows
    maintenance = await list_active_maintenance(now_dt)
    for maint in maintenance:
        if matches_filter(entity, maint["match_json"]):
            return {
                "kind": "maintenance",
                "id": maint["id"],
                "name": maint["name"]
            }

    return None

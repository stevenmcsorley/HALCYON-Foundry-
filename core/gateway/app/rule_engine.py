from typing import Dict, Any, List, Tuple
import time

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

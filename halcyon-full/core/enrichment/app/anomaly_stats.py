from typing import Dict, List, Tuple, Any
from collections import deque
from datetime import datetime, timedelta
import statistics
import logging

logger = logging.getLogger("enrichment.anomaly_stats")


class RollingStats:
    """Maintain rolling statistics (mean, std) for a time window."""
    
    def __init__(self, window_seconds: int = 300):
        self.window_seconds = window_seconds
        self.values: deque = deque(maxlen=1000)  # Limit memory
        self.timestamps: deque = deque(maxlen=1000)
    
    def add(self, value: float, timestamp: datetime = None) -> None:
        """Add a value with optional timestamp."""
        if timestamp is None:
            timestamp = datetime.utcnow()
        self.values.append(value)
        self.timestamps.append(timestamp)
        self._expire_old()
    
    def _expire_old(self) -> None:
        """Remove values older than the window."""
        if not self.timestamps:
            return
        cutoff = datetime.utcnow() - timedelta(seconds=self.window_seconds)
        while self.timestamps and self.timestamps[0] < cutoff:
            self.timestamps.popleft()
            self.values.popleft()
    
    def get_stats(self) -> Tuple[float, float]:
        """Get (mean, std) of values in window."""
        self._expire_old()
        if len(self.values) < 2:
            return (0.0, 1.0)  # Default to avoid division by zero
        try:
            mean = statistics.mean(self.values)
            std = statistics.stdev(self.values) if len(self.values) > 1 else 1.0
            return (mean, std)
        except Exception as e:
            logger.error(f"Error calculating stats: {e}")
            return (0.0, 1.0)
    
    def zscore(self, value: float) -> float:
        """Calculate z-score for a value."""
        mean, std = self.get_stats()
        if std == 0:
            return 0.0
        return (value - mean) / std


class AnomalyStatsTracker:
    """Track rolling statistics per key for anomaly detection."""
    
    def __init__(self):
        # {key: RollingStats}
        self.stats: Dict[str, RollingStats] = {}
        # Window mapping: "5m" -> 300 seconds
        self.window_map = {
            "1m": 60,
            "5m": 300,
            "15m": 900,
            "1h": 3600,
        }
    
    def get_key(self, rule_name: str, entity: Dict[str, Any]) -> str:
        """Generate a unique key for tracking stats per rule+entity combination."""
        # Use rule name + entity type as key
        return f"{rule_name}:{entity.get('type', 'unknown')}"
    
    def parse_window(self, window_str: str) -> int:
        """Parse window string like '5m' to seconds."""
        if window_str.endswith("m"):
            return int(window_str[:-1]) * 60
        elif window_str.endswith("h"):
            return int(window_str[:-1]) * 3600
        elif window_str.endswith("s"):
            return int(window_str[:-1])
        else:
            return self.window_map.get(window_str, 300)
    
    def add_event(self, rule_name: str, entity: Dict[str, Any], window: str = "5m") -> None:
        """Add an event to the rolling stats for a rule."""
        key = self.get_key(rule_name, entity)
        window_seconds = self.parse_window(window)
        
        if key not in self.stats:
            self.stats[key] = RollingStats(window_seconds=window_seconds)
        
        # Count as 1 (increment count)
        self.stats[key].add(1.0)
    
    def check_zscore(self, rule_name: str, entity: Dict[str, Any], threshold: float = 3.0) -> Tuple[bool, float]:
        """Check if current z-score exceeds threshold."""
        key = self.get_key(rule_name, entity)
        if key not in self.stats:
            return (False, 0.0)
        
        # Get current count for z-score calculation
        stats = self.stats[key]
        mean, std = stats.get_stats()
        current_count = len(stats.values)
        
        z = stats.zscore(current_count)
        return (z > threshold, z)

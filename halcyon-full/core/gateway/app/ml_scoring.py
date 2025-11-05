"""ML Scoring Engine for Case Priority, Owner, and Similarity Suggestions."""
import time
from typing import List, Dict, Any, Tuple, Optional
from .metrics import ml_inference_total, ml_inference_latency_seconds, ml_model_version_info

MODEL_NAME = "case_scoring"
MODEL_VERSION = "1.0.0"

# Set model version info
ml_model_version_info.labels(model=MODEL_NAME, version=MODEL_VERSION).set(1)


def _simple_tokenize(s: str) -> List[str]:
    """Tokenize text into lowercase words."""
    return [t.lower() for t in (s or "").split() if t]


def _score_priority(text: str, severity: Optional[str] = None) -> Tuple[str, float]:
    """
    Heuristic priority scoring:
    - Presence of keywords boosts score: critical, outage, breach, fail, error
    - Severity hint boosts: high/critical
    """
    tokens = set(_simple_tokenize(text))
    base = 0.2

    for kw in ["critical", "outage", "breach", "incident", "failure", "failed", "error"]:
        if kw in tokens:
            base += 0.15

    if severity in ("high", "critical"):
        base += 0.25

    score = max(0.0, min(base, 1.0))

    if score >= 0.85:
        return "critical", score
    if score >= 0.65:
        return "high", score
    if score >= 0.4:
        return "medium", score
    return "low", score


def _suggest_owner(history_counts: Dict[str, int]) -> Optional[str]:
    """Pick most frequent historical resolver."""
    if not history_counts:
        return None
    return max(history_counts.items(), key=lambda x: x[1])[0]


def _similar_cases(current_title: str, candidates: List[Dict[str, Any]], k: int = 3) -> List[int]:
    """Find similar cases using Jaccard similarity on tokenized titles."""
    ctoks = set(_simple_tokenize(current_title))
    scored = []

    for c in candidates:
        toks = set(_simple_tokenize(c.get("title", "")))
        intersection = len(ctoks & toks)
        union = len(ctoks | toks)
        jacc = intersection / max(1, union)
        scored.append((c["id"], jacc))

    scored.sort(key=lambda x: x[1], reverse=True)
    return [cid for cid, sim in scored[:k] if sim >= 0.2]


def score_case(
    title: str,
    severity: Optional[str] = None,
    history_owner_counts: Optional[Dict[str, int]] = None,
    similar_candidates: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Score a case and return ML suggestions.
    
    Args:
        title: Case title
        severity: Optional severity hint
        history_owner_counts: Dict mapping owner -> count for historical cases
        similar_candidates: List of candidate cases for similarity matching
        
    Returns:
        Dict with priority_suggestion, priority_score, owner_suggestion,
        similar_case_ids, and ml_version
    """
    t0 = time.time()
    history_owner_counts = history_owner_counts or {}
    similar_candidates = similar_candidates or []

    try:
        priority_suggestion, pr_score = _score_priority(title, severity)
        owner_suggestion = _suggest_owner(history_owner_counts)
        similar_ids = _similar_cases(title, similar_candidates)

        ml_inference_total.labels(model=MODEL_NAME, status="success").inc()

        return {
            "priority_suggestion": priority_suggestion,
            "priority_score": pr_score,
            "owner_suggestion": owner_suggestion,
            "similar_case_ids": similar_ids,
            "ml_version": MODEL_VERSION,
        }
    except Exception:
        ml_inference_total.labels(model=MODEL_NAME, status="fail").inc()
        raise
    finally:
        ml_inference_latency_seconds.labels(model=MODEL_NAME).observe(time.time() - t0)


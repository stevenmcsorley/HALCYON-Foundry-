"""ML Scoring Engine for Case Priority, Owner, and Similarity Suggestions."""
import time
from typing import List, Dict, Any, Tuple, Optional
from .metrics import ml_inference_total, ml_inference_latency_seconds, ml_model_version_info
from .ml_weights import load_weights, MODEL_VERSION

MODEL_NAME = "case_scoring"

# Set model version info
ml_model_version_info.labels(model=MODEL_NAME, version=MODEL_VERSION).set(1)


def _simple_tokenize(s: str) -> List[str]:
    """Tokenize text into lowercase words."""
    return [t.lower() for t in (s or "").split() if t]


def _score_priority(
    text: str,
    severity: Optional[str] = None,
    weights: Optional[Dict[str, float]] = None
) -> Tuple[str, float, List[str]]:
    """
    Heuristic priority scoring with optional weights for online learning.
    
    Returns:
        Tuple of (priority, score, reasons)
    """
    tokens = set(_simple_tokenize(text))
    base = 0.2
    reasons = []
    weights = weights or {}

    # Keyword-based scoring with weights
    keyword_weights = {
        "critical": weights.get("kw_critical", 0.15),
        "outage": weights.get("kw_high", 0.15),
        "breach": weights.get("kw_breach", 0.15),
        "incident": weights.get("kw_high", 0.15),
        "failure": weights.get("kw_failure", 0.15),
        "failed": weights.get("kw_failure", 0.15),
        "error": weights.get("kw_failure", 0.15),
    }

    for kw, weight in keyword_weights.items():
        if kw in tokens:
            boost = weight * 0.5  # Scale weight to reasonable boost
            base += boost
            if boost > 0:
                reasons.append(f"Contains '{kw}' keyword")

    if severity in ("high", "critical"):
        base += 0.25
        reasons.append(f"Severity hint: {severity}")

    score = max(0.0, min(base, 1.0))

    if score >= 0.85:
        return "critical", score, reasons
    if score >= 0.65:
        return "high", score, reasons
    if score >= 0.4:
        return "medium", score, reasons
    return "low", score, reasons


def _suggest_owner(
    history_counts: Dict[str, int],
    weights: Optional[Dict[str, float]] = None
) -> Tuple[Optional[str], List[str]]:
    """
    Pick most frequent historical resolver with optional weights.
    
    Returns:
        Tuple of (owner, reasons)
    """
    if not history_counts:
        return None, []
    
    weights = weights or {}
    base_weight = weights.get("owner_history_base", 1.0)
    
    # Weight each owner by their history count and feature weight
    scored = []
    for owner, count in history_counts.items():
        owner_feature = f"owner_{owner.replace('@', '_').replace('.', '_')}_history"
        owner_weight = weights.get(owner_feature, base_weight)
        score = count * owner_weight
        scored.append((owner, score, count))
    
    if not scored:
        return None, []
    
    owner, score, count = max(scored, key=lambda x: x[1])
    reasons = [f"Resolved {count} similar cases"]
    return owner, reasons


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


async def score_case(
    title: str,
    severity: Optional[str] = None,
    history_owner_counts: Optional[Dict[str, int]] = None,
    similar_candidates: Optional[List[Dict[str, Any]]] = None,
    use_weights: bool = True,
) -> Dict[str, Any]:
    """
    Score a case and return ML suggestions with weights support.
    
    Args:
        title: Case title
        severity: Optional severity hint
        history_owner_counts: Dict mapping owner -> count for historical cases
        similar_candidates: List of candidate cases for similarity matching
        use_weights: Whether to load and use learned weights
        
    Returns:
        Dict with priority_suggestion, priority_score, owner_suggestion,
        similar_case_ids, ml_version, and reasons (for explainability)
    """
    t0 = time.time()
    history_owner_counts = history_owner_counts or {}
    similar_candidates = similar_candidates or []
    
    weights = {}
    if use_weights:
        try:
            weights = await load_weights()
        except Exception:
            # If weights fail to load, continue with defaults
            pass

    try:
        priority_suggestion, pr_score, priority_reasons = _score_priority(title, severity, weights)
        owner_suggestion, owner_reasons = _suggest_owner(history_owner_counts, weights)
        similar_ids = _similar_cases(title, similar_candidates)
        
        # Combine reasons for explainability
        reasons = priority_reasons + owner_reasons

        ml_inference_total.labels(model=MODEL_NAME, status="success").inc()

        return {
            "priority_suggestion": priority_suggestion,
            "priority_score": pr_score,
            "owner_suggestion": owner_suggestion,
            "similar_case_ids": similar_ids,
            "ml_version": MODEL_VERSION,
            "reasons": reasons,
        }
    except Exception:
        ml_inference_total.labels(model=MODEL_NAME, status="fail").inc()
        raise
    finally:
        ml_inference_latency_seconds.labels(model=MODEL_NAME).observe(time.time() - t0)


def explain(features: Dict[str, Any]) -> List[str]:
    """
    Generate human-readable explanation from features used in scoring.
    
    Args:
        features: Dict with 'priority_reasons', 'owner_reasons', etc.
        
    Returns:
        List of explanation strings
    """
    reasons = []
    if "priority_reasons" in features:
        reasons.extend(features["priority_reasons"])
    if "owner_reasons" in features:
        reasons.extend(features["owner_reasons"])
    return reasons


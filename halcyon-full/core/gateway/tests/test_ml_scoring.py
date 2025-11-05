"""Tests for ML scoring engine."""
import pytest
from app.ml_scoring import _score_priority, _suggest_owner, _similar_cases, score_case


def test_score_priority_critical():
    """Test priority scoring for critical cases."""
    priority, score = _score_priority("Critical outage in production", None)
    assert priority == "critical"
    assert score >= 0.85


def test_score_priority_high():
    """Test priority scoring for high cases."""
    priority, score = _score_priority("Login failure detected", None)
    assert priority in ["high", "critical"]
    assert score >= 0.4


def test_score_priority_medium():
    """Test priority scoring for medium cases."""
    priority, score = _score_priority("Minor issue with widget", None)
    assert priority in ["low", "medium", "high"]
    assert score >= 0.0


def test_score_priority_with_severity():
    """Test priority scoring with severity hint."""
    priority, score = _score_priority("Some issue", "high")
    assert score >= 0.2 + 0.25  # base + severity boost


def test_suggest_owner():
    """Test owner suggestion from history."""
    history = {"alice@example.com": 10, "bob@example.com": 5}
    owner = _suggest_owner(history)
    assert owner == "alice@example.com"


def test_suggest_owner_empty():
    """Test owner suggestion with empty history."""
    owner = _suggest_owner({})
    assert owner is None


def test_similar_cases():
    """Test similarity matching."""
    candidates = [
        {"id": 1, "title": "Login failure in production"},
        {"id": 2, "title": "Database connection timeout"},
        {"id": 3, "title": "Login error on staging"},
    ]
    current = "Login failure detected"
    similar = _similar_cases(current, candidates, k=2)
    assert len(similar) <= 2
    assert 1 in similar or 3 in similar  # Should match "Login" keyword


def test_similar_cases_threshold():
    """Test similarity threshold filtering."""
    candidates = [
        {"id": 1, "title": "Completely different topic"},
    ]
    current = "Login failure"
    similar = _similar_cases(current, candidates, k=3)
    # Should filter out low similarity matches (< 0.2)
    assert len(similar) == 0 or all(sim >= 0.2 for sim in similar)


def test_score_case_full():
    """Test full case scoring."""
    history = {"alice@example.com": 10}
    candidates = [
        {"id": 1, "title": "Similar case title"},
    ]
    result = score_case(
        "Critical outage in production",
        "high",
        history,
        candidates,
    )
    assert "priority_suggestion" in result
    assert "owner_suggestion" in result
    assert "similar_case_ids" in result
    assert "ml_version" in result
    assert result["priority_suggestion"] in ["low", "medium", "high", "critical"]
    assert result["owner_suggestion"] == "alice@example.com"
    assert isinstance(result["similar_case_ids"], list)


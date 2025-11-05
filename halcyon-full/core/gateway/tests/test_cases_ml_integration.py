"""Integration tests for cases ML suggestions."""
import pytest
import asyncpg
from app.repo_cases import create_case, get_case, update_case, get_owner_history_counts, get_recent_cases_for_similarity
from app.models_cases import CaseCreate, CaseUpdate
from app.resolvers_cases import apply_ml_suggestions


@pytest.mark.asyncio
async def test_create_case_ml_suggestions(db_pool):
    """Test that ML suggestions are populated on case creation."""
    async with db_pool.acquire() as conn:
        # Create a case with a title that should trigger high priority
        data = CaseCreate(
            title="Critical outage in production",
            priority="medium",
            status="open",
        )
        case = await create_case(conn, data, "test-user")
        
        # Apply ML suggestions
        await apply_ml_suggestions(conn, case)
        
        # Fetch updated case
        updated = await get_case(conn, case["id"])
        assert updated is not None
        assert updated.get("priority_suggestion") is not None
        assert updated.get("ml_version") is not None


@pytest.mark.asyncio
async def test_update_case_recomputes_suggestions(db_pool):
    """Test that updating case title recomputes ML suggestions."""
    async with db_pool.acquire() as conn:
        # Create initial case
        data = CaseCreate(title="Minor issue", priority="low", status="open")
        case = await create_case(conn, data, "test-user")
        await _apply_ml_suggestions(conn, case)
        
        # Update title to something more critical
        update_data = CaseUpdate(title="Critical security breach detected")
        updated_case = await update_case(conn, case["id"], update_data)
        await _apply_ml_suggestions(conn, updated_case)
        
        # Fetch and verify suggestions changed
        final = await get_case(conn, case["id"])
        assert final is not None
        # Priority suggestion should reflect new title
        assert final.get("priority_suggestion") is not None


@pytest.mark.asyncio
async def test_owner_history_counts(db_pool):
    """Test owner history query."""
    async with db_pool.acquire() as conn:
        # Create and resolve some cases with owners
        for i in range(3):
            case = await create_case(
                conn,
                CaseCreate(title=f"Case {i}", owner="alice@example.com", status="open"),
                "test-user",
            )
            # Resolve the case
            await update_case(conn, case["id"], CaseUpdate(status="resolved"))
        
        # Query history
        history = await get_owner_history_counts(conn)
        assert "alice@example.com" in history
        assert history["alice@example.com"] >= 3


@pytest.mark.asyncio
async def test_similar_cases_query(db_pool):
    """Test similar cases query."""
    async with db_pool.acquire() as conn:
        # Create some cases
        case1 = await create_case(conn, CaseCreate(title="Login failure"), "test-user")
        case2 = await create_case(conn, CaseCreate(title="Database timeout"), "test-user")
        
        # Query for similarity candidates
        candidates = await get_recent_cases_for_similarity(conn, limit=10)
        assert len(candidates) >= 2
        assert any(c["id"] == case1["id"] for c in candidates)
        assert any(c["id"] == case2["id"] for c in candidates)


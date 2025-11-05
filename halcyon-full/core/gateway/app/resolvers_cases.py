"""GraphQL resolvers for Cases & Ownership."""
from ariadne import QueryType, MutationType
from .db import get_pool
from .repo_cases import (
    create_case, update_case, get_case, list_cases,
    add_case_note, list_case_notes, assign_alerts_to_case,
    get_owner_history_counts, get_recent_cases_for_similarity
)
from .models_cases import CaseCreate, CaseUpdate, CaseNoteCreate
from .ml_scoring import score_case
from .ws_pubsub import hub
from .metrics import cases_created_total, cases_resolved_total, alerts_assigned_to_case_total
import logging
import json

logger = logging.getLogger(__name__)

cases_query = QueryType()
cases_mutation = MutationType()


async def apply_ml_suggestions(conn, case_row):
    """Apply ML suggestions to a case."""
    try:
        history = await get_owner_history_counts(conn)
        sims = await get_recent_cases_for_similarity(conn)
        
        # Get severity from case if available (from alerts)
        severity = None  # Could be extracted from linked alerts if needed
        
        suggestions = score_case(
            case_row["title"],
            severity,
            history,
            sims,
        )
        
        await conn.execute(
            """
            UPDATE cases
            SET priority_suggestion = $1,
                owner_suggestion = $2,
                similar_case_ids = $3,
                ml_version = $4
            WHERE id = $5
            """,
            suggestions["priority_suggestion"],
            suggestions["owner_suggestion"],
            json.dumps(suggestions["similar_case_ids"]),
            suggestions["ml_version"],
            case_row["id"],
        )
        
        return suggestions
    except Exception as e:
        logger.warning("ml_suggestion_failed", extra={"case_id": case_row.get("id"), "error": str(e)})
        return None


@cases_query.field("cases")
async def resolve_cases(
    obj, info,
    status: str | None = None,
    owner: str | None = None,
    priority: str | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """List cases with filters."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        cases = await list_cases(conn, status, owner, priority, search, limit, offset)
        return cases


@cases_query.field("case")
async def resolve_case(obj, info, id: int):
    """Get a case by ID."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        case = await get_case(conn, id)
        return case


@cases_mutation.field("createCase")
async def resolve_create_case(obj, info, input: dict):
    """Create a new case."""
    user = info.context.get("user", {})
    pool = await get_pool()
    async with pool.acquire() as conn:
        data = CaseCreate(**input)
        case = await create_case(conn, data, user.get("sub"))
        cases_created_total.labels(priority=case["priority"]).inc()
        
        # Apply ML suggestions
        await apply_ml_suggestions(conn, case)
        
        # Fetch updated case with ML suggestions
        case = await get_case(conn, case["id"])
        
        logger.info("case_created", extra={"case_id": case["id"], "created_by": user.get("sub")})
        return case


@cases_mutation.field("updateCase")
async def resolve_update_case(obj, info, id: int, input: dict):
    """Update a case."""
    user = info.context.get("user", {})
    pool = await get_pool()
    async with pool.acquire() as conn:
        data = CaseUpdate(**input)
        case = await update_case(conn, id, data)
        if not case:
            return None
        
        # Recompute ML suggestions if title, priority, or status changed
        if data.title or data.priority or data.status:
            await apply_ml_suggestions(conn, case)
            # Fetch updated case with ML suggestions
            case = await get_case(conn, id)
        
        # Increment resolved metric if status changed to resolved|closed
        if data.status and data.status in ("resolved", "closed"):
            cases_resolved_total.inc()
        
        logger.info("case_updated", extra={"case_id": id, "updated_by": user.get("sub")})
        return case


@cases_mutation.field("addCaseNote")
async def resolve_add_case_note(obj, info, caseId: int, body: str):
    """Add a note to a case."""
    user = info.context.get("user", {})
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify case exists
        case = await get_case(conn, caseId)
        if not case:
            return None
        
        data = CaseNoteCreate(body=body)
        note = await add_case_note(conn, caseId, data, user.get("sub"))
        logger.info("case_note_added", extra={"case_id": caseId, "note_id": note["id"], "author": user.get("sub")})
        return note


@cases_mutation.field("assignAlertsToCase")
async def resolve_assign_alerts_to_case(obj, info, caseId: int, alertIds: list[int]):
    """Assign alerts to a case."""
    user = info.context.get("user", {})
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify case exists
        case = await get_case(conn, caseId)
        if not case:
            return False
        
        count = await assign_alerts_to_case(conn, caseId, alertIds)
        
        # Emit WebSocket updates for assigned alerts
        from .repo_alerts import get_alert
        for alert_id in alertIds:
            alert = await get_alert(conn, alert_id)
            if alert:
                await hub.publish({
                    "t": "alert.updated",
                    "data": {
                        "id": alert_id,
                        "case_id": caseId,
                        **alert,
                    },
                })
        
        alerts_assigned_to_case_total.inc(count)
        logger.info("alerts_assigned_to_case", extra={
            "case_id": caseId,
            "alert_count": count,
            "assigned_by": user.get("sub"),
        })
        return True


@cases_mutation.field("adoptPrioritySuggestion")
async def resolve_adopt_priority_suggestion(obj, info, caseId: int):
    """Adopt ML-suggested priority for a case."""
    user = info.context.get("user", {})
    pool = await get_pool()
    async with pool.acquire() as conn:
        case = await get_case(conn, caseId)
        if not case:
            return None
        
        if not case.get("priority_suggestion"):
            return None
        
        # Update case with suggested priority
        updated = await update_case(conn, caseId, CaseUpdate(priority=case["priority_suggestion"]))
        if not updated:
            return None
        
        from .metrics import ml_suggestion_applied_total
        ml_suggestion_applied_total.labels(type="priority").inc()
        logger.info("ml_suggestion_adopted", extra={
            "case_id": caseId,
            "type": "priority",
            "value": case["priority_suggestion"],
            "adopted_by": user.get("sub"),
        })
        
        # Fetch updated case
        case = await get_case(conn, caseId)
        return case


@cases_mutation.field("adoptOwnerSuggestion")
async def resolve_adopt_owner_suggestion(obj, info, caseId: int):
    """Adopt ML-suggested owner for a case."""
    user = info.context.get("user", {})
    pool = await get_pool()
    async with pool.acquire() as conn:
        case = await get_case(conn, caseId)
        if not case:
            return None
        
        if not case.get("owner_suggestion"):
            return None
        
        # Update case with suggested owner
        updated = await update_case(conn, caseId, CaseUpdate(owner=case["owner_suggestion"]))
        if not updated:
            return None
        
        from .metrics import ml_suggestion_applied_total
        ml_suggestion_applied_total.labels(type="owner").inc()
        logger.info("ml_suggestion_adopted", extra={
            "case_id": caseId,
            "type": "owner",
            "value": case["owner_suggestion"],
            "adopted_by": user.get("sub"),
        })
        
        # Fetch updated case
        case = await get_case(conn, caseId)
        return case

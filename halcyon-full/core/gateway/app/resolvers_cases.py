"""GraphQL resolvers for Cases & Ownership."""
from ariadne import QueryType, MutationType
from .db import get_pool
from .repo_cases import (
    create_case, update_case, get_case, list_cases,
    add_case_note, list_case_notes, assign_alerts_to_case
)
from .models_cases import CaseCreate, CaseUpdate, CaseNoteCreate
from .ws_pubsub import hub
from .metrics import cases_created_total, cases_resolved_total, alerts_assigned_to_case_total
import logging

logger = logging.getLogger(__name__)

cases_query = QueryType()
cases_mutation = MutationType()


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

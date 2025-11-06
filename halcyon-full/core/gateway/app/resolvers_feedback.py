"""GraphQL resolvers for ML feedback."""
from ariadne import QueryType, MutationType
from .db import get_pool
from .ml_feedback import record_feedback, get_case_feedback
from .repo_feedback import get_feedback_by_case
import os

ML_ENABLE_FEEDBACK = os.getenv("ML_ENABLE_FEEDBACK", "true").lower() == "true"

feedback_query = QueryType()
feedback_mutation = MutationType()


@feedback_query.field("feedbackByCase")
async def resolve_feedback_by_case(obj, info, caseId: int):
    """Get feedback events for a case (viewer+)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        feedback = await get_feedback_by_case(conn, caseId)
        return feedback


@feedback_mutation.field("provideFeedback")
async def resolve_provide_feedback(obj, info, input: dict):
    """
    Record feedback on a case suggestion (analyst|admin).
    
    Requires ML_ENABLE_FEEDBACK=true (env var).
    """
    if not ML_ENABLE_FEEDBACK:
        raise ValueError("ML feedback is disabled")
    
    # User is already in context (set by get_context in main.py)
    user = info.context.get("user", {})
    user_id = user.get("sub")
    roles = user.get("roles", [])
    
    # RBAC: analyst or admin required
    if not any(r in roles for r in ["analyst", "admin"]):
        raise PermissionError("Analyst or admin role required")
    
    # Convert enum strings to lowercase
    suggestion_type = input["suggestionType"].lower()
    action = input["action"].lower()
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        feedback = await record_feedback(
            input["caseId"],
            suggestion_type,
            input["suggestedValue"],
            input.get("finalValue"),
            action,
            input.get("score"),
            user_id,
            conn
        )
        
        # Convert back to GraphQL enum format for response
        return {
            "id": feedback["id"],
            "caseId": feedback["case_id"],
            "suggestionType": feedback["suggestion_type"].upper(),
            "suggestedValue": feedback["suggested_value"],
            "finalValue": feedback["final_value"],
            "action": feedback["action"].upper(),
            "score": feedback["score"],
            "userId": feedback["user_id"],
            "createdAt": feedback["created_at"].isoformat() if feedback.get("created_at") else ""
        }


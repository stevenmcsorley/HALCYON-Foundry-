from __future__ import annotations

from ariadne import QueryType, MutationType

from .repo_bindings import (
    list_bindings,
    create_binding,
    update_binding,
    delete_binding,
    get_binding,
)
from .autorun import preview_bindings, run_binding, get_audit_for_alert
from .config import settings

bindings_query = QueryType()
bindings_mutation = MutationType()


def _get_user(context):
    return context.get("user", {"roles": settings.default_roles})


def _require_roles(context, allowed):
    user = _get_user(context)
    roles = user.get("roles", [])
    return any(r in allowed for r in roles)


def _binding_to_graphql(binding):
    return {
        "id": binding.get("id"),
        "ruleId": binding.get("rule_id"),
        "playbookId": binding.get("playbook_id"),
        "mode": binding.get("mode"),
        "matchTypes": binding.get("match_types") or [],
        "matchSeverities": binding.get("match_severities") or [],
        "matchTags": binding.get("match_tags") or [],
        "maxPerMinute": binding.get("max_per_minute"),
        "maxConcurrent": binding.get("max_concurrent"),
        "dailyQuota": binding.get("daily_quota"),
        "enabled": binding.get("enabled", True),
        "createdBy": binding.get("created_by"),
        "createdAt": binding.get("created_at"),
        "updatedAt": binding.get("updated_at"),
    }


def _audit_to_graphql(audit):
    audit_id = audit.get("id")
    if audit_id is None:
        binding_id = audit.get("bindingId") or audit.get("binding_id") or "preview"
        decision = audit.get("decision", "preview")
        audit_id = f"preview-{binding_id}-{decision}"
    return {
        "id": str(audit_id),
        "alertId": audit.get("alertId") or audit.get("alert_id"),
        "bindingId": audit.get("bindingId") or audit.get("binding_id"),
        "playbookId": audit.get("playbookId") or audit.get("playbook_id"),
        "mode": audit.get("mode"),
        "decision": audit.get("decision"),
        "reason": audit.get("reason"),
        "requestedBy": audit.get("requestedBy") or audit.get("requested_by"),
        "startedAt": audit.get("startedAt") or audit.get("started_at"),
        "finishedAt": audit.get("finishedAt") or audit.get("finished_at"),
        "success": audit.get("success"),
        "outputRef": audit.get("outputRef") or audit.get("output_ref"),
    }


@bindings_query.field("playbookBindings")
async def resolve_playbook_bindings(_, info, ruleId=None, enabled=None, mode=None):
    bindings = await list_bindings(rule_id=ruleId, enabled=enabled, mode=mode)
    return [_binding_to_graphql(b) for b in bindings]


@bindings_query.field("playbookRunAudit")
async def resolve_playbook_run_audit(_, info, alertId):
    audits = await get_audit_for_alert(alertId)
    return [_audit_to_graphql(a) for a in audits]


@bindings_mutation.field("createPlaybookBinding")
async def resolve_create_binding(_, info, input):
    if not _require_roles(info.context, ["analyst", "admin"]):
        raise ValueError("Insufficient permissions")
    user = _get_user(info.context)
    binding = await create_binding(
        {
            "tenant_id": None,
            "rule_id": input.get("ruleId"),
            "playbook_id": input["playbookId"],
            "mode": input["mode"],
            "match_types": input.get("matchTypes"),
            "match_severities": input.get("matchSeverities"),
            "match_tags": input.get("matchTags"),
            "max_per_minute": input.get("maxPerMinute", 30),
            "max_concurrent": input.get("maxConcurrent", 5),
            "daily_quota": input.get("dailyQuota", 500),
            "enabled": input.get("enabled", True),
        },
        created_by=user.get("sub", "system"),
    )
    return _binding_to_graphql(binding)


@bindings_mutation.field("updatePlaybookBinding")
async def resolve_update_binding(_, info, id, input):
    if not _require_roles(info.context, ["analyst", "admin"]):
        raise ValueError("Insufficient permissions")
    binding = await update_binding(
        int(id),
        {
            "tenant_id": None,
            "rule_id": input.get("ruleId"),
            "playbook_id": input["playbookId"],
            "mode": input["mode"],
            "match_types": input.get("matchTypes"),
            "match_severities": input.get("matchSeverities"),
            "match_tags": input.get("matchTags"),
            "max_per_minute": input.get("maxPerMinute", 30),
            "max_concurrent": input.get("maxConcurrent", 5),
            "daily_quota": input.get("dailyQuota", 500),
            "enabled": input.get("enabled", True),
        },
    )
    if not binding:
        raise ValueError("Binding not found")
    return _binding_to_graphql(binding)


@bindings_mutation.field("deletePlaybookBinding")
async def resolve_delete_binding(_, info, id):
    if not _require_roles(info.context, ["analyst", "admin"]):
        raise ValueError("Insufficient permissions")
    binding = await get_binding(int(id))
    if not binding:
        raise ValueError("Binding not found")
    await delete_binding(int(id))
    return True


@bindings_mutation.field("evaluateBindings")
async def resolve_evaluate_bindings(_, info, alertId):
    audits = await preview_bindings(alertId)
    return [_audit_to_graphql(a) for a in audits]


@bindings_mutation.field("runBinding")
async def resolve_run_binding(_, info, alertId, bindingId):
    if not _require_roles(info.context, ["analyst", "admin"]):
        raise ValueError("Insufficient permissions")
    user = _get_user(info.context)
    audit = await run_binding(alertId, bindingId, user.get("sub", "system"))
    if not audit:
        raise ValueError("Binding or alert not found")
    return _audit_to_graphql(audit)

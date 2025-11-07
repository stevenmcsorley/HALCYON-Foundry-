from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from .config import settings
from .repo_bindings import (
    select_active_bindings_for_alert,
    try_acquire_binding,
    release_inflight,
    insert_audit_entry,
    update_audit_entry,
    list_audit_entries,
    binding_matches_alert,
    get_binding,
)
from .repo_alerts import get_alert
from .metrics import (
    playbook_binding_decisions_total,
    playbook_binding_runs_total,
    playbook_binding_evaluate_latency_seconds,
)
from .ws_pubsub import hub

logger = logging.getLogger("gateway.autorun")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_tags(tags: Any) -> List[str]:
    if not tags:
        return []
    if isinstance(tags, str):
        return [tags]
    if isinstance(tags, (list, tuple, set)):
        return [str(t) for t in tags if t is not None]
    return []


def _build_alert_context(alert: Dict[str, Any]) -> Dict[str, Any]:
    entity = alert.get("entity") or {}
    attrs = entity.get("attrs") or {}
    tags = alert.get("tags")
    if not tags:
        tags = attrs.get("tags") or attrs.get("labels") or []
    context = {
        "id": alert.get("id"),
        "ruleId": alert.get("ruleId") or alert.get("rule_id"),
        "severity": alert.get("severity"),
        "type": alert.get("type") or entity.get("type") or attrs.get("type"),
        "tags": _normalize_tags(tags),
    }
    return context


async def _fetch_alert(alert_id: int) -> Optional[Dict[str, Any]]:
    alert = await get_alert(alert_id)
    if alert:
        alert["id"] = alert_id
    return alert


async def _fetch_playbook(playbook_id: int | str) -> Optional[Dict[str, Any]]:
    url = f"{settings.enrichment_base_url}/playbooks/{playbook_id}"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()


def _build_mock_subject(alert: Dict[str, Any]) -> Dict[str, Any]:
    entity = alert.get("entity") or {}
    attrs = entity.get("attrs") or {}
    subject = {
        "id": str(alert.get("id")),
        "message": alert.get("message") or alert.get("msg") or "",
        "attrs": attrs,
        "severity": alert.get("severity"),
        "tags": _normalize_tags(alert.get("tags") or attrs.get("tags")),
    }
    return subject


async def _call_enrichment(endpoint: str, payload: Dict[str, Any], *, idempotency_key: str) -> Dict[str, Any]:
    url = f"{settings.enrichment_base_url}{endpoint}"
    headers = {"X-Idempotency-Key": idempotency_key}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()


async def _execute_dry_run(alert: Dict[str, Any], binding: Dict[str, Any], *, requested_by: str) -> Tuple[bool, Optional[str], Optional[str]]:
    playbook = await _fetch_playbook(binding["playbook_id"])
    if not playbook:
        return False, "Playbook not found", None
    mock_subject = _build_mock_subject(alert)
    payload = {
        "jsonBody": playbook.get("jsonBody") or playbook.get("json_body") or playbook,
        "mockSubject": mock_subject,
    }
    try:
        result = await _call_enrichment(
            "/playbooks/test-run",
            payload,
            idempotency_key=f"alert:{alert['id']}:binding:{binding['id']}:dry",
        )
        status = result.get("status", "unknown")
        success = status == "success"
        output_ref = None
        if success:
            playbook_binding_runs_total.labels(mode="dry_run", success="true").inc()
        else:
            playbook_binding_runs_total.labels(mode="dry_run", success="false").inc()
        reason = None if success else status
        return success, reason, output_ref
    except httpx.HTTPError as exc:
        logger.error("Dry run failed for binding %s: %s", binding["id"], exc)
        playbook_binding_runs_total.labels(mode="dry_run", success="false").inc()
        return False, str(exc), None


async def _execute_auto_run(alert: Dict[str, Any], binding: Dict[str, Any], *, requested_by: str, attach_as_note: bool = True) -> Tuple[bool, Optional[str], Optional[str]]:
    payload = {
        "subjectKind": "alert",
        "subjectId": str(alert.get("id")),
        "playbookId": binding["playbook_id"],
        "attachAsNote": attach_as_note,
    }
    try:
        result = await _call_enrichment(
            "/enrich/playbooks/run",
            payload,
            idempotency_key=f"alert:{alert['id']}:binding:{binding['id']}:run",
        )
        status = result.get("status", "unknown")
        success = status == "success"
        output_ref = result.get("id")
        playbook_binding_runs_total.labels(mode="auto_run", success="true" if success else "false").inc()
        reason = None if success else status
        return success, reason, output_ref
    except httpx.HTTPError as exc:
        logger.error("Auto run failed for binding %s: %s", binding["id"], exc)
        playbook_binding_runs_total.labels(mode="auto_run", success="false").inc()
        return False, str(exc), None


async def evaluate_bindings(
    alert: Dict[str, Any],
    user: str = "system",
    bindings_override: Optional[List[Dict[str, Any]]] = None,
    bypass_guardrails: bool = False,
) -> List[Dict[str, Any]]:
    if not alert:
        return []
    context = _build_alert_context(alert)
    bindings = bindings_override or await select_active_bindings_for_alert(context)
    if not bindings:
        return []

    results: List[Dict[str, Any]] = []
    entity = alert.get("entity") or {}
    attrs = entity.get("attrs") or {}
    for binding in bindings:
        mode = binding["mode"]
        with playbook_binding_evaluate_latency_seconds.labels(mode=mode).time():
            started_at = _now()
            decision = "matched"
            reason = None
            success: Optional[bool] = None
            output_ref: Optional[str] = None

            if not binding_matches_alert(binding, context):
                continue

            for_run = mode in ("dry_run", "auto_run")
            increment_daily = mode in ("dry_run", "auto_run")

            allowed, guard_reason = await try_acquire_binding(
                binding,
                for_run=for_run,
                increment_daily=increment_daily,
                dry_run=bypass_guardrails,
            )
            override_reason = None
            if not allowed:
                if not bypass_guardrails:
                    decision = guard_reason or "not_matched"
                    audit = await insert_audit_entry(
                        {
                            "alert_id": alert.get("id"),
                            "binding_id": binding["id"],
                            "playbook_id": binding["playbook_id"],
                            "mode": mode,
                            "decision": decision,
                            "reason": guard_reason,
                            "requested_by": user,
                            "started_at": started_at,
                            "finished_at": _now(),
                            "success": None,
                            "output_ref": None,
                        }
                    )
                    playbook_binding_decisions_total.labels(mode=mode, decision=decision).inc()
                    results.append(audit)
                    await hub.publish({"t": "playbook.run_audit.created", "data": audit})
                    continue
                else:
                    override_reason = guard_reason

            try:
                if mode == "suggest":
                    decision = "suggested"
                    audit = await insert_audit_entry(
                        {
                            "alert_id": alert.get("id"),
                            "binding_id": binding["id"],
                            "playbook_id": binding["playbook_id"],
                            "mode": mode,
                            "decision": decision,
                            "reason": reason,
                            "requested_by": user,
                            "started_at": started_at,
                            "finished_at": _now(),
                            "success": None,
                            "output_ref": None,
                        }
                    )
                elif mode == "dry_run":
                    success, reason, output_ref = await _execute_dry_run(alert, binding, requested_by=user)
                    decision = "dry_ran" if success else "dry_run_failed"
                    if override_reason:
                        reason = f"override:{override_reason}"
                    audit = await insert_audit_entry(
                        {
                            "alert_id": alert.get("id"),
                            "binding_id": binding["id"],
                            "playbook_id": binding["playbook_id"],
                            "mode": mode,
                            "decision": decision,
                            "reason": reason,
                            "requested_by": user,
                            "started_at": started_at,
                            "finished_at": _now(),
                            "success": success,
                            "output_ref": output_ref,
                        }
                    )
                else:  # auto_run
                    success, reason, output_ref = await _execute_auto_run(alert, binding, requested_by=user)
                    decision = "ran" if success else "run_failed"
                    if override_reason:
                        reason = f"override:{override_reason}"
                    audit = await insert_audit_entry(
                        {
                            "alert_id": alert.get("id"),
                            "binding_id": binding["id"],
                            "playbook_id": binding["playbook_id"],
                            "mode": mode,
                            "decision": decision,
                            "reason": reason,
                            "requested_by": user,
                            "started_at": started_at,
                            "finished_at": _now(),
                            "success": success,
                            "output_ref": output_ref,
                        }
                    )
            except Exception as exc:
                logger.exception("Binding %s execution failed: %s", binding["id"], exc)
                decision = "failed_dependency"
                audit = await insert_audit_entry(
                    {
                        "alert_id": alert.get("id"),
                        "binding_id": binding["id"],
                        "playbook_id": binding["playbook_id"],
                        "mode": mode,
                        "decision": decision,
                        "reason": str(exc),
                        "requested_by": user,
                        "started_at": started_at,
                        "finished_at": _now(),
                        "success": None,
                        "output_ref": None,
                    }
                )
            finally:
                if for_run and not bypass_guardrails:
                    await release_inflight(binding["id"])

            playbook_binding_decisions_total.labels(mode=mode, decision=decision).inc()
            results.append(audit)
            await hub.publish({"t": "playbook.run_audit.created", "data": audit})

    return results


async def preview_bindings(alert_id: int) -> List[Dict[str, Any]]:
    alert = await _fetch_alert(alert_id)
    if not alert:
        return []
    context = _build_alert_context(alert)
    bindings = await select_active_bindings_for_alert(context)
    results = []
    for binding in bindings:
        mode = binding["mode"]
        allowed, guard_reason = await try_acquire_binding(
            binding,
            for_run=mode in ("dry_run", "auto_run"),
            increment_daily=mode in ("dry_run", "auto_run"),
            dry_run=True,
        )
        decision = "matched" if allowed else guard_reason or "not_matched"
        audit = {
            "id": None,
            "alertId": alert_id,
            "bindingId": binding["id"],
            "playbookId": binding["playbook_id"],
            "mode": mode,
            "decision": decision,
            "reason": guard_reason,
            "requestedBy": "preview",
            "startedAt": _now().isoformat(),
            "finishedAt": None,
            "success": None,
            "outputRef": None,
        }
        results.append(audit)
    return results


async def run_binding(alert_id: int, binding_id: int, user: str) -> Optional[Dict[str, Any]]:
    alert = await _fetch_alert(alert_id)
    if not alert:
        return None
    binding = await get_binding(binding_id)
    if not binding:
        return None
    context = _build_alert_context(alert)
    if not binding_matches_alert(binding, context):
        return None
    binding_copy = dict(binding)
    if binding_copy.get("mode") == "suggest":
        binding_copy["mode"] = "auto_run"
    audit_entries = await evaluate_bindings(
        alert,
        user=user,
        bindings_override=[binding_copy],
        bypass_guardrails=True,
    )
    for entry in audit_entries:
        if entry.get("binding_id") == binding_id or entry.get("bindingId") == binding_id:
            return entry
    return None


async def get_audit_for_alert(alert_id: int) -> List[Dict[str, Any]]:
    return await list_audit_entries(alert_id)

# Phase 11A — Security & RBAC Plan

## Objectives

1. Protect datasource configurations and secrets in transit and at rest.
2. Enforce role-based access control for datasource management operations.
3. Provide full auditability for lifecycle actions and test runs.
4. Lay groundwork for future approval workflows and compliance requirements.

## Secret Management

### Storage

- Secrets stored in `datasource_secrets` table (encrypted `BYTEA` column).
- Encryption method: AES-256-GCM using application-managed key (from env var or KMS).
- Key rotation support: configurable master key with ability to re-encrypt values (Phase 11D enhancement).

### Access

- Secrets decrypted only within registry process when instantiating connectors/test runs.
- Gateway never returns plaintext secrets; API returns opaque `secretRef` tokens.
- Secret write operations (create/update/rotate) require admin role.
- Test run requests may include temporary overrides, handled in-memory, not persisted unless explicitly saved.

### Integrations (Future)

- Provide adapter interface to integrate with external secret stores (AWS KMS, HashiCorp Vault). Phase 11A will include stub interface and configuration (choose DB or external). Implementation of adapters can follow in Phase 11D.

## RBAC

### Roles

- `datasource:admin`: Full access (create/edit/publish/delete, secret management, lifecycle ops).
- `datasource:operator`: Manage lifecycle (start/stop/restart/test/backfill), view configs/versions, create/edit drafts, but cannot delete or manage secrets.
- `datasource:viewer`: Read-only access (catalog, versions, metrics, events).

Roles mapped from JWT claims (Keycloak/Access token). Extend existing auth middleware to support datasource-specific scopes.

### Enforcement Points

- Gateway REST/GraphQL mutations check role permissions before calling registry.
- Registry endpoints require internal auth (shared secret or mutual TLS) to prevent direct external access.
- UI elements shown/hidden based on role capabilities (handled in Phase 11B).

### Multi-Tenant Scoping

- Datasource records include `org_id` / `project_id`. RBAC rules must ensure users only access datasources within their scope (aligned with Phase 9).

## Audit Logging

### Events Captured

- Create/update/delete datasource.
- Create/edit/publish/rollback versions.
- Secret operations (create/update/rotate/delete).
- Lifecycle actions (start/stop/restart/backfill/test).
- RBAC changes (assignment of owner/roles once implemented).

### Payload

- Actor (user id).
- Action type.
- Datasource id + version.
- Timestamp.
- Summary/diff (include sanitized config diff if possible).
- Success/failure outcome.

Stored in global audit log + `datasource_events` table.

## Compliance Considerations

- Ensure logs contain enough data for SOC2-like auditing.
- Sensitive data (secrets, payloads) redacted in audit entries unless explicitly required.
- Provide data retention policies for `datasource_events` (configurable purge/archival).

## Additional Security Measures

- Input validation for configs/mappings to prevent injection vulnerabilities.
- Rate limiting on test-run endpoint to prevent abuse.
- CSRF protection via existing auth framework.
- Option to require multi-factor approval for publish (Phase 11D).

## Phase 11A Deliverables

1. Encryption module integrated with registry (helpers for encrypt/decrypt using master key).
2. RBAC middleware updates (gateway + registry) enforcing new roles.
3. Audit logging hook for each mutation/lifecycle action.
4. Configuration flags for future approval workflows (disabled for now).

## Implementation Tasks

1. Add config keys: `DATASOURCE_ENCRYPTION_KEY`, `REGISTRY_INTERNAL_TOKEN`.
2. Implement `SecretStore` interface with `DatabaseSecretStore` (default).
3. Update registry to use `SecretStore` when starting workers and running tests.
4. Extend gateway auth middleware to parse datasource roles from JWT and enforce per endpoint.
5. Add audit logging utility to datasource service layer.

## Testing

- Unit tests for encryption/decryption.
- RBAC integration tests covering allowed/denied operations per role.
- Audit log test verifying entries written with correct metadata.
- Security review checklist (secrets never logged, endpoints require auth, etc.).

## Future Enhancements (Beyond 11A)

- Approval workflow for publish/rollback (Phase 11D).
- Real-time notification integration for security events.
- Key rotation automation & external secret store support.


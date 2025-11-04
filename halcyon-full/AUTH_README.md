# HALCYON Foundry Core – Authentication Guide

This document explains how to use **DEV_MODE** (mock token login) or full **Keycloak OIDC** authentication.

---

## 🔐 Modes Overview

| Mode | Purpose | Requirements |
|------|----------|--------------|
| **DEV_MODE (Mock Token)** | Local development, no Keycloak required | None |
| **OIDC Mode (Keycloak)** | Production or full integration | Keycloak running in Docker |

---

## 🧩 DEV_MODE (Default)

### When to use

For local development, testing, or CI environments without Keycloak.

### How it works

- The UI generates a mock JWT when you log in with any credentials.
- Gateway injects default roles (`admin`, `analyst`) and skips OIDC validation.
- Works offline and allows all routes.

### Configuration

#### Environment

```env
# UI
VITE_DEV_MODE=true

# Gateway
DEV_MODE=true
```

#### Login

In the browser:
- **Username:** `admin`
- **Password:** `admin`

This creates a temporary mock token.

#### Verify

```bash
curl -s http://localhost:8088/auth/user | jq .
```

Expected response:

```json
{
  "sub": "admin",
  "email": "admin@halcyon.local",
  "roles": ["admin"]
}
```

---

## 🧭 OIDC Mode (Keycloak Integration)

### When to use

For authenticated multi-user deployments with role-based access.

### Requirements

- Keycloak service running (`deploy/docker-compose.yml`)
- Proper realm import (`deploy/keycloak/realm-export.json`)

### Configuration

#### Environment

```env
# UI
VITE_DEV_MODE=false
VITE_KEYCLOAK_URL=http://localhost:8089
VITE_KEYCLOAK_REALM=halcyon-dev
VITE_KEYCLOAK_CLIENT_ID=halcyon-ui

# Gateway
DEV_MODE=false
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=halcyon-dev
KEYCLOAK_CLIENT_ID=halcyon-gateway
OIDC_DISCOVERY_URL=http://keycloak:8080/realms/halcyon-dev/.well-known/openid-configuration
JWT_ALGORITHM=RS256
```

### Start Keycloak

```bash
cd deploy
docker compose up -d keycloak
```

Then open:
- **URL:** http://localhost:8089
- **Username:** `admin`
- **Password:** `admin`

### Verify Login

1. Log in via the UI (redirects to Keycloak).
2. Check Gateway auth:

```bash
TOKEN="<paste your JWT>"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8088/auth/user | jq .
```

Expected response:

```json
{
  "sub": "uuid-of-user",
  "email": "admin@halcyon.dev",
  "roles": ["admin", "analyst"]
}
```

---

## 🧪 Switching Between Modes

| Action | DEV_MODE | OIDC |
|--------|----------|------|
| **Enable DEV_MODE** | `VITE_DEV_MODE=true` + `DEV_MODE=true` | - |
| **Switch to OIDC** | - | Set both to `false`, start Keycloak |
| **Restart containers** | `docker compose up -d --build` | `docker compose up -d --build keycloak gateway ui` |

---

## ✅ Quick Verify (DEV_MODE path)

1. Open the UI → click Login → use `admin` / `admin`.
2. In browser devtools, confirm requests carry `Authorization: Bearer <mock>` (DEV_MODE token).
3. Hit Gateway from your terminal:

```bash
curl -s http://localhost:8088/auth/user | jq .
```

You should see roles like `["admin"]`.

---

## 🔁 Switch between DEV_MODE and real Keycloak

### DEV_MODE ON (mock token):
- UI env: `VITE_DEV_MODE=true`
- Gateway env: `DEV_MODE=true`
- Keycloak container: not required

### Keycloak ON (real JWT):
1. Bring up Keycloak:
   ```bash
   cd deploy && docker compose up -d keycloak
   ```
2. UI env: `VITE_DEV_MODE=false`
3. Gateway env: `DEV_MODE=false`
4. Set these for Gateway:
   - `KEYCLOAK_URL=http://keycloak:8080`
   - `KEYCLOAK_REALM=halcyon-dev`
   - `KEYCLOAK_CLIENT_ID=halcyon-gateway`
5. Rebuild/restart gateway and ui.

---

## 🧪 Two quick auth-path smoke tests

### DEV_MODE path

```bash
# should return user with roles (no Keycloak needed)
curl -s http://localhost:8088/auth/user | jq .
```

### OIDC path (once Keycloak is on)

1. Login via UI (redirect to Keycloak).
2. Verify Gateway accepts JWT:

```bash
# paste the access token from your browser storage
TOKEN="eyJ..." 
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8088/auth/user | jq .
```

---

## 🧷 Gotchas to avoid later

- Keep Authorization in headers (no cookies needed).
- Don't leave `admin/admin` enabled outside DEV_MODE.
- If WS ever fails after switching modes, confirm `VITE_GATEWAY_WS_URL` points to the same host you're using for the UI (or derive from `VITE_GATEWAY_URL`).

---

## 🧷 Common Issues

| Problem | Likely Cause | Fix |
|---------|--------------|-----|
| Login fails in DEV_MODE | `VITE_DEV_MODE` missing or false | Add to `.env` or `docker-compose.yml` |
| 401 from Gateway | Token expired or Keycloak down | Refresh login or restart Keycloak |
| WebSocket unauthorized | Gateway WS inherits same Authorization header | Reconnect after token refresh |
| Realm not importing | Adjust `deploy/keycloak/init.sh` for import timing | Delay startup until Keycloak is ready |

---

## 🛠️ Files Involved

- `core/gateway/app/auth.py` - OIDC discovery and JWT verification
- `core/gateway/app/middleware.py` - JWT token extraction middleware
- `core/gateway/app/config.py` - Auth configuration
- `ui/src/services/auth.ts` - UI auth service with login/logout
- `ui/src/store/authStore.ts` - Zustand auth state store
- `ui/src/components/LoginForm.tsx` - Login UI component
- `ui/src/components/UserMenu.tsx` - User menu with logout
- `deploy/keycloak/realm-export.json` - Keycloak realm configuration
- `deploy/keycloak/init.sh` - Realm import script
- `deploy/docker-compose.yml` - Service configuration

---

## 🧭 Verification Commands

```bash
# Gateway health + auth
curl -s http://localhost:8088/health | jq .
curl -s http://localhost:8088/auth/user | jq .

# OIDC discovery check
curl -s http://localhost:8089/realms/halcyon-dev/.well-known/openid-configuration | jq .
```

---

## 📝 Notes

- DEV_MODE remains safe for local use but must be disabled for staging/production.
- JWT validation uses cached JWKS keys; restart Gateway if Keycloak keys rotate.
- Roles are extracted from `realm_access.roles` and `resource_access.{client}.roles`.
- Gateway middleware injects user context into GraphQL resolvers via `context["user"]`.

---

© HALCYON Foundry Core — Authentication Guide

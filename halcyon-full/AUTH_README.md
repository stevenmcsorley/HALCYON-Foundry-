# HALCYON Foundry Core – Authentication Guide

HALCYON relies exclusively on **Keycloak OIDC** for authentication across environments. Mock login flows have been removed to keep the platform aligned with production behaviour.

---

## 🔐 Architecture Overview

- **Identity Provider**: Keycloak (containerised in `deploy/keycloak`).
- **Gateway Client**: `halcyon-gateway` – validates access tokens for API requests.
- **UI Client**: `halcyon-ui` – handles browser login and token refresh.
- **Realm**: `halcyon-dev` – ships with core roles (`viewer`, `analyst`, `admin`).

---

## ⚙️ Environment Variables

Configure the UI (Vite) and Gateway (FastAPI) with these values:

```env
# UI
VITE_KEYCLOAK_URL=http://localhost:8089
VITE_KEYCLOAK_REALM=halcyon-dev
VITE_KEYCLOAK_CLIENT_ID=halcyon-ui

# Gateway
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=halcyon-dev
KEYCLOAK_CLIENT_ID=halcyon-gateway
OIDC_DISCOVERY_URL=http://keycloak:8080/realms/halcyon-dev/.well-known/openid-configuration
JWT_ALGORITHM=RS256
```

> Adjust hostnames if Keycloak runs outside the docker composition. The defaults assume `docker compose` with the Keycloak container accessible internally as `keycloak:8080` and exposed locally on `http://localhost:8089`.

---

## 🚀 Bring Keycloak Online

```bash
cd deploy
docker compose up -d keycloak
```

Access the admin console to manage users and clients:

- URL: http://localhost:8089
- Username: `admin`
- Password: `admin`

The bundled realm export (`deploy/keycloak/realm-export.json`) seeds default roles, groups, and client scopes.

---

## 🔑 Obtaining a Token

### Browser Flow

1. Navigate to the HALCYON UI (`http://localhost:5173`).
2. Click **Log In** – you will be redirected to Keycloak.
3. Authenticate with your Keycloak credentials.
4. After redirect back to the UI, the access token and refresh token are stored in browser storage.

### Service-to-Service (Password Grant)

```bash
TOKEN=$(curl -s \
  -X POST http://localhost:8089/realms/halcyon-dev/protocol/openid-connect/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=password&client_id=halcyon-ui&username=<user>&password=<pass>' \
  | jq -r '.access_token')

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8088/auth/user | jq .
```

Expected response:

```json
{
  "sub": "2455deb8-e6ad-4adb-a06a-b00dd598c377",
  "email": "admin@halcyon.dev",
  "roles": ["admin", "analyst"]
}
```

---

## ✅ Verification Checklist

1. **UI Login** – browser redirects to Keycloak and back successfully.
2. **Gateway Health** – `curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8088/health` returns `ok`.
3. **Role Propagation** – `GET /auth/user` reflects Keycloak role assignments.
4. **WebSockets** – live UI channels (alerts, playbook audits) function with the same bearer token.

---

## 🛠️ Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| Login loop / redirect error | Client IDs mismatch between UI env and Keycloak | Ensure `VITE_KEYCLOAK_CLIENT_ID` and `KEYCLOAK_CLIENT_ID` match Keycloak configuration |
| `invalid_grant` on token request | Wrong credentials or confidential client missing secret | Reset credentials or configure client access type appropriately |
| 401 from Gateway | Token expired or JWKS endpoint unreachable | Re-authenticate, confirm `OIDC_DISCOVERY_URL` is reachable from gateway container |
| WebSocket unauthorized | Token missing from initial connection | Include `Authorization: Bearer <token>` header when establishing WS connection |

---

## 📂 Reference Files

- `core/gateway/app/auth.py` – JWT verification helpers.
- `core/gateway/app/middleware.py` – authentication middleware enforcing bearer tokens.
- `core/enrichment/app/auth.py` – enrichment service auth helper.
- `deploy/docker-compose.yml` – service definitions & environment variables.
- `deploy/keycloak/` – realm export, bootstrap scripts, admin credentials.

Need help? Contact platform-engineering@halcyon.dev.

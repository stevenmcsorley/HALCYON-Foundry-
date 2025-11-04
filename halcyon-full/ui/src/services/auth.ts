const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8089'
const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM || 'halcyon-dev'
const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'halcyon-ui'
// Default to DEV_MODE=true for local development (bypass Keycloak)
// In Vite, undefined env vars become empty string, so check for that too
const devModeEnv = import.meta.env.VITE_DEV_MODE
const DEV_MODE = !devModeEnv || devModeEnv === 'true' || devModeEnv === '1'

const DISCOVERY_URL = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`
const TOKEN_KEY = 'halcyon_token'
const USER_KEY = 'halcyon_user'

export interface User {
  sub: string
  email?: string
  roles: string[]
}

let discoveryCache: any = null

async function getDiscovery(): Promise<any> {
  if (discoveryCache) return discoveryCache
  const res = await fetch(DISCOVERY_URL)
  discoveryCache = await res.json()
  return discoveryCache
}

export async function login(username: string, password: string): Promise<{ token: string; user: User }> {
  if (DEV_MODE) {
    // In dev mode, create a mock token
    const mockUser: User = {
      sub: username,
      email: `${username}@halcyon.local`,
      roles: username === 'admin' ? ['admin'] : ['analyst'],
    }
    const mockToken = btoa(JSON.stringify(mockUser))
    localStorage.setItem(TOKEN_KEY, mockToken)
    localStorage.setItem(USER_KEY, JSON.stringify(mockUser))
    return { token: mockToken, user: mockUser }
  }

  const discovery = await getDiscovery()
  const tokenUrl = discovery.token_endpoint

  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: KEYCLOAK_CLIENT_ID,
    username,
    password,
  })

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })

  if (!res.ok) throw new Error('Login failed')

  const data = await res.json()
  const token = data.access_token

  // Decode token to get user info (simple base64 decode for JWT payload)
  const payload = JSON.parse(atob(token.split('.')[1]))
  const user: User = {
    sub: payload.sub,
    email: payload.email,
    roles: payload.realm_access?.roles || payload.resource_access?.[KEYCLOAK_CLIENT_ID]?.roles || [],
  }

  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))

  return { token, user }
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  window.location.href = '/'
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): User | null {
  const userStr = localStorage.getItem(USER_KEY)
  return userStr ? JSON.parse(userStr) : null
}

export function isAuthenticated(): boolean {
  return !!getToken() || DEV_MODE
}

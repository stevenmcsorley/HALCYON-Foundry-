import * as auth from './auth'

type GraphQLResponse<T> = { data?: T; errors?: { message: string }[] }

// Flag to prevent multiple redirects
let isRedirecting = false

export async function gql<T>(query: string, variables?: Record<string, any>): Promise<T> {
  const token = auth.getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const gatewayUrl = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8088/graphql'

  let res = await fetch(import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8088/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })

  if (res.status === 401 && !isRedirecting) {
    isRedirecting = true
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  const json: GraphQLResponse<T> = await res.json()

  if (json.errors) {
    throw new Error(json.errors[0].message)
  }

  if (!json.data) {
    throw new Error('No data returned')
  }

  return json.data
}

// REST API client for non-GraphQL endpoints (e.g., alerts)
// Extract base URL from VITE_GATEWAY_URL (which may include /graphql) or default to port 8088
const gatewayUrl = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8088/graphql'
const baseUrl = gatewayUrl.includes('/graphql') 
  ? gatewayUrl.replace('/graphql', '') 
  : gatewayUrl.replace(/\/$/, '') || 'http://localhost:8088'

export const api = {
  async get<T = any>(path: string, config?: { params?: Record<string, any> }): Promise<{ data: T }> {
    // Don't make API calls if we're already redirecting
    if (isRedirecting) {
      throw new Error('Unauthorized')
    }

    const token = auth.getToken()
    
    // If no token, redirect immediately without making the request
    if (!token) {
      if (!isRedirecting) {
        isRedirecting = true
        window.location.href = '/login'
      }
      throw new Error('Unauthorized')
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`
    }

    let url = `${baseUrl}${path}`
    if (config?.params) {
      const searchParams = new URLSearchParams()
      Object.entries(config.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      })
      if (searchParams.toString()) {
        url += `?${searchParams.toString()}`
      }
    }

    const res = await fetch(url, { headers })

    if (res.status === 401 && !isRedirecting) {
      isRedirecting = true
      window.location.href = '/login'
      throw new Error('Unauthorized')
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }

    const data = await res.json()
    return { data }
  },

    async post<T = any>(path: string, body?: any): Promise<{ data: T }> {
    // Don't make API calls if we're already redirecting
    if (isRedirecting) {
      throw new Error('Unauthorized')
    }

    const token = auth.getToken()
    
    // If no token, redirect immediately without making the request
    if (!token) {
      if (!isRedirecting) {
        isRedirecting = true
        window.location.href = '/login'
      }
      throw new Error('Unauthorized')
    }

    const headers: Record<string, string> = { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (res.status === 401 && !isRedirecting) {
      isRedirecting = true
      window.location.href = '/login'
      throw new Error('Unauthorized')
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }

    const data = await res.json()
    return { data }
  },
}

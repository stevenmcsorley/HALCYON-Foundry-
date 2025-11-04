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

  let res = await fetch(import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8088/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables })
  })

  // If 401 and we have a token, try refreshing (only once)
  if (res.status === 401 && token && !isRedirecting) {
    try {
      await auth.refresh()
      // Retry with new token
      const newToken = auth.getToken()
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`
        res = await fetch(import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8088/graphql', {
          method: 'POST',
          headers,
          body: JSON.stringify({ query, variables })
        })
        // If retry succeeds, return the data
        if (res.ok) {
          const data: GraphQLResponse<T> = await res.json()
          if (data.errors?.length) throw new Error(data.errors.map(e => e.message).join('; '))
          return data.data as T
        }
      }
    } catch (refreshError) {
      // Refresh failed - logout and redirect (only once)
      if (!isRedirecting) {
        isRedirecting = true
        auth.logout() // This will redirect
      }
      throw new Error('Unauthorized - please login again')
    }
  }

  // If still 401 after refresh attempt (or no token), logout and redirect
  if (res.status === 401 && !isRedirecting) {
    isRedirecting = true
    auth.logout() // This will redirect
    throw new Error('Unauthorized')
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data: GraphQLResponse<T> = await res.json()
  if (data.errors?.length) throw new Error(data.errors.map(e => e.message).join('; '))
  return data.data as T
}

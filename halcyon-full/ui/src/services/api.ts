import * as auth from './auth'

type GraphQLResponse<T> = { data?: T; errors?: { message: string }[] }

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

  // If 401 and we have a token, try refreshing
  if (res.status === 401 && token) {
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
      }
    } catch (refreshError) {
      // Refresh failed, logout will be called by auth.refresh()
      window.location.href = '/'
      throw new Error('Unauthorized - please login again')
    }
  }

  if (res.status === 401) {
    // Unauthorized - clear auth and redirect to login
    auth.logout()
    window.location.href = '/'
    throw new Error('Unauthorized')
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data: GraphQLResponse<T> = await res.json()
  if (data.errors?.length) throw new Error(data.errors.map(e => e.message).join('; '))
  return data.data as T
}

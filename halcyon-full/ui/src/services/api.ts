import * as auth from './auth'

type GraphQLResponse<T> = { data?: T; errors?: { message: string }[] }

export async function gql<T>(query: string, variables?: Record<string, any>): Promise<T> {
  const token = auth.getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8088/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables })
  })

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

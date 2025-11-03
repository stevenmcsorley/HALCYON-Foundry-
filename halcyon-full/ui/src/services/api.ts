type GraphQLResponse<T> = { data?: T; errors?: { message: string }[] }

export async function gql<T>(query: string, variables?: Record<string, any>): Promise<T> {
  const res = await fetch(import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8088/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data: GraphQLResponse<T> = await res.json()
  if (data.errors?.length) throw new Error(data.errors.map(e => e.message).join('; '))
  return data.data as T
}

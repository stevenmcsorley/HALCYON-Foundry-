export const CONFIG = {
  GATEWAY_URL: import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8088/graphql',
  WS_URL: (import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8088/graphql').replace(/^http/, 'ws').replace('/graphql', '/ws'),
  MAP_STYLE_URL: import.meta.env.VITE_MAP_STYLE_URL
}

type Msg = { t:'entity.upsert'|'relationship.upsert'|'pong'; data?:any } & Record<string,any>

const WS_URL = import.meta.env.VITE_GATEWAY_WS_URL
  || (import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8088/graphql')
       .replace(/^http/,'ws').replace(/\/graphql\/?$/,'') + '/ws'

export function subscribe(onMessage:(m:Msg)=>void) {
  let ws:WebSocket|null = null, stopped=false, backoff=500
  const connect = () => {
    if (stopped) return
    try { ws = new WebSocket(WS_URL) } catch { schedule(); return }
    ws.onmessage = (e)=>{ try{ onMessage(JSON.parse(e.data)) }catch{} }
    ws.onclose = schedule; ws.onerror = schedule
  }
  const schedule = () => { if (stopped) return; setTimeout(connect, backoff); backoff=Math.min(backoff*2, 5000) }
  connect()
  return ()=>{ stopped=true; try{ ws?.close() }catch{} }
}

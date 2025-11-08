import { WS_URL } from '@/services/websocket'

type Handler = (payload: any) => void

class DashboardStream {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<Handler>>()
  private queue: any[] = []
  private reconnectDelay = 500
  private stopped = false

  subscribe(topic: string, handler: Handler): () => void {
    if (!topic) {
      throw new Error('Topic is required for dashboard stream subscription')
    }
    const topicHandlers = this.handlers.get(topic) ?? new Set<Handler>()
    topicHandlers.add(handler)
    this.handlers.set(topic, topicHandlers)

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ action: 'subscribe', topic })
    } else {
      this.ensureSocket()
    }

    return () => {
      const current = this.handlers.get(topic)
      if (!current) {
        return
      }
      current.delete(handler)
      if (current.size === 0) {
        this.handlers.delete(topic)
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.send({ action: 'unsubscribe', topic })
        }
      } else {
        this.handlers.set(topic, current)
      }
    }
  }

  stop() {
    this.stopped = true
    try {
      this.ws?.close()
    } catch {
      /* noop */
    }
    this.ws = null
    this.handlers.clear()
  }

  private ensureSocket() {
    if (this.stopped) return
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }
    try {
      this.ws = new WebSocket(WS_URL)
    } catch (err) {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 500
      // flush queue
      while (this.queue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
        const msg = this.queue.shift()
        try {
          this.ws?.send(JSON.stringify(msg))
        } catch {
          this.queue.unshift(msg)
          break
        }
      }
      // resubscribe topics
      for (const topic of this.handlers.keys()) {
        this.send({ action: 'subscribe', topic })
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        const topic = payload.topic
        if (topic && this.handlers.has(topic)) {
          for (const handler of this.handlers.get(topic) ?? []) {
            try {
              handler(payload)
            } catch (err) {
              console.error('Dashboard handler error', err)
            }
          }
        }
      } catch (err) {
        console.warn('Failed to parse dashboard stream payload', err)
      }
    }

    this.ws.onclose = () => {
      if (this.stopped) return
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      if (this.stopped) return
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.stopped) return
    try {
      this.ws?.close()
    } catch {
      /* ignore */
    }
    this.ws = null
    setTimeout(() => this.ensureSocket(), this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 5000)
  }

  private send(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message))
        return
      } catch {
        /* fall through to queue */
      }
    }
    this.queue.push(message)
    this.ensureSocket()
  }
}

export const dashboardStream = new DashboardStream()



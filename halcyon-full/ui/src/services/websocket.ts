type WebSocketMessage = {
  t: 'entity.upsert' | 'relationship.upsert' | 'pong'
  data?: any
}

type WebSocketCallback = (message: WebSocketMessage) => void

class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private callbacks: Set<WebSocketCallback> = new Set()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private shouldReconnect = true

  constructor() {
    const gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8088/graphql'
    const wsUrl = gatewayUrl.replace(/^http/, 'ws').replace('/graphql', '/ws')
    this.url = wsUrl
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        this.reconnectAttempts = 0
        console.log('WebSocket connected')
      }

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          this.callbacks.forEach((callback) => callback(message))
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      this.ws.onclose = () => {
        console.log('WebSocket closed')
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++
          setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts)
        }
      }
    } catch (error) {
      console.error('Error creating WebSocket:', error)
    }
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.callbacks.clear()
  }

  subscribe(callback: WebSocketCallback): () => void {
    this.callbacks.add(callback)
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.connect()
    }
    return () => {
      this.callbacks.delete(callback)
    }
  }
}

export const wsClient = new WebSocketClient()

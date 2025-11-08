import asyncio
import json
import os
from typing import Dict, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import redis.asyncio as redis

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
CHANNEL = os.getenv("WS_CHANNEL", "halcyon.stream")


class WSHub:
    """
    Lightweight pub/sub hub that multiplexes a Redis stream onto FastAPI websockets.

    - Existing behaviour: JSON payloads without a `topic` field are broadcast to
      every connected client (maintains compatibility with alert/entity streams).
    - New behaviour: payloads that include a `topic` key are delivered only to
      clients that subscribe to that topic via the websocket control channel.
    """

    def __init__(self) -> None:
        self.clients: Set[WebSocket] = set()
        self.subscriptions: Dict[WebSocket, Set[str]] = {}
        self.redis: redis.Redis | None = None
        self._pump_task: asyncio.Task | None = None

    async def start(self) -> None:
        self.redis = redis.from_url(REDIS_URL, decode_responses=True)

        async def pump() -> None:
            assert self.redis is not None  # appease type-checkers
            pubsub = self.redis.pubsub()
            await pubsub.subscribe(CHANNEL)
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                await self._fanout(msg["data"])

        self._pump_task = asyncio.create_task(pump())

    async def _fanout(self, text: str) -> None:
        """
        Deliver a payload (from Redis) to interested websocket clients.
        """
        topic: str | None = None
        serialised = text

        try:
            parsed = json.loads(text)
            topic = parsed.get("topic")
            serialised = json.dumps(parsed)
        except Exception:
            # Non-JSON payloads are treated as broadcast events
            pass

        dead: list[WebSocket] = []
        for ws in list(self.clients):
            try:
                if topic is None or topic in self.subscriptions.get(ws, set()):
                    await ws.send_text(serialised)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws)

    async def publish(self, payload: dict, topic: str | None = None) -> None:
        if not self.redis:
            return
        message = payload.copy()
        if topic:
            message["topic"] = topic
        await self.redis.publish(CHANNEL, json.dumps(message))

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)
        self.subscriptions[ws] = set()

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)
        self.subscriptions.pop(ws, None)

    def subscribe(self, ws: WebSocket, topic: str) -> None:
        if topic:
            self.subscriptions.setdefault(ws, set()).add(topic)

    def unsubscribe(self, ws: WebSocket, topic: str) -> None:
        if ws in self.subscriptions and topic:
            self.subscriptions[ws].discard(topic)
            if not self.subscriptions[ws]:
                self.subscriptions[ws] = set()


hub = WSHub()


def register_ws(app: FastAPI) -> None:
    @app.on_event("startup")
    async def _start() -> None:
        await hub.start()

    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket) -> None:
        await hub.connect(ws)
        try:
            while True:
                raw = await ws.receive_text()
                try:
                    msg = json.loads(raw)
                except Exception:
                    if raw == "ping":
                        await ws.send_text(json.dumps({"t": "pong"}))
                    else:
                        await ws.send_text(json.dumps({"t": "pong"}))
                    continue

                action = msg.get("action")
                if action == "subscribe":
                    topic = msg.get("topic")
                    if isinstance(topic, str) and topic:
                        hub.subscribe(ws, topic)
                        await ws.send_text(json.dumps({"t": "subscribed", "topic": topic}))
                elif action == "unsubscribe":
                    topic = msg.get("topic")
                    if isinstance(topic, str) and topic:
                        hub.unsubscribe(ws, topic)
                        await ws.send_text(json.dumps({"t": "unsubscribed", "topic": topic}))
                elif action == "ping":
                    await ws.send_text(json.dumps({"t": "pong"}))
                else:
                    # Unknown message payload – respond with pong for backwards compatibility
                    await ws.send_text(json.dumps({"t": "pong"}))
        except WebSocketDisconnect:
            hub.disconnect(ws)

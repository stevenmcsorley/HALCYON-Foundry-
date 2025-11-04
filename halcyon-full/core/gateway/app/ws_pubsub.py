import asyncio
import json
import os
from typing import Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import redis.asyncio as redis

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
CHANNEL = os.getenv("WS_CHANNEL", "halcyon.stream")


class WSHub:
    def __init__(self) -> None:
        self.clients: Set[WebSocket] = set()
        self.r: redis.Redis | None = None
        self._task: asyncio.Task | None = None

    async def start(self):
        self.r = redis.from_url(REDIS_URL, decode_responses=True)

        async def pump():
            pubsub = self.r.pubsub()
            await pubsub.subscribe(CHANNEL)
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                await self._fanout(msg["data"])

        self._task = asyncio.create_task(pump())

    async def _fanout(self, text: str):
        dead = []
        for ws in self.clients:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    async def publish(self, payload: dict):
        if self.r:
            await self.r.publish(CHANNEL, json.dumps(payload))

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket):
        self.clients.discard(ws)


hub = WSHub()


def register_ws(app: FastAPI):
    @app.on_event("startup")
    async def _start():
        await hub.start()

    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket):
        await hub.connect(ws)
        try:
            while True:
                # Optional client ping
                await ws.receive_text()
                await ws.send_text(json.dumps({"t": "pong"}))
        except WebSocketDisconnect:
            hub.disconnect(ws)

from typing import Set
from fastapi import WebSocket
import json
import asyncio


class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        # WebSocket should already be accepted by the endpoint
        async with self._lock:
            self.active_connections.add(websocket)

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            self.active_connections.discard(websocket)
        try:
            await websocket.close()
        except Exception:
            pass

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        if not self.active_connections:
            return
        
        message_json = json.dumps(message)
        disconnected = set()
        
        async with self._lock:
            connections = list(self.active_connections)
        
        for connection in connections:
            try:
                await connection.send_text(message_json)
            except Exception:
                disconnected.add(connection)
        
        # Clean up disconnected connections
        if disconnected:
            async with self._lock:
                self.active_connections -= disconnected

    async def broadcast_entity_upsert(self, entity: dict):
        await self.broadcast({
            "t": "entity.upsert",
            "data": entity
        })

    async def broadcast_relationship_upsert(self, relationship: dict):
        await self.broadcast({
            "t": "relationship.upsert",
            "data": relationship
        })


# Global connection manager instance
manager = ConnectionManager()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
from .state import meta, graph

app = FastAPI(title="HALCYON Ontology", version="0.1.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.on_event("startup")
async def on_startup():
    await meta.start()

@app.on_event("shutdown")
async def on_shutdown():
    await meta.stop()
    await graph.close()

def create_app():
    return app

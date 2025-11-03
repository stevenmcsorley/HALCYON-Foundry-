from fastapi import FastAPI
from .routes import router
from .state import meta, graph

app = FastAPI(title="HALCYON Ontology", version="0.1.0")
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

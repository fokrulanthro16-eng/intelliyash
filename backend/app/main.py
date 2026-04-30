from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, health, models, projects, settings, system, keys, logs
from app.db.database import init_db
from app.services.llm_service import service
from app.api.settings import load_persisted


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    await service.boot()
    await load_persisted()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# chat.router has no prefix of its own — we add /api here
app.include_router(chat.router, prefix="/api")

# these routers already carry /api in their own prefix
app.include_router(health.router)
app.include_router(models.router)
app.include_router(settings.router)
app.include_router(system.router)
app.include_router(projects.router)
app.include_router(keys.router)
app.include_router(keys.v1_router)
app.include_router(logs.router)


@app.get("/")
def root():
    return {"status": "IntelliYash backend running"}

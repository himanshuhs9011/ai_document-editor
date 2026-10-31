"""FastAPI entry point: connects storage, builds services, mounts routes, and runs the server."""
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src import cache
from src.config import settings
from src.db import database
from src.deps import build_services
from src.routes import ai, auth, billing, chat, documents, health, keys, sessions, studio

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.connect(settings.database_url)
    await cache.connect(settings.redis_url)
    services = build_services()
    await services.llm.initialize()
    app.state.services = services
    yield
    await services.llm.close()
    await cache.close()
    await database.close()


app = FastAPI(title="Document AI Editor", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Disposition"],
)

for module in (auth, chat, ai, studio, documents, sessions, keys, billing, health):
    app.include_router(module.router)


if __name__ == "__main__":
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)

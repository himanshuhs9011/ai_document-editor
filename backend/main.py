"""FastAPI entry point: connects storage, builds services, mounts the routes for this mode, and runs the server.

APP_MODE decides what this process is:
- server:  everything on one server (the web version).
- gateway: online accounts, plans, API keys and the AI gateway; no documents are stored here.
- local:   the desktop app on the user's PC: documents, sessions and chats in a local file, AI through the gateway.
- standalone: the desktop app with no server at all: accounts, keys and documents in the local file; AI runs on
  each user's own API key.
"""
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from src import cache
from src.config import settings
from src.db import database
from src.deps import build_services
from src.routes import account_proxy, ai, auth, billing, chat, documents, gateway, health, keys, sessions, studio
from src.routes.frontend import mount_frontend

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

LOCAL = settings.app_mode == "local"
DESKTOP = settings.app_mode in ("local", "standalone")
ROUTES = {
    "server": (auth, chat, ai, studio, documents, sessions, keys, billing, health),
    "gateway": (auth, keys, billing, gateway, health),
    "local": (account_proxy, chat, ai, studio, documents, sessions, health),
    "standalone": (auth, chat, ai, studio, documents, sessions, keys, billing, health),
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.connect(settings.database_url)
    await cache.connect(settings.redis_url)
    services = build_services()
    if LOCAL:
        services.llm.is_initialized = True  # the gateway decides whether AI is available
    elif settings.app_mode != "standalone":
        await services.llm.initialize()  # standalone has no model of its own: AI runs on users' keys
    app.state.services = services
    yield
    await services.llm.close()
    if services.gateway:
        await services.gateway.close()
    await cache.close()
    await database.close()


app = FastAPI(title="Document AI Editor", version="2.0.0", lifespan=lifespan)

if DESKTOP:
    # Only this PC may call the desktop app's server; a web page using DNS tricks to reach it is turned away.
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Disposition"],
)

for module in ROUTES[settings.app_mode]:
    app.include_router(module.router)

if DESKTOP and settings.frontend_dir:
    mount_frontend(app, settings.frontend_dir)


if __name__ == "__main__":
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)

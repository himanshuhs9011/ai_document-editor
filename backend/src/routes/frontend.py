"""Desktop app: the backend also serves the built web app, so the app and its API share one local address."""
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

RESERVED = ("api/", "gateway/", "docs", "openapi.json")


def mount_frontend(app: FastAPI, folder: str) -> None:
    root = Path(folder).resolve()
    index = root / "index.html"
    if not index.is_file():
        raise RuntimeError(f"FRONTEND_DIR has no index.html: {root}")

    @app.get("/{path:path}", include_in_schema=False)
    async def web_app(path: str):
        if path.startswith(RESERVED):
            raise HTTPException(status_code=404, detail="Not Found")
        file = (root / path).resolve()
        # Real files (scripts, styles, icons) are served as they are; every other path is a page of the app.
        if path and file.is_file() and root in file.parents:
            return FileResponse(file)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

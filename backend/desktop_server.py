"""Entry point of the backend bundled inside the Windows app (packaged with PyInstaller, started by Electron).

Electron passes the port, the database file, the gateway address and the web app folder as environment variables.
The server only listens on this PC (127.0.0.1).
"""
import os

# Settings are read when the app is imported, so the mode is fixed first: standalone (no server) unless the app
# was given an online gateway, in which case Electron passes APP_MODE=local.
if os.environ.get("APP_MODE") not in ("local", "standalone"):
    os.environ["APP_MODE"] = "standalone"

import uvicorn  # noqa: E402

from main import app  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8000")), log_level="warning")

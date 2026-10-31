"""Turn an async stream of {"event", "data"} dicts into a server-sent-events HTTP response."""
import json
from typing import AsyncIterator

from fastapi.responses import StreamingResponse


def sse_response(events: AsyncIterator[dict]) -> StreamingResponse:
    async def body():
        async for event in events:
            yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"

    return StreamingResponse(body(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

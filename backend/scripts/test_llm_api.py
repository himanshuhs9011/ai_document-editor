"""Quick sanity check for the /api/chat endpoint.

Run this script while the backend (uvicorn) server is running. It will send a
sample prompt to the LLM endpoint and print the returned Markdown so you can
verify the service is responsive and producing structured output.

Usage:
    python test_llm_api.py "Write an application for sick leave"

If no argument is supplied, a default prompt is used.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from typing import Any, Dict

import requests

API_URL = "http://127.0.0.1:8000/api/chat"
DEFAULT_PROMPT = "Write a formal two-day sick leave application"


def pretty_print_response(payload: Dict[str, Any]) -> None:
    """Print key pieces of the response in a readable format."""
    response = payload.get("response", "<no response>")
    timestamp = payload.get("timestamp")

    print("\n=== LLM API Response ===")
    if timestamp:
        try:
            formatted = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            print(f"Timestamp : {formatted.isoformat()}\n")
        except ValueError:
            print(f"Timestamp : {timestamp}\n")

    print("Markdown preview (first 500 chars):")
    print(response[:500] + ("..." if len(response) > 500 else ""))
    print("\nFull JSON payload:")
    print(json.dumps(payload, indent=2))


def main() -> None:
    prompt = " ".join(sys.argv[1:]).strip() or DEFAULT_PROMPT
    print(f"Sending prompt to {API_URL}...\nPrompt: {prompt}\n")

    try:
        resp = requests.post(API_URL, json={"content": prompt})
        resp.raise_for_status()
    except requests.RequestException as exc:
        print(f"Request failed: {exc}")
        sys.exit(1)

    try:
        payload: Dict[str, Any] = resp.json()
    except ValueError:
        print("Endpoint did not return JSON:")
        print(resp.text)
        sys.exit(1)

    pretty_print_response(payload)


if __name__ == "__main__":
    main()

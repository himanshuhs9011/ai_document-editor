"""Number retrieved passages so answers can cite them as [1], [2] and the UI can show where they came from."""
from typing import List, Tuple

SNIPPET_CHARS = 300


class SourceList:
    def __init__(self):
        self.items: List[dict] = []

    def add(self, found: List[dict]) -> List[Tuple[int, dict]]:
        """Register passages (reusing numbers for ones already cited) and return them with their numbers."""
        numbered = []
        for passage in found:
            existing = next((s for s in self.items if s["content"] == passage["content"]), None)
            if not existing:
                existing = {**passage, "n": len(self.items) + 1}
                self.items.append(existing)
            numbered.append((existing["n"], existing))
        return numbered

    @staticmethod
    def prompt_block(numbered: List[Tuple[int, dict]]) -> str:
        return "\n\n".join(f"[{n}] ({source['filename']}) {source['content']}" for n, source in numbered)

    def public(self) -> List[dict]:
        return [{"n": s["n"], "document_id": s["document_id"], "filename": s["filename"],
                 "snippet": s["content"][:SNIPPET_CHARS]} for s in self.items]

"""What a profession playbook is made of: the brief it asks for, its crew of specialists and reviewers, its rules."""
from dataclasses import dataclass
from typing import Tuple


@dataclass(frozen=True)
class Field:
    """One question in the playbook's brief form."""
    id: str
    label: str
    hint: str = ""
    kind: str = "text"  # text | long | choice
    options: Tuple[str, ...] = ()
    required: bool = False


@dataclass(frozen=True)
class Format:
    """A document type within the profession, with the structure its planner should follow."""
    id: str
    name: str
    structure: str


@dataclass(frozen=True)
class Specialist:
    """A sub-agent that drafts the sections it is assigned; `method` is its craft knowledge."""
    id: str
    name: str
    craft: str
    method: str


@dataclass(frozen=True)
class Reviewer:
    """A sub-agent that critiques the whole draft against `checks` and returns issues to fix."""
    id: str
    name: str
    craft: str
    checks: str


@dataclass(frozen=True)
class Playbook:
    id: str
    name: str
    group: str
    summary: str
    formats: Tuple[Format, ...]
    fields: Tuple[Field, ...]
    specialists: Tuple[Specialist, ...]
    reviewers: Tuple[Reviewer, ...]
    style: str
    safety: str = ""
    notice: str = ""
    max_sections: int = 7

    def format(self, format_id: str) -> Format:
        return next((f for f in self.formats if f.id == format_id), self.formats[0])

    def specialist(self, specialist_id: str) -> Specialist:
        return next((s for s in self.specialists if s.id == specialist_id), self.specialists[0])

    def public(self) -> dict:
        """What the Studio UI needs to show and fill the playbook."""
        return {
            "id": self.id, "name": self.name, "group": self.group, "summary": self.summary, "notice": self.notice,
            "formats": [{"id": f.id, "name": f.name} for f in self.formats],
            "fields": [{"id": f.id, "label": f.label, "hint": f.hint, "kind": f.kind, "options": list(f.options),
                        "required": f.required} for f in self.fields],
            "specialists": [{"id": s.id, "name": s.name, "craft": s.craft} for s in self.specialists],
            "reviewers": [{"id": r.id, "name": r.name, "craft": r.craft} for r in self.reviewers],
            "max_sections": self.max_sections,
        }

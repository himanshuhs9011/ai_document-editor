"""Prompts the harness sends: the planner, a specialist drafting or revising its section, a reviewer critiquing the draft."""
from typing import List

from .house_style import HOUSE_RULES
from .playbook import Format, Playbook, Reviewer, Specialist


def specialist_system(playbook: Playbook, specialist: Specialist) -> str:
    parts = [
        f"You are the {specialist.name} on a {playbook.name.lower()} team. Your craft: {specialist.craft}.",
        f"Your method:\n{specialist.method}",
        f"Style for this kind of writing:\n{playbook.style}",
    ]
    if playbook.safety:
        parts.append(f"Rules you never break:\n{playbook.safety}")
    parts.append(HOUSE_RULES)
    return "\n\n".join(parts)


def reviewer_system(playbook: Playbook, reviewer: Reviewer) -> str:
    rules = f"\n\nThe team's non-negotiable rules:\n{playbook.safety}" if playbook.safety else ""
    return (f"You are the {reviewer.name} on a {playbook.name.lower()} team. Your craft: {reviewer.craft}.\n\n"
            f"Check the draft for:\n{reviewer.checks}{rules}")


def planner_system(playbook: Playbook) -> str:
    return (f"You are the lead editor of a {playbook.name.lower()} team. You plan documents and assign each section to the "
            f"specialist best suited to write it. Style of the team:\n{playbook.style}")


def plan(playbook: Playbook, fmt: Format, brief: str, sources: str) -> str:
    crew = "\n".join(f"- {s.id}: {s.name}, {s.craft}" for s in playbook.specialists)
    material = f"SOURCE EXCERPTS:\n{sources}\n\n" if sources else ""
    return (
        f"DOCUMENT TYPE: {fmt.name}\nUSUAL STRUCTURE: {fmt.structure}\n\n{brief}\n\n{material}"
        f"SPECIALISTS:\n{crew}\n\n"
        f"Plan the document in 2 to {playbook.max_sections} sections, following the usual structure unless the brief needs "
        "otherwise. Give each section a brief that says exactly what it must contain, using the facts in the brief.\n"
        "Reply with JSON only, in this shape:\n"
        '{"title": "Document title", "sections": [{"title": "Section title", "brief": "what it covers", "specialist": "id"}]}'
    )


def draft(title: str, fmt: Format, brief: str, outline: str, written: str, section_title: str,
          section_brief: str, sources: str) -> str:
    material = (f"SOURCES (cite as [n]):\n{sources}\n\n" if sources
                else "There are no source documents for this section; use only the brief.\n\n")
    return (
        f"You are writing part of \"{title}\" ({fmt.name}).\n\n{brief}\n\nOUTLINE:\n{outline}\n\n"
        f"WRITTEN SO FAR (for continuity; do not repeat it):\n{written or '(nothing yet)'}\n\n{material}"
        f"Write only the section \"{section_title}\": {section_brief}\n"
        f"Start with the heading \"## {section_title}\"."
    )


def review(draft_sections: str) -> str:
    return (
        f"DRAFT (sections are numbered [S1], [S2], ...):\n{draft_sections}\n\n"
        "List the problems you find, most serious first, at most 6. Reply with JSON only:\n"
        '{"issues": [{"section": 1, "severity": "high", "problem": "what is wrong, quoting the text", '
        '"fix": "exactly what to change"}]}\n'
        'Severity is "high" (wrong, unsafe or invented), "medium" (weak or unclear) or "low" (polish). '
        'Reply {"issues": []} if the draft has no real problems. Do not invent problems.'
    )


def revise(section: str, issues: List[dict]) -> str:
    notes = "\n".join(f"- ({i['severity']}) {i['problem']} Fix: {i['fix']}" for i in issues)
    return (
        f"YOUR SECTION:\n{section}\n\nREVIEWERS' NOTES:\n{notes}\n\n"
        "Revise the section to address every note that is correct. Keep everything that works. "
        "Return the complete revised section, starting with its heading."
    )

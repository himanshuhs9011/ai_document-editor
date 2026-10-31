"""Detect [Your Name]-style placeholders and fill them from details the user typed."""
import re
from typing import Dict

from .. import cache

DETAILS_TTL = 7 * 24 * 3600

PLACEHOLDER_PATTERN = re.compile(
    r"\[(?:Your|Manager|Recipient|Sender|Name|Date|Subject|Title|Company|Region|Phone|Email)[^\]]*\]",
    re.IGNORECASE,
)

DETAIL_PATTERNS = {
    "applicant_name": re.compile(r"(?:my\s+name|name)\s*[-:=]\s*([^\n]+)", re.IGNORECASE),
    "manager_name": re.compile(r"(?:manager|mgr)\s*[-:=]\s*([^\n]+)", re.IGNORECASE),
    "email": re.compile(r"(?:email|mail)\s*[-:=]\s*([^\s]+@[^\s]+)", re.IGNORECASE),
    "phone": re.compile(r"(?:phone|mobile|number|contact)\s*[-:=]\s*([^\n]+)", re.IGNORECASE),
    "title": re.compile(r"(?:title|designation)\s*[-:=]\s*([^\n]+)", re.IGNORECASE),
    "company": re.compile(r"(?:company|organization)\s*[-:=]\s*([^\n]+)", re.IGNORECASE),
    "region": re.compile(r"(?:region|branch|location)\s*[-:=]\s*([^\n]+)", re.IGNORECASE),
}

CANONICAL = {
    "applicant_name": "[Your Name]",
    "manager_name": "[Manager Name]",
    "email": "[Email]",
    "phone": "[Phone]",
    "title": "[Your Title]",
    "company": "[Company Name]",
    "region": "[Region]",
}

VARIANTS = {
    "applicant_name": r"\[?your\s+name\]?",
    "manager_name": r"\[?manager\s+name\]?",
    "email": r"\[?email(?:\s+address)?\]?",
    "phone": r"\[?(?:phone|contact|number)\]?",
    "title": r"\[?(?:your\s+title|designation)\]?",
    "company": r"\[?(?:company\s+name|organization)\]?",
    "region": r"\[?(?:region|location|branch)\]?",
}


def has_placeholders(text: str) -> bool:
    return bool(text) and bool(PLACEHOLDER_PATTERN.search(text))


def normalize_placeholders(content: str) -> str:
    if not content:
        return ""
    for key, pattern in VARIANTS.items():
        content = re.sub(pattern, CANONICAL[key], content, flags=re.IGNORECASE)
    return content


def fill_placeholders(content: str, details: Dict[str, str]) -> str:
    filled = normalize_placeholders(content)
    for key, placeholder in CANONICAL.items():
        if details.get(key):
            filled = filled.replace(placeholder, details[key])
    return filled


def extract_details(message: str) -> Dict[str, str]:
    details = {}
    for key, pattern in DETAIL_PATTERNS.items():
        match = pattern.search(message or "")
        value = match.group(1).strip().strip("\"'") if match else ""
        if value:
            details[key] = value
    return details


async def known_details(session_id: str, new_details: Dict[str, str]) -> Dict[str, str]:
    """Merge details typed in this message with those remembered for the session."""
    stored = await cache.get_json(f"details:{session_id}") or {}
    if new_details:
        stored.update({key: value.strip() for key, value in new_details.items() if value})
        await cache.set_json(f"details:{session_id}", stored, DETAILS_TTL)
    return stored

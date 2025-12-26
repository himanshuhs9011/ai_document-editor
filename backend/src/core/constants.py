"""
Application constants.
All regex patterns, keywords, and static values used throughout the application.
"""
import re
from typing import Dict, List, Pattern


# =============================================================================
# PLACEHOLDER PATTERNS
# =============================================================================

PLACEHOLDER_PATTERN: Pattern = re.compile(
    r"\[(?:Your|Manager|Recipient|Sender|Name|Date|Subject|Title|Company|Region|Phone|Email)[^\]]*\]",
    re.IGNORECASE
)

# Patterns to extract user details from free-text messages
DETAIL_PATTERNS: Dict[str, Pattern] = {
    "applicant_name": re.compile(r"(?:my\s+name|name)\s*[-:=]\s*([^\n]+)", re.IGNORECASE),
    "manager_name": re.compile(r"(?:manager|mgr)\s*[-:=]\s*([^\n]+)", re.IGNORECASE),
    "email": re.compile(r"(?:email|mail)\s*[-:=]\s*([^\s]+@[^\s]+)", re.IGNORECASE),
    "phone": re.compile(r"(?:phone|mobile|number|contact)\s*[-:=]\s*([^\n]+)", re.IGNORECASE),
    "title": re.compile(r"(?:title|designation)\s*[-:=]\s*([^\n]+)", re.IGNORECASE),
    "company": re.compile(r"(?:company|organization)\s*[-:=]\s*([^\n]+)", re.IGNORECASE),
    "region": re.compile(r"(?:region|branch|location)\s*[-:=]\s*([^\n]+)", re.IGNORECASE)
}

# Canonical placeholder format for standardization
STANDARD_PLACEHOLDERS: Dict[str, str] = {
    "applicant_name": "[Your Name]",
    "manager_name": "[Manager Name]",
    "email": "[Email]",
    "phone": "[Phone]",
    "title": "[Your Title]",
    "company": "[Company Name]",
    "region": "[Region]"
}

# Variant patterns to normalize to canonical form
PLACEHOLDER_VARIANTS: Dict[str, List[str]] = {
    "applicant_name": [r"\[?your\s+name\]?"],
    "manager_name": [r"\[?manager\s+name\]?"],
    "email": [r"\[?email(?:\s+address)?\]?"],
    "phone": [r"\[?(?:phone|contact|number)\]?"],
    "title": [r"\[?(?:your\s+title|designation)\]?"],
    "company": [r"\[?(?:company\s+name|organization)\]?"],
    "region": [r"\[?(?:region|location|branch)\]?"]
}


# =============================================================================
# INTENT DETECTION KEYWORDS
# =============================================================================

# Keywords indicating document creation intent
DOCUMENT_CREATE_KEYWORDS: List[str] = [
    "application", "write", "draft", "create", "prepare", 
    "compose", "report", "request", "letter", "notice", 
    "resume", "cv"
]

# Keywords indicating user is providing details
DETAIL_KEYWORDS: List[str] = [
    "name", "email", "manager", "phone", 
    "contact", "title", "company", "region"
]

# Keywords indicating document modification intent
EDIT_KEYWORDS: List[str] = [
    "update", "change", "modify", "edit", "add", 
    "replace", "remove", "rewrite", "improve", 
    "expand", "concise", "shorten", "lengthen"
]


# =============================================================================
# OUTPUT VALIDATION
# =============================================================================

# Phrases that should not appear in LLM output
BANNED_OUTPUT_SNIPPETS: List[str] = [
    "here is",
    "FORMATTING TEMPLATE",
    "FORMATTING GUIDELINES"
]

# HTML elements that are not allowed (security)
HTML_BLOCKLIST: List[str] = [
    "<script",
    "<iframe",
    "<object",
    "javascript:"
]


# =============================================================================
# HTML TO MARKDOWN MAPPINGS
# =============================================================================

# HTML entity replacements
HTML_ENTITIES: Dict[str, str] = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"'
}

# HTML tag to Markdown conversion patterns
HTML_TO_MD_PATTERNS: List[tuple] = [
    (r'<strong>(.*?)</strong>', r'**\1**'),
    (r'<b>(.*?)</b>', r'**\1**'),
    (r'<em>(.*?)</em>', r'*\1*'),
    (r'<i>(.*?)</i>', r'*\1*'),
    (r'<h1>(.*?)</h1>', r'# \1\n\n'),
    (r'<h2>(.*?)</h2>', r'## \1\n\n'),
    (r'<h3>(.*?)</h3>', r'### \1\n\n'),
    (r'<h4>(.*?)</h4>', r'#### \1\n\n'),
    (r'<ul>(.*?)</ul>', r'\1\n'),
    (r'<ol>(.*?)</ol>', r'\1\n'),
    (r'<li>(.*?)</li>', r'- \1\n'),
    (r'<p>(.*?)</p>', r'\1\n\n'),
    (r'<br\s*/?>', '\n'),
    (r'<div>(.*?)</div>', r'\1\n'),
]

# Header keywords for markdown fixing
HEADER_KEYWORDS: List[str] = [
    "Date", "To", "From", "Subject", "Title", "Prepared by"
]

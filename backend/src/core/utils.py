"""
Utility functions for text processing and document formatting.
"""
import re
from typing import Dict, Optional, List, Any

from .constants import (
    DETAIL_PATTERNS,
    STANDARD_PLACEHOLDERS,
    PLACEHOLDER_VARIANTS,
    DOCUMENT_CREATE_KEYWORDS,
    DETAIL_KEYWORDS,
    EDIT_KEYWORDS,
    BANNED_OUTPUT_SNIPPETS,
    HTML_BLOCKLIST,
    HTML_ENTITIES,
    HTML_TO_MD_PATTERNS,
    HEADER_KEYWORDS
)


# =============================================================================
# PLACEHOLDER HANDLING
# =============================================================================

def normalize_placeholders(content: Optional[str]) -> str:
    """
    Normalize placeholder variants to a canonical bracketed form.
    
    Args:
        content: Text content that may contain placeholder variants.
        
    Returns:
        Content with normalized placeholders.
    """
    if not content:
        return ""

    normalized = content
    for key, variants in PLACEHOLDER_VARIANTS.items():
        canonical = STANDARD_PLACEHOLDERS.get(key)
        if not canonical:
            continue
        for pattern in variants:
            normalized = re.sub(pattern, canonical, normalized, flags=re.IGNORECASE)
    return normalized


def replace_placeholders_python(content: str, session_state: Dict[str, str]) -> str:
    """
    Replace canonical placeholders using cached session details only.
    
    Args:
        content: Text with placeholders to replace.
        session_state: Dictionary of user details.
        
    Returns:
        Content with placeholders replaced by actual values.
    """
    if not content:
        return content
    
    updated_content = normalize_placeholders(content)
    for key, placeholder in STANDARD_PLACEHOLDERS.items():
        replacement = session_state.get(key)
        if replacement and placeholder in updated_content:
            updated_content = updated_content.replace(placeholder, replacement)
    return updated_content


# =============================================================================
# USER DETAIL EXTRACTION
# =============================================================================

def extract_user_details(message: str) -> Dict[str, str]:
    """
    Extract structured details like name/manager/email from user free-text.
    
    Args:
        message: User's input message.
        
    Returns:
        Dictionary of extracted details.
    """
    details = {}
    if not message:
        return details

    for key, pattern in DETAIL_PATTERNS.items():
        match = pattern.search(message)
        if match:
            value = match.group(1).strip().strip('"\'')
            if value:
                details[key] = value
    return details


# =============================================================================
# MARKDOWN PROCESSING
# =============================================================================

def clean_markdown_output(markdown: str) -> str:
    """
    Light post-processing to reduce obvious placeholders while preserving style.
    
    Args:
        markdown: Raw markdown content.
        
    Returns:
        Cleaned markdown content.
    """
    if not markdown:
        return markdown

    cleaned = markdown

    # Normalize placeholder variants but keep canonical bracketed form
    cleaned = normalize_placeholders(cleaned)

    # Collapse excessive blank lines
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)

    return cleaned.strip()


def fix_markdown_formatting(content: str) -> str:
    """
    Aggressively fix malformed Markdown syntax.
    
    Args:
        content: Markdown content that may have formatting issues.
        
    Returns:
        Fixed markdown content.
    """
    if not content:
        return content
    
    fixed = content
    
    # Fix escaped asterisks and brackets
    fixed = re.sub(r'\\\\?\*', '*', fixed)
    fixed = re.sub(r'\\\\?\[', '[', fixed)
    fixed = re.sub(r'\\\\?\]', ']', fixed)
    
    # Fix malformed bold (multiple asterisks)
    fixed = re.sub(r'\*{3,}', '**', fixed)
    
    # Fix bold with spaces inside
    fixed = re.sub(r'\*\*\s+([^*]+?)\s+\*\*', r'**\1**', fixed)

    # Build header pattern dynamically
    header_pattern = '|'.join(HEADER_KEYWORDS)
    
    # Fix leading spaces in headers
    fixed = re.sub(rf'\*\*\s+({header_pattern})', r'**\1', fixed)
    
    # Fix missing space after bold labels ending with colon
    fixed = re.sub(r'(\*\*[^*:]+:\*\*)([A-Za-z0-9])', r'\1 \2', fixed)

    # Fix missing space after colon inside bold
    fixed = re.sub(r'(\*\*[^*:]+:)([^\s*])', r'\1 \2', fixed)

    # Fix bold followed immediately by another bold
    fixed = re.sub(r'(\*\*[^*]+\*\*)(\*\*)', r'\1\n\n\2', fixed)

    # Fix headers running together on same line
    fixed = re.sub(
        rf'([^\n])(\*\*\s*(?:{header_pattern})\s*:)', 
        r'\1\n\n\2', 
        fixed, 
        flags=re.IGNORECASE
    )
    
    # Fix missing space between label and value when colon is outside bold
    fixed = re.sub(r'(:\*\*)([A-Za-z0-9\[])', r':** \2', fixed)
    
    # Ensure proper spacing around paragraphs (no triple newlines)
    fixed = re.sub(r'\n{3,}', '\n\n', fixed)
    
    # Remove trailing spaces
    fixed = '\n'.join(line.rstrip() for line in fixed.split('\n'))
    
    return fixed.strip()


# =============================================================================
# HTML PROCESSING
# =============================================================================

def html_to_markdown(html_content: str) -> str:
    """
    Convert HTML to clean Markdown format.
    
    Args:
        html_content: HTML string to convert.
        
    Returns:
        Markdown formatted string.
    """
    if not html_content:
        return ""
    
    md = html_content
    
    # Convert HTML tags to Markdown syntax
    for pattern, replacement in HTML_TO_MD_PATTERNS:
        md = re.sub(pattern, replacement, md, flags=re.DOTALL)
    
    # Remove any remaining HTML tags
    md = re.sub(r'<[^>]+>', '', md)
    
    # Clean up excessive newlines
    md = re.sub(r'\n{3,}', '\n\n', md)
    
    # Decode HTML entities
    for entity, char in HTML_ENTITIES.items():
        md = md.replace(entity, char)
    
    return md.strip()


# =============================================================================
# CONTENT VALIDATION
# =============================================================================

def enforce_html_guardrails(content: str) -> str:
    """
    Reject unsafe HTML fragments before returning to the client.
    
    Args:
        content: Content to validate.
        
    Returns:
        Validated content.
        
    Raises:
        ValueError: If unsafe HTML is detected.
    """
    lowered = content.lower()
    for snippet in HTML_BLOCKLIST:
        if snippet in lowered:
            raise ValueError("Unsafe HTML fragment detected in model output.")
    return content


def enforce_output_rules(content: str) -> str:
    """
    Lightweight guard to strip banned phrases and orphan placeholders.
    
    Args:
        content: LLM output to validate.
        
    Returns:
        Validated and normalized content.
        
    Raises:
        ValueError: If output violates formatting rules.
    """
    normalized = normalize_placeholders(content)
    lowered = normalized.lower()
    for snippet in BANNED_OUTPUT_SNIPPETS:
        if snippet.lower() in lowered:
            raise ValueError("Output violated formatting guardrails.")
    return normalized.strip()


# =============================================================================
# INTENT DETECTION
# =============================================================================

def detect_intent(
    message_lower: str, 
    has_document: bool, 
    has_details: bool, 
    contains_placeholder: bool
) -> str:
    """
    Deterministic 80/20 intent router to keep agents separated.
    
    Args:
        message_lower: Lowercase user message.
        has_document: Whether a document context exists.
        has_details: Whether user details were extracted.
        contains_placeholder: Whether message contains placeholders.
        
    Returns:
        Intent string: 'fill_placeholders', 'create_document', 
                      'modify_document', 'collect_details', or 'chat'
    """
    if contains_placeholder and has_document and has_details:
        return "fill_placeholders"
    if not has_document and any(keyword in message_lower for keyword in DOCUMENT_CREATE_KEYWORDS):
        return "create_document"
    if has_document and any(keyword in message_lower for keyword in EDIT_KEYWORDS):
        return "modify_document"
    if has_details and any(keyword in message_lower for keyword in DETAIL_KEYWORDS):
        return "collect_details"
    return "chat"


# =============================================================================
# TEXT UTILITIES
# =============================================================================

def split_text_into_chunks(
    text: str, 
    chunk_size: int = 1000, 
    overlap: int = 200
) -> List[str]:
    """
    Split text into overlapping chunks for better retrieval.
    
    Args:
        text: Text to split.
        chunk_size: Maximum size of each chunk.
        overlap: Number of characters to overlap between chunks.
        
    Returns:
        List of text chunks.
    """
    if len(text) <= chunk_size:
        return [text]
    
    chunks = []
    start = 0
    
    while start < len(text):
        end = start + chunk_size
        
        # Try to break at a sentence or paragraph boundary
        if end < len(text):
            # Look for paragraph break
            para_break = text.rfind('\n\n', start, end)
            if para_break > start + chunk_size // 2:
                end = para_break + 2
            else:
                # Look for sentence break
                sentence_break = text.rfind('. ', start, end)
                if sentence_break > start + chunk_size // 2:
                    end = sentence_break + 2
        
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        
        start = end - overlap
    
    return chunks


def truncate_text(text: str, max_length: int = 100, suffix: str = "...") -> str:
    """
    Truncate text to maximum length with suffix.
    
    Args:
        text: Text to truncate.
        max_length: Maximum length including suffix.
        suffix: String to append when truncating.
        
    Returns:
        Truncated text.
    """
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix

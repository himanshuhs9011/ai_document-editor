"""Every prompt sent to the model, in one place."""
from typing import Dict


def conversation_summary(history: str) -> str:
    return f"""Please provide a concise summary of the following conversation:

{history}

Summary should include:
- Main topics discussed
- Key decisions or agreements
- Important information shared
- Current status or next steps

Keep the summary brief but comprehensive."""


def rolling_summary(history: str) -> str:
    return f"""Summarize this previous conversation concisely to preserve key context for ongoing chat:

{history}

Focus on:
- Main topics and decisions
- Key facts or user preferences
- Open questions or next steps

Keep it under 200 words."""


def toolbar_rewrite(instruction: str, selection: str) -> str:
    return (
        "You are a precise Text Editor Agent.\n"
        "Your task is to rewrite the provided text exactly according to the instruction.\n\n"
        f"INSTRUCTION: {instruction}\n\n"
        f"TEXT TO REWRITE:\n{selection}\n\n"
        "RULES:\n"
        "1. Return ONLY the rewritten text.\n"
        "2. Do NOT include any conversational filler (e.g., 'Here is the rewritten text', 'Sure').\n"
        "3. Do NOT add headers (Date, To, From) unless explicitly asked.\n"
        "4. Do NOT use Markdown formatting like bolding the whole text.\n"
        "5. Maintain the original meaning unless asked to change it.\n"
        "6. If asked to summarize, provide a clean paragraph summary.\n\n"
        "REWRITTEN TEXT:"
    )


def fill_placeholders(details: Dict[str, str], document: str) -> str:
    detail_lines = "\n".join(f"- {key.replace('_', ' ').title()}: {value}" for key, value in details.items())
    return (
        "You are the Writer Agent. Fill in the placeholders in the existing document using the provided details.\n\n"
        "RULES:\n"
        "1. Replace only the matching placeholders (e.g., [Your Name], [Manager Name], [Email]).\n"
        "2. DO NOT change the wording, structure, or tone of the document.\n"
        "3. If a detail was not provided, keep the placeholder as-is.\n"
        "4. Output clean Markdown only – no explanations.\n"
        "5. Never rewrite this into a memo or strategy document.\n\n"
        f"DETAILS PROVIDED:\n{detail_lines}\n\n"
        f"DOCUMENT TO UPDATE:\n{document}\n\n"
        "Return the updated document content only:"
    )


def update_document(document: str, request: str, passages: str = "") -> str:
    related = f"RELATED PASSAGES FROM THE FULL DOCUMENT:\n{passages}\n\n" if passages else ""
    return (
        "You are a document assistant. Help update this document based on the user's request.\n\n"
        f"DOCUMENT:\n{document}\n\n"
        f"{related}"
        f"USER REQUEST:\n{request}\n\n"
        "Return the updated document. Keep the original structure unless asked to change it."
    )


def write_document(context: str, request: str) -> str:
    return (
        "You are the Writer Agent.\n\n"
        f"Context:\n{context}\n\n"
        "Your job is to write a professional document based on the user's request.\n"
        "Use clean Markdown formatting. No explanations.\n\n"
        f"REQUEST: {request}\n\n"
        "Write the document now:"
    )


def assistant_reply(context: str, message: str) -> str:
    return (
        "You are a helpful AI assistant.\n\n"
        f"Context:\n{context}\n\n"
        f"User message: {message}\n\n"
        "Respond naturally and helpfully."
    )







def answer_from_document(document: str, passages: str, history: str, question: str) -> str:
    related = f"\nRELATED PASSAGES FROM THE FULL DOCUMENT:\n{passages}\n" if passages else ""
    return (
        "Answer the user's question about their document. Be concise and accurate, use Markdown, "
        "and say so if the document does not contain the answer. Do not rewrite the document.\n\n"
        f"DOCUMENT:\n{document}\n{related}\n"
        f"RECENT CONVERSATION:\n{history}\n\n"
        f"QUESTION: {question}"
    )


def answer_from_sources(sources: str, question: str) -> str:
    return (
        "Answer the question using only the numbered sources from the user's documents. "
        "Cite every fact with its source number in square brackets, like [1] or [2][3]. "
        "If the sources do not contain the answer, say that plainly.\n\n"
        f"SOURCES:\n{sources}\n\n"
        f"QUESTION: {question}"
    )


INLINE_ACTIONS = {
    "continue": "Continue writing naturally from where the text ends, in the same tone and style. Write one or two paragraphs.",
    "improve": "Improve the writing of the text: clearer, more fluent, same meaning.",
    "shorter": "Make the text shorter while keeping its key points.",
    "longer": "Expand the text with more detail and explanation, in the same style.",
    "grammar": "Fix the spelling, grammar and punctuation of the text. Change nothing else.",
    "formal": "Rewrite the text in a formal, professional tone.",
    "summarize": "Summarize the text in a short paragraph.",
    "translate": "Translate the text into {argument}.",
    "table": "Create a Markdown table for: {argument}. Use the text as context when relevant.",
    "ask": "{argument}",
}


def inline_action(action: str, text: str, context: str, argument: str) -> str:
    instruction = INLINE_ACTIONS[action].format(argument=argument or "English")
    surrounding = f"SURROUNDING DOCUMENT (for context only):\n{context}\n\n" if context else ""
    return (
        f"{surrounding}TEXT:\n{text}\n\n"
        f"TASK: {instruction}\n\n"
        "Return only the resulting text in Markdown, with no introduction, labels or quotation marks."
    )


def autocomplete(before: str, after: str) -> str:
    following = f"\n\nTEXT AFTER THE CURSOR:\n{after}" if after else ""
    return (
        "Suggest how the writer's sentence continues at the cursor: at most 20 words, "
        "same language and tone. Return only the continuation text, no quotes, nothing else.\n\n"
        f"TEXT BEFORE THE CURSOR:\n{before}{following}"
    )

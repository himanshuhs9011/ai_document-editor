"""
Chat and document editing routes.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from typing import Dict, Optional, List, Any
import re

from ..services.auth_dependencies import get_current_user
from ..models.user import UserResponse
from ..models.schemas import VectorSearchResult
from ..core.constants import (
    PLACEHOLDER_PATTERN, STANDARD_PLACEHOLDERS, 
    DOCUMENT_CREATE_KEYWORDS, EDIT_KEYWORDS, DETAIL_KEYWORDS,
    BANNED_OUTPUT_SNIPPETS, HTML_BLOCKLIST
)
from ..core.utils import (
    clean_markdown_output, extract_user_details, normalize_placeholders,
    fix_markdown_formatting, replace_placeholders_python, 
    enforce_html_guardrails, enforce_output_rules, html_to_markdown, detect_intent
)
from ..core.session_state import get_session_state, update_session_state_cache

router = APIRouter(tags=["chat"])

# Services (will be set by main app)
document_service: Any = None
llm_service: Any = None
vector_service: Any = None
document_agent: Any = None


def set_services(doc_service: Any, llm_svc: Any, vec_service: Any, doc_agent: Any) -> None:
    """Set the service instances."""
    global document_service, llm_service, vector_service, document_agent
    document_service = doc_service
    llm_service = llm_svc
    vector_service = vec_service
    document_agent = doc_agent


# Simple chat patterns for quick responses
SIMPLE_CHAT_PATTERNS = [
    "hi", "hello", "hey", "thanks", "thank you", "ok", "okay", 
    "good", "great", "nice", "cool", "what's up", "how are you",
    "test", "testing", "check", "looks good", "perfect", "awesome"
]


def _is_simple_chat(message: str) -> bool:
    """Check if message is a simple chat that needs a quick response."""
    lower = message.lower().strip()
    return (
        (len(lower) < 25 and any(pattern in lower for pattern in SIMPLE_CHAT_PATTERNS)) or
        any(lower.startswith(pattern) for pattern in ["thanks", "thank you", "hi", "hello", "hey", "ok", "okay", "great", "good", "nice"])
    )


def _get_simple_chat_response(message: str) -> str:
    """Get a simple response for basic chat messages."""
    lower = message.lower().strip()
    if any(thanks in lower for thanks in ["thanks", "thank you"]):
        return "You're welcome! Is there anything else I can help you with?"
    elif any(greet in lower for greet in ["hi", "hello", "hey"]):
        return "Hello! I'm your AI document assistant. How can I help you today?"
    elif any(test in lower for test in ["test", "testing", "check"]):
        return "I'm working perfectly! Ready to help you with document editing and creation."
    elif any(positive in lower for positive in ["good", "great", "nice", "perfect", "looks good", "awesome"]):
        return "Great! I'm glad you're happy with the result. Let me know if you need any other changes."
    else:
        return "I'm here to help with your documents. What would you like me to do?"


@router.post("/api/document/edit")
async def edit_document_simple(
    request: dict,
    current_user: UserResponse = Depends(get_current_user)
):
    """Document edit endpoint with AI agent integration (requires authentication)."""
    try:
        content = request.get("content", "")
        session_id = request.get("session_id", "default")
        message = request.get("message", "")
        
        print(f"\n🔥 === DOCUMENT EDIT REQUEST === 🔥")
        print(f"📝 Session: {session_id}")
        print(f"💬 Message: '{message}'")
        print(f"📄 Content length: {len(content)}")
        
        if not message:
            return {
                "document_content": content,
                "operation_type": "suggest_changes", 
                "session_id": session_id,
                "suggestions": [{
                    "type": "error",
                    "suggestion": "Please provide a message to process.",
                    "target_section": "general"
                }]
            }
        
        # Extract user details and get session state
        user_details = extract_user_details(message)
        session_state = get_session_state(session_id)
        if user_details:
            session_state = update_session_state_cache(session_id, user_details)
        
        # Handle simple chat messages
        if _is_simple_chat(message):
            print("💬 Simple chat detected - providing direct response")
            return {
                "document_content": content,
                "operation_type": "chat_response", 
                "session_id": session_id,
                "suggestions": [{
                    "type": "chat_response",
                    "new_text": _get_simple_chat_response(message),
                    "confidence": 1.0,
                    "explanation": "Simple chat response",
                    "target_section": "chat"
                }]
            }
        
        # Convert HTML to Markdown for consistent processing
        if content.strip() and "<" in content and ">" in content:
            print("🔄 Converting HTML content to Markdown")
            content = html_to_markdown(content)

        # Handle document creation vs editing
        if not content.strip():
            print("📝 No existing document - treating as document creation request")
            creation_context = VectorSearchResult(
                content="",
                score=1.0,
                metadata={"page_number": 1, "source": "creation_request", "type": "new_document"},
                page_number=1
            )
            context_chunks = [creation_context]
            
            response = await document_agent.process_message(
                message,
                context_chunks,
                session_id,
                "new_document"
            )
        else:
            print("📄 Existing document found - treating as edit request")

            # Handle placeholder replacement
            placeholders_exist = bool(PLACEHOLDER_PATTERN.search(content))
            if session_state and placeholders_exist:
                print("🧩 Deterministic placeholder replacement in document editor")
                normalized_doc = normalize_placeholders(content)
                replaced_doc = replace_placeholders_python(normalized_doc, session_state)

                if replaced_doc != content:
                    try:
                        safe_doc = enforce_output_rules(replaced_doc)
                        if "<" in safe_doc and ">" in safe_doc:
                            safe_doc = enforce_html_guardrails(safe_doc)
                    except ValueError as guard_error:
                        raise HTTPException(status_code=400, detail=str(guard_error))

                    await document_service.add_message_to_session(
                        session_id,
                        "assistant",
                        "[PLACEHOLDER-FILL] Placeholders replaced using cached details."
                    )

                    return {
                        "document_content": safe_doc,
                        "operation_type": "update_fields",
                        "session_id": session_id,
                        "suggestions": []
                    }

            # Create context chunks for agent
            search_result = VectorSearchResult(
                content=content,
                score=1.0,
                metadata={"page_number": 1, "source": "document"},
                page_number=1
            )
            context_chunks = [search_result]
            
            response = await document_agent.process_message(
                message,
                context_chunks,
                session_id,
                "default"
            )
        
        print(f"✅ AI Response received: {type(response)}")
        
        # Parse response
        suggestions = []
        if isinstance(response, dict):
            suggestions = response.get("suggestions", [])
            ai_response_text = response.get("response", "No response received")
        else:
            ai_response_text = str(response)
            suggestions = [{
                "type": "text_response",
                "new_text": ai_response_text,
                "confidence": 0.8,
                "explanation": "AI response",
                "target_section": "general"
            }]
        
        if suggestions and ai_response_text:
            await document_service.add_message_to_session(session_id, "assistant", ai_response_text)
        
        return {
            "document_content": content,
            "operation_type": "suggest_changes", 
            "session_id": session_id,
            "suggestions": suggestions
        }
    except Exception as e:
        print(f"❌ Document edit error: {e}")
        import traceback
        traceback.print_exc()
        content = request.get("content", "") if 'request' in locals() else ""
        return {
            "error": str(e), 
            "document_content": content, 
            "suggestions": [{
                "type": "error_fallback",
                "suggestion": f"Error: {str(e)}",
                "target_section": "general"
            }]
        }


@router.post("/api/chat")
async def chat_with_document(request: dict):
    """Chat with AI - works with or without documents."""
    try:
        message = request.get("content", "")
        document_content = request.get("document_content", "")
        session_id = request.get("session_id", "default")
        document_id = request.get("document_id", None)
        format_style = request.get("format_style", "freeform").lower()

        print(f"🎯 === CHAT REQUEST === 💬")
        print(f"💬 Message: '{message}'")
        print(f"📄 Document Content Length: {len(document_content)}")
        print(f"🆔 Session: {session_id}")

        if not message.strip():
            return {
                "response": "Please provide a message.",
                "timestamp": datetime.now().isoformat(),
                "session_id": session_id
            }

        # Record user message
        try:
            await document_service.add_message_to_session(session_id, "user", message)
        except Exception as e:
            print(f"⚠️ Could not record user message: {e}")

        message_lower = message.lower().strip()
        
        # Check if toolbar request
        is_toolbar_request = "you are assisting inside a rich text editor" in message_lower
        
        # Check for summary requests
        summarize_keywords = ["summarize", "summary", "summarise", "chat history", "conversation summary"]
        clear_summary_keywords = ["clear summary", "forget summary", "reset summary", "new summary"]
        
        is_summarize_request = any(keyword in message_lower for keyword in summarize_keywords) and not is_toolbar_request
        is_clear_summary_request = any(keyword in message_lower for keyword in clear_summary_keywords)

        chat_history = await document_service.get_session_messages(session_id) or []

        # Handle summary request
        if is_summarize_request:
            return await _handle_summary_request(session_id, chat_history)

        if is_clear_summary_request:
            return await _handle_clear_summary(session_id)

        # Get document vector context
        document_vector_context = ""
        if document_id and document_id != "default":
            try:
                vector_results = await vector_service.search_similar(message, document_id, n_results=3)
                if vector_results:
                    document_vector_context = "\n".join([
                        f"[Doc Chunk] {chunk.content[:200]}..."
                        for chunk in vector_results
                    ])
            except Exception as e:
                print(f"⚠️ Could not get document vector context: {e}")

        # Convert HTML to Markdown
        if document_content.strip() and "<" in document_content and ">" in document_content:
            print("🔄 Converting HTML document to Markdown")
            document_content = html_to_markdown(document_content)

        # Parse document content
        document_full_context, document_html_context = _parse_document_content(document_content)

        # Extract selection from toolbar request
        if is_toolbar_request and not document_full_context:
            match = re.search(r"Selected passage:\s*(.*)", message, re.DOTALL)
            if match:
                selection = match.group(1).strip()
                if selection:
                    document_full_context = selection
                    print(f"✅ Extracted selection: {len(selection)} chars")

        # Build context
        effective_history, stored_summary = await _build_effective_history(session_id, chat_history)
        
        context_parts = _build_context_parts(
            stored_summary, effective_history, document_full_context, document_vector_context
        )

        # Extract user details
        user_details = extract_user_details(message)
        session_state = get_session_state(session_id)
        if user_details:
            session_state = update_session_state_cache(session_id, user_details)

        has_existing_doc = bool(document_full_context.strip())
        placeholder_source = document_html_context or document_full_context
        contains_placeholders = bool(PLACEHOLDER_PATTERN.search(placeholder_source)) if placeholder_source else False

        # Handle toolbar requests
        if is_toolbar_request:
            intent, enhanced_prompt = _build_toolbar_prompt(message, document_full_context)
        else:
            intent = detect_intent(message_lower, has_existing_doc, bool(session_state), contains_placeholders)
            
            # Handle placeholder fill
            if intent == "fill_placeholders" and has_existing_doc and placeholder_source:
                result = await _handle_placeholder_fill(session_id, placeholder_source, session_state, intent)
                if result:
                    return result

            # Build enhanced prompt
            enhanced_prompt = _build_chat_prompt(
                message, context_parts, document_full_context, document_html_context,
                has_existing_doc, user_details, intent
            )

        # Generate response
        llm_temperature = 0.1 if intent in {"create_document", "modify_document"} else 0.3

        if llm_service and llm_service.is_initialized:
            response = await llm_service.generate_response(enhanced_prompt, temperature=llm_temperature)
            ai_response = clean_markdown_output(response.content)

            if "<" in ai_response and ">" in ai_response:
                ai_response = html_to_markdown(ai_response)

            ai_response = fix_markdown_formatting(ai_response)

            try:
                if intent != "direct_edit":
                    ai_response = enforce_output_rules(ai_response)
                
                if "<" in ai_response and ">" in ai_response:
                    ai_response = enforce_html_guardrails(ai_response)
            except ValueError as guard_error:
                ai_response = f"I could not complete that because it violated a safety rule: {guard_error}"
            
            # Remove template markers
            ai_response = _clean_template_markers(ai_response)

            await document_service.add_message_to_session(session_id, "assistant", ai_response)

            return {
                "response": ai_response,
                "timestamp": datetime.now().isoformat(),
                "session_id": session_id
            }

        error_msg = "I'm sorry, the AI service is not available right now. Please check that Ollama is running."
        await document_service.add_message_to_session(session_id, "assistant", error_msg)
        return {
            "response": error_msg,
            "timestamp": datetime.now().isoformat(),
            "session_id": session_id
        }

    except Exception as e:
        print(f"❌ Chat error: {e}")
        error_response = f"Sorry, I encountered an error: {str(e)}"
        try:
            await document_service.add_message_to_session(request.get("session_id", "default"), "assistant", error_response)
        except Exception:
            pass
        return {
            "response": error_response,
            "timestamp": datetime.now().isoformat(),
            "session_id": request.get("session_id", "default")
        }


# Helper functions

async def _handle_summary_request(session_id: str, chat_history: List[dict]) -> dict:
    """Handle chat summarization request."""
    print("📝 Chat summarization requested via /api/chat")

    if len(chat_history) <= 1:
        summary_response = "I don't have enough conversation history to summarize yet. Let's have a conversation first!"
    else:
        history_text = "\n".join([
            f"{msg.get('role', 'unknown')}: {msg.get('content', '')}"
            for msg in chat_history[:-1]
        ])

        summary_prompt = f"""
Please provide a concise summary of the following conversation:

{history_text}

Summary should include:
- Main topics discussed
- Key decisions or agreements
- Important information shared
- Current status or next steps

Keep the summary brief but comprehensive.
"""

        if llm_service and llm_service.is_initialized:
            summary_result = await llm_service.generate_response(summary_prompt)
            summary_text = clean_markdown_output(summary_result.content)
            summary_response = f"📝 **Conversation Summary:**\n\n{summary_text}"

            await document_service.add_message_to_session(
                session_id,
                "assistant",
                f"[AUTO-SUMMARY] {summary_text}"
            )
        else:
            summary_response = "I'm sorry, I can't generate a summary right now as the AI service is unavailable."
            await document_service.add_message_to_session(session_id, "assistant", summary_response)

    return {
        "response": summary_response,
        "timestamp": datetime.now().isoformat(),
        "session_id": session_id
    }


async def _handle_clear_summary(session_id: str) -> dict:
    """Handle clear summary request."""
    print("🗑️ Clear summary requested via /api/chat")
    clear_response = "✅ Conversation summary has been cleared. Future conversations will start fresh."
    await document_service.add_message_to_session(session_id, "assistant", clear_response)
    return {
        "response": clear_response,
        "timestamp": datetime.now().isoformat(),
        "session_id": session_id
    }


def _parse_document_content(document_content: str) -> tuple:
    """Parse document content and extract text and HTML versions."""
    document_full_context = ""
    document_html_context = ""
    
    if not document_content.strip():
        return document_full_context, document_html_context
    
    try:
        html_text = document_content
        
        html_text = re.sub(r'<li>', '\n* ', html_text)
        html_text = re.sub(r'</li>', '', html_text)
        html_text = re.sub(r'<h[1-6]>', '\n\n', html_text)
        html_text = re.sub(r'</h[1-6]>', '\n\n', html_text)
        html_text = re.sub(r'<p>', '', html_text)
        html_text = re.sub(r'</p>', '\n\n', html_text)
        html_text = re.sub(r'<br\s*/?>', '\n', html_text)
        html_text = re.sub(r'<(strong|b)>(.*?)</\1>', r'**\2**', html_text)
        
        text_content = re.sub(r'<[^>]+>', '', html_text)
        text_content = re.sub(r'\n{3,}', '\n\n', text_content)
        text_content = text_content.strip()
        
        if text_content and len(text_content) > 10:
            truncated_text = text_content[:3000] + "..." if len(text_content) > 3000 else text_content
            document_full_context = truncated_text
            document_html_context = document_content
            print(f"✅ Existing document detected: {len(text_content)} chars")
        else:
            print(f"📝 Empty document detected (only HTML tags or whitespace)")
    except Exception as e:
        print(f"⚠️ Error parsing document content: {e}")
        truncated_doc = document_content[:3000] + "..." if len(document_content) > 3000 else document_content
        document_full_context = truncated_doc
        document_html_context = document_content
    
    return document_full_context, document_html_context


async def _build_effective_history(session_id: str, chat_history: List[dict]) -> tuple:
    """Build effective history with auto-summarization."""
    SUMMARY_THRESHOLD = 10
    RECENT_MESSAGES = 2
    stored_summary = None
    effective_history = list(chat_history)

    if len(chat_history) > SUMMARY_THRESHOLD:
        print(f"📝 Auto-summarizing long history: {len(chat_history)} messages > {SUMMARY_THRESHOLD}")
        recent_msgs = chat_history[-5:]
        recent_summary = next(
            (msg for msg in recent_msgs if msg.get('role') == 'assistant' and '[AUTO-SUMMARY]' in msg.get('content', '')),
            None
        )

        if not recent_summary:
            older_history = chat_history[:-RECENT_MESSAGES]
            if older_history:
                older_text = "\n".join([
                    f"{msg.get('role', 'unknown')}: {msg.get('content', '')}"
                    for msg in older_history
                ])

                auto_summary_prompt = f"""
Summarize this previous conversation concisely to preserve key context for ongoing chat:

{older_text}

Focus on:
- Main topics and decisions
- Key facts or user preferences
- Open questions or next steps

Keep it under 200 words.
"""

                if llm_service and llm_service.is_initialized:
                    auto_summary_result = await llm_service.generate_response(auto_summary_prompt)
                    auto_summary_text = clean_markdown_output(auto_summary_result.content)

                    summary_msg = {
                        "role": "system",
                        "content": f"[AUTO-SUMMARY] Previous conversation summary: {auto_summary_text}"
                    }
                    effective_history = [summary_msg] + chat_history[-RECENT_MESSAGES:]

                    await document_service.add_message_to_session(
                        session_id,
                        "system",
                        f"[AUTO-SUMMARY] {auto_summary_text}"
                    )
                    print("✅ Auto-summary generated and stored")
                else:
                    effective_history = chat_history[-RECENT_MESSAGES:]
            else:
                effective_history = chat_history[-RECENT_MESSAGES:]
        else:
            stored_summary = recent_summary.get('content', '').replace('[AUTO-SUMMARY] ', '')
            effective_history = chat_history[-RECENT_MESSAGES:]

    if not stored_summary:
        for msg in reversed(effective_history[-10:]):
            if msg.get('role') in ['assistant', 'system'] and '[AUTO-SUMMARY]' in msg.get('content', ''):
                stored_summary = msg.get('content', '').replace('[AUTO-SUMMARY] ', '')
                break

    return effective_history, stored_summary


def _build_context_parts(stored_summary: Optional[str], effective_history: List[dict], 
                         document_full_context: str, document_vector_context: str) -> List[str]:
    """Build context parts for the prompt."""
    history_context = "\n".join([
        f"{msg.get('role', 'unknown')}: {msg.get('content', '')}"
        for msg in effective_history[-2:]
    ])
    
    context_parts = []
    if stored_summary:
        context_parts.append(f"Previous Conversation Summary:\n{stored_summary}")
    if history_context:
        context_parts.append(f"Recent conversation (last 2 exchanges):\n{history_context}")
    if document_full_context:
        context_parts.append(document_full_context)
    if document_vector_context:
        context_parts.append(f"Relevant document chunks:\n{document_vector_context}")
    
    return context_parts


def _build_toolbar_prompt(message: str, document_full_context: str) -> tuple:
    """Build prompt for toolbar requests."""
    print("🛠️ Processing Toolbar Request (Direct Rewrite)")
    
    instruction_match = re.search(r"Instruction:\s*(.*?)\n", message, re.DOTALL)
    selection_match = re.search(r"Selected passage:\s*(.*)", message, re.DOTALL)
    
    instruction = instruction_match.group(1).strip() if instruction_match else "Improve this text"
    selection = selection_match.group(1).strip() if selection_match else document_full_context
    
    enhanced_prompt = (
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
    
    return "direct_edit", enhanced_prompt


async def _handle_placeholder_fill(session_id: str, placeholder_source: str, 
                                   session_state: Dict[str, str], intent: str) -> Optional[dict]:
    """Handle placeholder fill operation."""
    print("🧮 Deterministic placeholder fill triggered")
    normalized_doc = normalize_placeholders(placeholder_source)
    replaced_doc = replace_placeholders_python(normalized_doc, session_state)

    if replaced_doc != placeholder_source:
        try:
            safe_doc = enforce_output_rules(replaced_doc)
            if "<" in safe_doc and ">" in safe_doc:
                safe_doc = enforce_html_guardrails(safe_doc)
        except ValueError as guard_error:
            warning_msg = f"I can't apply those details because of safety rules: {guard_error}"
            await document_service.add_message_to_session(session_id, "assistant", warning_msg)
            return {
                "response": warning_msg,
                "timestamp": datetime.now().isoformat(),
                "session_id": session_id,
                "intent": intent
            }

        await document_service.add_message_to_session(
            session_id,
            "assistant",
            "[PLACEHOLDER-FILL] Placeholders replaced using cached details."
        )

        return {
            "response": safe_doc,
            "timestamp": datetime.now().isoformat(),
            "session_id": session_id,
            "intent": intent
        }
    
    print("ℹ️ Placeholder fill requested but no replacements applied.")
    return None


def _build_chat_prompt(message: str, context_parts: List[str], document_full_context: str,
                       document_html_context: str, has_existing_doc: bool, 
                       user_details: dict, intent: str) -> str:
    """Build the chat prompt based on context and intent."""
    message_lower = message.lower()
    
    if not context_parts:
        return message
    
    context_block = "\n".join(context_parts)
    
    if has_existing_doc:
        formatted_doc = document_full_context.replace('\n\n', '\n\n')
        
        placeholders_exist = bool(PLACEHOLDER_PATTERN.search(formatted_doc))
        if user_details and placeholders_exist:
            print("🧩 Detected user details for placeholder fill")
            detail_lines = "\n".join([f"- {key.replace('_', ' ').title()}: {value}" for key, value in user_details.items()])
            return (
                "You are the Writer Agent. Fill in the placeholders in the existing document using the provided details.\n\n"
                "RULES:\n"
                "1. Replace only the matching placeholders (e.g., [Your Name], [Manager Name], [Email]).\n"
                "2. DO NOT change the wording, structure, or tone of the document.\n"
                "3. If a detail was not provided, keep the placeholder as-is.\n"
                "4. Output clean Markdown only – no explanations.\n"
                "5. Never rewrite this into a memo or strategy document.\n\n"
                f"DETAILS PROVIDED:\n{detail_lines}\n\n"
                f"DOCUMENT TO UPDATE:\n{formatted_doc}\n\n"
                "Return the updated document content only:"
            )
        else:
            # Two-agent update system would go here
            # For now, simplified single prompt
            return (
                f"You are a document assistant. Help update this document based on the user's request.\n\n"
                f"DOCUMENT:\n{formatted_doc}\n\n"
                f"USER REQUEST:\n{message}\n\n"
                "Return the updated document. Keep the original structure unless asked to change it."
            )
    else:
        # Create mode
        create_keywords = ['write', 'create', 'draft', 'make', 'generate', 'prepare', 'compose']
        is_document_request = intent == "create_document" or any(keyword in message_lower for keyword in create_keywords)
        
        if is_document_request:
            return (
                "You are the Writer Agent.\n\n"
                f"Context:\n{context_block}\n\n" if context_parts else ""
                "Your job is to write a professional document based on the user's request.\n"
                "Use clean Markdown formatting. No explanations.\n\n"
                f"REQUEST: {message}\n\n"
                "Write the document now:"
            )
        else:
            return (
                "You are a helpful AI assistant.\n\n"
                f"Context:\n{context_block}\n\n" if context_parts else ""
                f"User message: {message}\n\n"
                "Respond naturally and helpfully."
            )


def _clean_template_markers(response: str) -> str:
    """Remove template markers from response."""
    template_markers = [
        "FORMATTING TEMPLATE TO MAINTAIN:",
        "FORMATTING GUIDELINES",
        "[Body paragraphs - keep ALL paragraphs",
        "[Keep the closing paragraph]",
        "⚠️ REMINDER:",
        "INSTRUCTION:",
        "TEXT TO REWRITE:",
        "REWRITTEN TEXT:"
    ]
    
    lines = response.split('\n')
    filtered_lines = []
    skip_mode = False
    
    for line in lines:
        if any(marker in line for marker in template_markers):
            skip_mode = True
            continue
        
        if skip_mode and line.strip() and not line.startswith('[') and not line.startswith('⚠'):
            skip_mode = False
        
        if not skip_mode:
            filtered_lines.append(line)
    
    return '\n'.join(filtered_lines).strip()

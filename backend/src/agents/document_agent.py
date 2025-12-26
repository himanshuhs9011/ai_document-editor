import asyncio
from typing import Dict, List, Any, Optional, TypedDict, Annotated
from datetime import datetime
import json
import logging

from langgraph.graph import StateGraph
from langgraph.constants import END
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate

from ..services.llm_service import LLMService
from ..services.vector_service import VectorService
from ..models.schemas import EditRequest, EditSuggestion, VectorSearchResult

logger = logging.getLogger(__name__)

class DocumentAgentState(TypedDict):
    """State schema for the document agent"""
    messages: List[Dict[str, Any]]
    user_input: str
    document_context: List[VectorSearchResult]
    session_id: str
    document_id: str
    edit_suggestions: List[EditSuggestion]
    final_response: str
    metadata: Dict[str, Any]

class DocumentAgent:
    """LangGraph-based agent for document editing and analysis"""
    
    def __init__(self, llm_service: LLMService, vector_service: VectorService):
        self.llm_service = llm_service
        self.vector_service = vector_service
        self.graph = self._build_graph()
        self.session_memories = {}  # Store session context
        
    def _build_graph(self):
        """Build the LangGraph workflow for document processing"""
        workflow = StateGraph(DocumentAgentState)
        
        # Add nodes
        workflow.add_node("analyze_intent", self._analyze_intent)
        workflow.add_node("retrieve_context", self._retrieve_context)
        workflow.add_node("generate_response", self._generate_response)
        workflow.add_node("generate_edits", self._generate_edits)
        workflow.add_node("finalize_response", self._finalize_response)
        
        # Define edges
        workflow.set_entry_point("analyze_intent")
        
        workflow.add_conditional_edges(
            "analyze_intent",
            self._route_based_on_intent,
            {
                "edit": "generate_edits",
                "query": "retrieve_context",
                "general": "generate_response"
            }
        )
        
        workflow.add_edge("retrieve_context", "generate_response")
        workflow.add_edge("generate_edits", "finalize_response")
        workflow.add_edge("generate_response", "finalize_response")
        workflow.add_edge("finalize_response", END)
        
        return workflow.compile()
    
    async def process_message(self, 
                            message: str, 
                            context_chunks: List[VectorSearchResult],
                            session_id: str, 
                            document_id: str) -> Dict[str, Any]:
        """Process a user message through the document agent"""
        try:
            # Initialize state
            initial_state = DocumentAgentState(
                messages=self._get_session_memory(session_id),
                user_input=message,
                document_context=context_chunks,
                session_id=session_id,
                document_id=document_id,
                edit_suggestions=[],
                final_response="",
                metadata={"timestamp": datetime.now().isoformat()}
            )
            
            # Run the graph
            result = await self.graph.ainvoke(initial_state)
            
            # Update session memory
            self._update_session_memory(session_id, message, result["final_response"])
            
            # Return both the response and suggestions
            return {
                "response": result["final_response"],
                "suggestions": [suggestion.dict() for suggestion in result["edit_suggestions"]],
                "metadata": result["metadata"]
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing message: {e}")
            return {
                "response": f"I apologize, but I encountered an error while processing your request: {str(e)}",
                "suggestions": [],
                "metadata": {}
            }
    
    async def process_edit_request(self, edit_request: EditRequest) -> Dict[str, Any]:
        """Process a document edit request"""
        try:
            # Get relevant context
            context_chunks = await self.vector_service.search_similar(
                edit_request.instruction,
                document_id=edit_request.document_id,
                n_results=10
            )
            
            # Initialize state for edit processing
            initial_state = DocumentAgentState(
                messages=self._get_session_memory(edit_request.session_id),
                user_input=edit_request.instruction,
                document_context=context_chunks,
                session_id=edit_request.session_id,
                document_id=edit_request.document_id,
                edit_suggestions=[],
                final_response="",
                metadata={
                    "edit_request": edit_request.dict(),
                    "timestamp": datetime.now().isoformat()
                }
            )
            
            # Process through edit generation
            result = await self._generate_edits(initial_state)
            
            return {
                "changes": [suggestion.dict() for suggestion in result["edit_suggestions"]],
                "preview": result["final_response"],
                "metadata": result["metadata"]
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing edit request: {e}")
            raise e
    
    async def _analyze_intent(self, state: DocumentAgentState) -> DocumentAgentState:
        """Analyze user intent to determine the processing path"""
        try:
            # Check if this is a document creation request (no existing content)
            has_document_content = (
                len(state["document_context"]) > 0 and 
                any(chunk.content.strip() for chunk in state["document_context"])
            )
            
            is_creation_request = not has_document_content
            
            # Check if user just wants to chat or get simple responses
            user_input_lower = state["user_input"].lower().strip()
            simple_chat_patterns = [
                "hi", "hello", "hey", "thanks", "thank you", "ok", "okay", 
                "good", "great", "nice", "cool", "what's up", "how are you",
                "test", "testing", "check", "looks good", "perfect", "awesome"
            ]
            
            # Check for simple chat - either short messages or messages that start with common greetings/acknowledgments
            is_simple_chat = (
                (len(user_input_lower) < 25 and 
                 any(pattern in user_input_lower for pattern in simple_chat_patterns)) or
                any(user_input_lower.startswith(pattern) for pattern in ["thanks", "thank you", "hi", "hello", "hey", "ok", "okay", "great", "good", "nice"])
            )
            
            # Check for document update patterns (personalizing existing content)
            update_patterns = [
                "name", "change", "update", "replace", "fix", "correct", 
                "add", "include", "mention", "insert", "put", "set"
            ]
            
            is_document_update = (
                has_document_content and 
                any(pattern in user_input_lower for pattern in update_patterns)
            )
            
            if is_simple_chat and not is_creation_request:
                # Route simple greetings/short responses to general chat
                state["metadata"]["intent"] = "general"
                state["metadata"]["is_creation"] = False
                return state
            
            if is_creation_request:
                # For document creation, always route to edit generation
                state["metadata"]["intent"] = "edit"
                state["metadata"]["is_creation"] = True
                return state
            
            if is_document_update:
                # For document updates/modifications, route to edit generation
                state["metadata"]["intent"] = "edit"
                state["metadata"]["is_creation"] = False
                return state
            
            intent_prompt = """
            Analyze the user's message and determine the intent. Classify as one of:
            - "edit": User wants to modify, change, edit, improve, or create content for the document
            - "query": User is asking questions about the document content
            - "general": General conversation, simple greetings, or other requests
            
            User message: {user_input}
            
            Respond with only the classification word: edit, query, or general
            """
            
            response = await self.llm_service.generate_response(
                intent_prompt.format(user_input=state["user_input"]),
                temperature=0.1
            )
            
            intent = response.content.strip().lower()
            state["metadata"]["intent"] = intent
            state["metadata"]["is_creation"] = False
            
            return state
            
        except Exception as e:
            logger.error(f"❌ Error analyzing intent: {e}")
            state["metadata"]["intent"] = "general"  # Default to general for safety
            state["metadata"]["is_creation"] = False
            return state
    
    def _route_based_on_intent(self, state: DocumentAgentState) -> str:
        """Route to appropriate node based on intent"""
        intent = state["metadata"].get("intent", "general")
        
        if "edit" in intent:
            return "edit"
        elif "query" in intent:
            return "query"
        else:
            return "general"
    
    async def _retrieve_context(self, state: DocumentAgentState) -> DocumentAgentState:
        """Retrieve additional context if needed"""
        try:
            # If we don't have enough context, search for more
            if len(state["document_context"]) < 3:
                additional_context = await self.vector_service.search_similar(
                    state["user_input"],
                    document_id=state["document_id"],
                    n_results=5
                )
                state["document_context"].extend(additional_context)
            
            return state
            
        except Exception as e:
            logger.error(f"❌ Error retrieving context: {e}")
            return state
    
    async def _generate_response(self, state: DocumentAgentState) -> DocumentAgentState:
        """Generate a response based on document context"""
        try:
            # Check if this is a simple chat message
            user_input_lower = state["user_input"].lower().strip()
            simple_chat_patterns = [
                "hi", "hello", "hey", "thanks", "thank you", "ok", "okay", 
                "good", "great", "nice", "cool", "what's up", "how are you",
                "test", "testing", "check"
            ]
            
            is_simple_chat = (
                len(user_input_lower) < 20 and 
                any(pattern in user_input_lower for pattern in simple_chat_patterns)
            )
            
            if is_simple_chat:
                # Handle simple greetings/responses directly
                if any(greet in user_input_lower for greet in ["hi", "hello", "hey"]):
                    state["final_response"] = "Hello! I'm your AI document assistant. How can I help you today?"
                elif any(thanks in user_input_lower for thanks in ["thanks", "thank you"]):
                    state["final_response"] = "You're welcome! Is there anything else I can help you with?"
                elif any(test in user_input_lower for test in ["test", "testing", "check"]):
                    state["final_response"] = "I'm working perfectly! Ready to help you with document editing and creation."
                else:
                    state["final_response"] = "I'm here to help with your documents. What would you like me to do?"
                
                return state
            
            # Prepare context for more complex responses
            context_text = "\n\n".join([
                f"[Score: {chunk.score:.2f}] {chunk.content}"
                for chunk in state["document_context"][:5]
            ])
            
            # Prepare conversation history
            conversation_history = "\n".join([
                f"{msg['role']}: {msg['content']}"
                for msg in state["messages"][-5:]  # Last 5 messages
            ])
            
            system_prompt = """
            You are an AI assistant specialized in document analysis and editing. 
            You help users understand, analyze, and work with their documents.
            
            Guidelines:
            - Provide accurate information based on the document content
            - If you're unsure about something, say so
            - Be helpful and professional
            - Focus on the user's specific request
            """
            
            user_prompt = f"""
            Based on the following document content, please respond to the user's question or request.
            
            Document Context:
            {context_text}
            
            Recent Conversation:
            {conversation_history}
            
            User's Current Request: {state["user_input"]}
            
            Please provide a helpful response based on the document content and context.
            """
            
            response = await self.llm_service.generate_response(
                user_prompt,
                system_prompt=system_prompt,
                temperature=0.7
            )
            
            state["final_response"] = response.content
            
            return state
            
        except Exception as e:
            logger.error(f"❌ Error generating response: {e}")
            state["final_response"] = "I apologize, but I encountered an error while generating a response."
            return state
    
    async def _generate_edits(self, state: DocumentAgentState) -> DocumentAgentState:
        """Generate comprehensive document improvements as a single unified response"""
        try:
            # Check if this is document creation
            is_creation = state["metadata"].get("is_creation", False)
            
            # Prepare context for edit generation
            context_text = "\n\n".join([
                f"[Page {chunk.metadata.get('page_number', 'Unknown')}] {chunk.content}"
                for chunk in state["document_context"][:10]
            ])
            
            # Prepare conversation history for context
            conversation_history = "\n".join([
                f"{msg['role']}: {msg['content']}"
                for msg in state["messages"][-6:]  # Last 6 messages for context
            ])
            
            if is_creation:
                # Document creation prompt - cleaner and more explicit
                edit_prompt = f"""
                Create a complete, professional document for: {state["user_input"]}
                
                Previous Conversation Context:
                {conversation_history}
                
                INSTRUCTIONS:
                1. Create a comprehensive, well-structured document
                2. Make it professional and complete
                3. Include all relevant sections and details
                4. Format it properly with headings and structure
                
                IMPORTANT: Respond ONLY with the complete document content. Do NOT include any JSON, explanations, or meta-text. Just provide the actual document text that the user requested.
                """
            else:
                # Document editing/updating prompt
                edit_prompt = f"""
                You need to update an existing document based on the user's specific request.
                
                Previous Conversation Context:
                {conversation_history}
                
                Current Document Content:
                {context_text}
                
                User's Update Request: {state["user_input"]}
                
                INSTRUCTIONS:
                1. Use the conversation history to understand the context and what document we're working with
                2. Take the existing document content above
                3. Apply ONLY the specific changes requested by the user
                4. Keep everything else exactly the same
                5. If the user mentions a name, replace placeholders like [Manager's Name] with the actual name
                6. If the user asks to add information, insert it in the appropriate place
                7. Maintain the original document structure and format
                8. Return the COMPLETE updated document (not just the changes)
                
                Examples of user requests and how to handle them:
                - "manager name was manoj" → Replace [Manager's Name] with "Manoj" throughout the document
                - "add medical reason" → Add medical condition details where appropriate
                - "make it more formal" → Adjust tone while keeping all content
                
                IMPORTANT: Return ONLY the complete updated document text. Do NOT provide explanations, JSON, or descriptions.
                """
            
            response = await self.llm_service.generate_response(
                edit_prompt,
                temperature=0.3
            )
            
            # Parse the response
            try:
                # Both document editing and creation now expect direct text response
                content = response.content.strip()
                
                # Clean up any potential formatting artifacts
                if content.startswith("```"):
                    lines = content.split('\n')
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].startswith("```"):
                        lines = lines[:-1]
                    content = '\n'.join(lines).strip()
                
                # Create a single comprehensive suggestion
                suggestion = EditSuggestion(
                    type="comprehensive_edit",
                    original_text=context_text if not is_creation else "",
                    new_text=content,
                    position={},
                    confidence=0.9,
                    explanation="Document has been created/improved based on your request"
                )
                
                state["edit_suggestions"] = [suggestion]
                
                if is_creation:
                    state["final_response"] = "I've created a new document for you."
                else:
                    state["final_response"] = "I've prepared a comprehensive improved version of your document."
                
                return state
                
            except Exception as e:
                logger.warning(f"Error processing response: {e}")
                # Fallback - use raw response content
                suggestion = EditSuggestion(
                    type="comprehensive_edit",
                    original_text="",
                    new_text=response.content.strip(),
                    position={},
                    confidence=0.85,
                    explanation="Document created/improved based on your request"
                )
                
                state["edit_suggestions"] = [suggestion]
                state["final_response"] = "I've processed your document request."
            
            return state
            
        except Exception as e:
            logger.error(f"❌ Error generating comprehensive edits: {e}")
            state["final_response"] = "I apologize, but I encountered an error while generating comprehensive improvements."
            return state
    
    async def _finalize_response(self, state: DocumentAgentState) -> DocumentAgentState:
        """Finalize the response and prepare output"""
        try:
            # Add metadata about processing
            state["metadata"]["processing_completed"] = datetime.now().isoformat()
            state["metadata"]["context_chunks_used"] = len(state["document_context"])
            state["metadata"]["edit_suggestions_count"] = len(state["edit_suggestions"])
            
            # Ensure we have a response
            if not state["final_response"]:
                state["final_response"] = "I've processed your request. How else can I help you with this document?"
            
            return state
            
        except Exception as e:
            logger.error(f"❌ Error finalizing response: {e}")
            return state
    
    def _get_session_memory(self, session_id: str) -> List[Dict[str, Any]]:
        """Get conversation history for a session"""
        return self.session_memories.get(session_id, [])
    
    def _update_session_memory(self, session_id: str, user_message: str, ai_response: str):
        """Update conversation history for a session"""
        if session_id not in self.session_memories:
            self.session_memories[session_id] = []
        
        memory = self.session_memories[session_id]
        
        # Add user message
        memory.append({
            "role": "user",
            "content": user_message,
            "timestamp": datetime.now().isoformat()
        })
        
        # Add AI response
        memory.append({
            "role": "assistant",
            "content": ai_response,
            "timestamp": datetime.now().isoformat()
        })
        
        # Keep only last 20 messages to manage memory
        if len(memory) > 20:
            memory = memory[-20:]
        
        self.session_memories[session_id] = memory

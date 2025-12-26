import asyncio
import json
import httpx
from typing import List, Dict, Any, Optional, AsyncGenerator
import logging
from datetime import datetime
from langchain_ollama import ChatOllama
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate

from ..tools.graph_tool import generate_graphs as generate_graph
from ..models.schemas import LLMResponse, HealthStatus
from ..core.config import DEFAULT_MODEL_NAME, DEFAULT_MODEL_BASE_URL, DEFAULT_TIMEOUT, DEFAULT_NUM_PREDICT

logger = logging.getLogger(__name__)

class LLMService:
    """Service for managing local LLM interactions via Ollama"""
    
    def __init__(self, 
                 base_url: str = DEFAULT_MODEL_BASE_URL,
                 model_name: str = DEFAULT_MODEL_NAME,
                 timeout: int = DEFAULT_TIMEOUT,
                 default_num_predict: int = DEFAULT_NUM_PREDICT,
                 default_num_predict_optional: Optional[int] = None):
        self.base_url = base_url
        self.model_name = model_name
        self.timeout = timeout
        self.default_num_predict = default_num_predict_optional if default_num_predict_optional is not None else default_num_predict
        self.client: Optional[httpx.AsyncClient] = None
        self.is_initialized = False
        self.llm = ChatOllama(model=model_name, base_url=base_url)
        self.all_tools = [generate_graph]
        
    async def initialize(self):
        """Initialize the LLM service and check Ollama availability"""
        try:
            timeout_config = httpx.Timeout(
                connect=30.0, read=self.timeout, write=30.0, pool=30.0
            )
            self.client = httpx.AsyncClient(timeout=timeout_config)
            
            response = await self.client.get(f"{self.base_url}/api/tags")
            if response.status_code == 200:
                models = response.json()
                available_models = [model['name'] for model in models.get('models', [])]
                
                if self.model_name not in available_models:
                    logger.warning(f"Model {self.model_name} not found in available models: {available_models}")
                    logger.info(f"Attempting to pull model: {self.model_name}")
                    success = await self._pull_model(self.model_name)
                    if not success:
                        logger.error(f"Failed to pull model {self.model_name}")
                        return False
                else:
                    logger.info(f"Model {self.model_name} is already available")
                
                self.is_initialized = True
                logger.info(f"✅ LLM Service initialized with model: {self.model_name}")
                return True
            else:
                raise Exception(f"Ollama server not responding: {response.status_code}")
                
        except Exception as e:
            logger.error(f"❌ Failed to initialize LLM service: {e}")
            self.is_initialized = False
            return False
    
    async def _pull_model(self, model_name: str) -> bool:
        """Pull a model from Ollama registry"""
        try:
            if self.client is None:
                return False
                
            logger.info(f"🔄 Pulling model {model_name}...")
            response = await self.client.post(
                f"{self.base_url}/api/pull",
                json={"name": model_name},
                timeout=3600
            )
            
            if response.status_code == 200:
                logger.info(f"✅ Model {model_name} pulled successfully")
                return True
            else:
                logger.error(f"❌ Failed to pull model {model_name}: {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error pulling model {model_name}: {e}")
            return False
    
    async def generate_response(self, 
                              prompt: str, 
                              context: Optional[str] = None,
                              system_prompt: Optional[str] = None,
                              temperature: float = 0.7,
                              max_tokens: Optional[int] = None) -> LLMResponse:
        """Generate a response using the local LLM"""
        if not self.is_initialized or self.client is None:
            raise Exception("LLM service not initialized")
        
        try:
            start_time = datetime.now()
            full_prompt = self._build_prompt(prompt, context, system_prompt)

            options = {"temperature": temperature}
            if max_tokens or self.default_num_predict:
                options["num_predict"] = max_tokens or self.default_num_predict
            
            request_data = {
                "model": self.model_name,
                "prompt": full_prompt,
                "stream": False,
                "options": options
            }

            response = await self.client.post(
                f"{self.base_url}/api/generate",
                json=request_data
            )
            
            if response.status_code == 200:
                result = response.json()
                processing_time = (datetime.now() - start_time).total_seconds()
                
                return LLMResponse(
                    content=result.get("response", ""),
                    model=self.model_name,
                    tokens_used=result.get("eval_count", 0),
                    processing_time=processing_time,
                    confidence=0.8
                )
            else:
                raise Exception(f"LLM request failed: {response.status_code} - {response.text}")
                
        except httpx.ReadTimeout:
            raise Exception(f"Request timed out after {self.timeout} seconds.")
        except httpx.ConnectTimeout:
            raise Exception(f"Connection to Ollama timed out. Check if Ollama is running on {self.base_url}")
        except Exception as e:
            logger.error(f"❌ Error generating LLM response: {e}")
            raise e
    
    async def generate_stream(self, 
                            prompt: str, 
                            context: Optional[str] = None,
                            system_prompt: Optional[str] = None,
                            temperature: float = 0.7) -> AsyncGenerator[str, None]:
        """Generate a streaming response using the local LLM"""
        if not self.is_initialized or self.client is None:
            raise Exception("LLM service not initialized")
        
        try:
            full_prompt = self._build_prompt(prompt, context, system_prompt)
            
            request_data = {
                "model": self.model_name,
                "prompt": full_prompt,
                "stream": True,
                "options": {"temperature": temperature}
            }
            
            async with self.client.stream(
                "POST",
                f"{self.base_url}/api/generate",
                json=request_data
            ) as response:
                if response.status_code == 200:
                    async for line in response.aiter_lines():
                        if line:
                            try:
                                data = json.loads(line)
                                if "response" in data:
                                    yield data["response"]
                                if data.get("done", False):
                                    break
                            except json.JSONDecodeError:
                                continue
                else:
                    raise Exception(f"Streaming request failed: {response.status_code}")
                    
        except Exception as e:
            logger.error(f"❌ Error in streaming response: {e}")
            raise e
    
    def _build_prompt(self, prompt: str, context: Optional[str] = None, system_prompt: Optional[str] = None) -> str:
        """Build a comprehensive prompt with context and system instructions"""
        parts = []
        
        if system_prompt:
            parts.append(f"System: {system_prompt}")
        
        default_system = """You are an AI assistant specialized in document editing and analysis. 
        You help users edit, improve, and analyze documents while maintaining their original intent and style.
        Provide clear, actionable suggestions and maintain professional tone."""
        
        if not system_prompt:
            parts.append(f"System: {default_system}")
        
        if context:
            parts.append(f"Context: {context}")
        
        parts.append(f"User: {prompt}")
        parts.append("Assistant:")
        
        return "\n\n".join(parts)
    
    async def health_check(self) -> HealthStatus:
        """Check the health of the LLM service"""
        try:
            if not self.client:
                return HealthStatus(service="llm", status="unhealthy", details={"error": "Client not initialized"})
            
            response = await self.client.get(f"{self.base_url}/api/tags")
            if response.status_code == 200:
                models = response.json()
                return HealthStatus(
                    service="llm",
                    status="healthy",
                    details={
                        "model": self.model_name,
                        "available_models": len(models.get("models", [])),
                        "ollama_version": response.headers.get("server", "unknown")
                    }
                )
            else:
                return HealthStatus(service="llm", status="degraded", details={"error": f"Status {response.status_code}"})
                
        except Exception as e:
            return HealthStatus(service="llm", status="unhealthy", details={"error": str(e)})
    
    async def list_models(self) -> List[str]:
        """List available models in Ollama"""
        try:
            if not self.client:
                return []
            
            response = await self.client.get(f"{self.base_url}/api/tags")
            if response.status_code == 200:
                models = response.json()
                return [model['name'] for model in models.get('models', [])]
            return []
        except Exception as e:
            logger.error(f"❌ Error listing models: {e}")
            return []
    
    async def close(self):
        """Close the HTTP client"""
        if self.client:
            await self.client.aclose()

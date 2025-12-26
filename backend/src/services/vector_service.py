import asyncio
import chromadb
from chromadb.config import Settings
import httpx
import numpy as np
from typing import List, Dict, Any, Optional
import logging
from datetime import datetime
import os
import json

from ..models.schemas import VectorSearchResult, HealthStatus
from ..core.config import settings, DEFAULT_EMBEDDING_MODEL, DEFAULT_MODEL_BASE_URL

logger = logging.getLogger(__name__)


class OllamaEmbeddings:
    """Ollama-based embeddings using nomic-embed-text or other models"""
    
    def __init__(self, model_name: str = DEFAULT_EMBEDDING_MODEL, base_url: str = DEFAULT_MODEL_BASE_URL):
        self.model_name = model_name
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=60.0)
    
    async def embed(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        try:
            response = await self.client.post(
                f"{self.base_url}/api/embeddings",
                json={"model": self.model_name, "prompt": text}
            )
            response.raise_for_status()
            return response.json()["embedding"]
        except Exception as e:
            logger.error(f"❌ Error generating embedding: {e}")
            raise e
    
    def embed_sync(self, text: str) -> List[float]:
        """Synchronous embedding (for compatibility with ChromaDB)"""
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                f"{self.base_url}/api/embeddings",
                json={"model": self.model_name, "prompt": text}
            )
            response.raise_for_status()
            return response.json()["embedding"]
    
    async def close(self):
        await self.client.aclose()


class VectorService:
    """Service for managing document vectorization and semantic search using Ollama embeddings"""
    
    def __init__(self, 
                 db_path: str = "data/chroma_db",
                 model_name: str = None,
                 base_url: str = None,
                 collection_name: str = "documents"):
        self.db_path = db_path
        # Use config values if not provided
        self.model_name = model_name or settings.embedding_model
        self.base_url = base_url or settings.model_settings.base_url
        self.collection_name = collection_name
        self.client = None
        self.collection = None
        self.embedding_model = None
        self.is_initialized = False
        
    async def initialize(self):
        """Initialize the vector database and embedding model"""
        try:
            # Create database directory
            os.makedirs(self.db_path, exist_ok=True)
            
            # Initialize ChromaDB client
            self.client = chromadb.PersistentClient(
                path=self.db_path,
                settings=Settings(
                    anonymized_telemetry=False,
                    allow_reset=True
                )
            )
            
            # Get or create collection
            self.collection = self.client.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            
            # Initialize Ollama embedding model
            logger.info(f"🔄 Loading Ollama embedding model: {self.model_name}")
            self.embedding_model = OllamaEmbeddings(
                model_name=self.model_name,
                base_url=self.base_url
            )
            
            # Test the embedding model
            try:
                test_embedding = await self.embedding_model.embed("test")
                logger.info(f"✅ Embedding model working, dimension: {len(test_embedding)}")
            except Exception as e:
                logger.warning(f"⚠️ Embedding model test failed: {e}")
                logger.info(f"💡 Run: ollama pull {self.model_name}")
            
            self.is_initialized = True
            logger.info(f"✅ Vector service initialized with model: {self.model_name}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize vector service: {e}")
            self.is_initialized = False
            return False
    
    async def add_document(self, document_id: str, text: str, metadata: Optional[Dict[str, Any]] = None):
        """Add a document to the vector database"""
        if not self.is_initialized:
            raise Exception("Vector service not initialized")
        
        try:
            # Split text into chunks for better retrieval
            chunks = self._split_text(text)
            
            embeddings = []
            ids = []
            texts = []
            metadatas = []
            
            for i, chunk in enumerate(chunks):
                # Generate embedding using Ollama
                embedding = await self.embedding_model.embed(chunk)
                
                chunk_id = f"{document_id}_chunk_{i}"
                chunk_metadata = {
                    "document_id": document_id,
                    "chunk_index": i,
                    "timestamp": datetime.now().isoformat(),
                    **(metadata or {})
                }
                
                embeddings.append(embedding)
                ids.append(chunk_id)
                texts.append(chunk)
                metadatas.append(chunk_metadata)
            
            # Add to collection
            self.collection.add(
                embeddings=embeddings,
                documents=texts,
                metadatas=metadatas,
                ids=ids
            )
            
            logger.info(f"✅ Added document {document_id} with {len(chunks)} chunks")
            return len(chunks)
            
        except Exception as e:
            logger.error(f"❌ Error adding document to vector DB: {e}")
            raise e
    
    async def search_similar(self, 
                           query: str, 
                           document_id: Optional[str] = None,
                           n_results: int = 5,
                           min_score: float = 0.1) -> List[VectorSearchResult]:
        """Search for similar text chunks"""
        if not self.is_initialized:
            raise Exception("Vector service not initialized")
        
        try:
            # Generate query embedding using Ollama
            query_embedding = await self.embedding_model.embed(query)
            
            # Prepare where clause for filtering
            where_clause = None
            if document_id:
                where_clause = {"document_id": document_id}
            
            # Search in collection
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results,
                where=where_clause,
                include=["documents", "metadatas", "distances"]
            )
            
            # Convert to VectorSearchResult objects
            search_results = []
            if results["documents"] and results["documents"][0]:
                for i, doc in enumerate(results["documents"][0]):
                    distance = results["distances"][0][i] if results["distances"] else 1.0
                    score = 1 - distance  # Convert distance to similarity score
                    
                    if score >= min_score:
                        metadata = results["metadatas"][0][i] if results["metadatas"] else {}
                        
                        search_results.append(VectorSearchResult(
                            content=doc,
                            score=score,
                            metadata=metadata,
                            page_number=metadata.get("page_number")
                        ))
            
            return search_results
            
        except Exception as e:
            logger.error(f"❌ Error searching vector DB: {e}")
            return []
    
    async def delete_document(self, document_id: str):
        """Delete all chunks for a document"""
        if not self.is_initialized:
            raise Exception("Vector service not initialized")
        
        try:
            # Get all chunk IDs for the document
            results = self.collection.get(where={"document_id": document_id})
            
            if results["ids"]:
                self.collection.delete(ids=results["ids"])
                logger.info(f"✅ Deleted document {document_id} from vector DB")
                return len(results["ids"])
            else:
                logger.warning(f"⚠️ Document {document_id} not found in vector DB")
                return 0
                
        except Exception as e:
            logger.error(f"❌ Error deleting document from vector DB: {e}")
            raise e
    
    async def update_document(self, document_id: str, text: str, metadata: Optional[Dict[str, Any]] = None):
        """Update a document in the vector database"""
        # Delete existing document
        await self.delete_document(document_id)
        
        # Add updated document
        return await self.add_document(document_id, text, metadata)
    
    def _split_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
        """Split text into overlapping chunks for better retrieval"""
        if len(text) <= chunk_size:
            return [text]
        
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + chunk_size
            
            # Try to end at a sentence boundary
            if end < len(text):
                # Look for sentence endings
                for punct in ['. ', '! ', '? ', '\n\n']:
                    last_punct = text.rfind(punct, start, end)
                    if last_punct > start + chunk_size // 2:
                        end = last_punct + len(punct)
                        break
            
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            
            start = end - overlap
            if start >= len(text):
                break
        
        return chunks
    
    async def get_document_stats(self, document_id: str) -> Dict[str, Any]:
        """Get statistics for a document in the vector database"""
        if not self.is_initialized:
            raise Exception("Vector service not initialized")
        
        try:
            results = self.collection.get(where={"document_id": document_id})
            
            return {
                "document_id": document_id,
                "chunk_count": len(results["ids"]) if results["ids"] else 0,
                "total_characters": sum(len(doc) for doc in results["documents"]) if results["documents"] else 0
            }
            
        except Exception as e:
            logger.error(f"❌ Error getting document stats: {e}")
            return {"document_id": document_id, "chunk_count": 0, "total_characters": 0}
    
    async def health_check(self) -> HealthStatus:
        """Check the health of the vector service"""
        try:
            if not self.is_initialized:
                return HealthStatus(
                    service="vector_db",
                    status="unhealthy",
                    details={"error": "Service not initialized"}
                )
            
            # Test collection access
            count = self.collection.count()
            
            return HealthStatus(
                service="vector_db",
                status="healthy",
                details={
                    "collection_name": self.collection_name,
                    "document_count": count,
                    "embedding_model": self.model_name,
                    "base_url": self.base_url,
                    "db_path": self.db_path
                }
            )
            
        except Exception as e:
            return HealthStatus(
                service="vector_db",
                status="unhealthy",
                details={"error": str(e)}
            )
    
    async def close(self):
        """Clean up resources"""
        if self.embedding_model:
            await self.embedding_model.close()
        if self.client:
            # ChromaDB doesn't need explicit closing
            self.is_initialized = False
            logger.info("✅ Vector service closed")

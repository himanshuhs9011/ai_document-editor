"""
Application configuration management.
Centralizes all configuration loading and settings.
"""
import os
import json
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from pathlib import Path

# =============================================================================
# DEFAULT VALUES - Change these to update defaults across the entire app
# =============================================================================
DEFAULT_MODEL_NAME = "gemma3:latest"
DEFAULT_EMBEDDING_MODEL = "nomic-embed-text:latest"
DEFAULT_MODEL_BASE_URL = "http://localhost:11434"
DEFAULT_TEMPERATURE = 0.5
DEFAULT_TIMEOUT = 60
DEFAULT_NUM_PREDICT = 4096


@dataclass
class ModelSettings:
    """LLM Model configuration settings."""
    temperature: float = DEFAULT_TEMPERATURE
    timeout: int = DEFAULT_TIMEOUT
    base_url: str = DEFAULT_MODEL_BASE_URL
    num_predict: int = DEFAULT_NUM_PREDICT


@dataclass
class AppSettings:
    """Application-wide settings."""
    # Paths
    data_path: str = "data"
    uploads_path: str = "data/uploads"
    exports_path: str = "data/exports"
    sessions_path: str = "data/sessions"
    db_path: str = "data/sessions.db"
    chroma_db_path: str = "data/chroma_db"
    
    # Models
    model_name: str = DEFAULT_MODEL_NAME
    embedding_model: str = DEFAULT_EMBEDDING_MODEL
    model_settings: ModelSettings = field(default_factory=ModelSettings)
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    
    # CORS
    cors_origins: list = field(default_factory=lambda: ["*"])
    
    def ensure_directories(self):
        """Create all required directories."""
        for path in [self.data_path, self.uploads_path, self.exports_path, self.sessions_path]:
            os.makedirs(path, exist_ok=True)


def load_model_config(config_paths: Optional[list] = None) -> Dict[str, Any]:
    """
    Load model configuration from JSON file.
    
    Args:
        config_paths: List of paths to search for config file.
        
    Returns:
        Configuration dictionary with model settings.
    """
    if config_paths is None:
        config_paths = [
            "../model-config.json",
            "./model-config.json", 
            "model-config.json"
        ]
    
    for config_path in config_paths:
        try:
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    config = json.load(f)
                print(f"✅ Loaded model config from {config_path}")
                return config
        except Exception as e:
            print(f"⚠️  Failed to load config from {config_path}: {e}")
            continue
    
    # Default configuration if no config file found
    print("⚠️  Using default model configuration")
    return {
        "model_name": DEFAULT_MODEL_NAME,
        "embedding_model": DEFAULT_EMBEDDING_MODEL,
        "model_settings": {
            "temperature": DEFAULT_TEMPERATURE,
            "timeout": DEFAULT_TIMEOUT,
            "base_url": DEFAULT_MODEL_BASE_URL,
            "num_predict": DEFAULT_NUM_PREDICT
        }
    }


def create_settings_from_config(config: Dict[str, Any]) -> AppSettings:
    """Create AppSettings from loaded config dictionary."""
    model_settings = ModelSettings(
        temperature=config.get("model_settings", {}).get("temperature", DEFAULT_TEMPERATURE),
        timeout=config.get("model_settings", {}).get("timeout", DEFAULT_TIMEOUT),
        base_url=config.get("model_settings", {}).get("base_url", DEFAULT_MODEL_BASE_URL),
        num_predict=config.get("model_settings", {}).get("num_predict", DEFAULT_NUM_PREDICT)
    )
    
    return AppSettings(
        model_name=config.get("model_name", DEFAULT_MODEL_NAME),
        embedding_model=config.get("embedding_model", DEFAULT_EMBEDDING_MODEL),
        model_settings=model_settings
    )


# Load configuration on module import
_config = load_model_config()
settings = create_settings_from_config(_config)

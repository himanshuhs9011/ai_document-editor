"""
Session state management for caching user metadata across requests.
"""
from typing import Dict, Optional
from dataclasses import dataclass
import threading


@dataclass
class SessionState:
    """State for a single user session."""
    applicant_name: Optional[str] = None
    manager_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    title: Optional[str] = None
    company: Optional[str] = None
    region: Optional[str] = None
    
    def to_dict(self) -> Dict[str, str]:
        """Convert to dictionary, excluding None values."""
        return {
            k: v for k, v in {
                "applicant_name": self.applicant_name,
                "manager_name": self.manager_name,
                "email": self.email,
                "phone": self.phone,
                "title": self.title,
                "company": self.company,
                "region": self.region,
            }.items() if v is not None
        }
    
    def update(self, details: Dict[str, str]) -> None:
        """Update state with new details."""
        for key, value in details.items():
            if hasattr(self, key) and value:
                setattr(self, key, value.strip())


class SessionStateManager:
    """
    Thread-safe manager for session state caching.
    Provides per-session metadata storage for deterministic placeholder filling.
    """
    
    _instance: Optional["SessionStateManager"] = None
    _lock: threading.Lock = threading.Lock()
    _cache: Dict[str, SessionState]
    
    def __new__(cls) -> "SessionStateManager":
        """Singleton pattern for global state management."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    instance = super().__new__(cls)
                    instance._cache = {}
                    cls._instance = instance
        return cls._instance
    
    def get_state(self, session_id: Optional[str] = None) -> Dict[str, str]:
        """
        Retrieve cached metadata for a session without mutating it.
        
        Args:
            session_id: Session identifier. Defaults to 'default'.
            
        Returns:
            Dictionary of session state values.
        """
        if not session_id:
            session_id = "default"
        
        with self._lock:
            if session_id not in self._cache:
                self._cache[session_id] = SessionState()
            return self._cache[session_id].to_dict()
    
    def update_state(
        self, 
        session_id: str, 
        details: Dict[str, str]
    ) -> Dict[str, str]:
        """
        Update and cache structured user metadata for a session.
        
        Args:
            session_id: Session identifier.
            details: Dictionary of details to update.
            
        Returns:
            Updated session state dictionary.
        """
        if not session_id:
            session_id = "default"
        
        with self._lock:
            if session_id not in self._cache:
                self._cache[session_id] = SessionState()
            
            self._cache[session_id].update(details)
            return self._cache[session_id].to_dict()
    
    def clear_session(self, session_id: str) -> None:
        """
        Clear state for a specific session.
        
        Args:
            session_id: Session identifier to clear.
        """
        with self._lock:
            if session_id in self._cache:
                del self._cache[session_id]
    
    def clear_all(self) -> None:
        """Clear all session states."""
        with self._lock:
            self._cache.clear()
    
    def get_all_sessions(self) -> Dict[str, Dict[str, str]]:
        """
        Get all session states.
        
        Returns:
            Dictionary mapping session IDs to their states.
        """
        with self._lock:
            return {
                sid: state.to_dict() 
                for sid, state in self._cache.items()
            }


# Global instance for easy access
session_state_manager = SessionStateManager()


# Convenience functions for backwards compatibility
def get_session_state(session_id: Optional[str] = None) -> Dict[str, str]:
    """Get session state (backwards compatible function)."""
    return session_state_manager.get_state(session_id)


def update_session_state_cache(
    session_id: str, 
    details: Dict[str, str]
) -> Dict[str, str]:
    """Update session state cache (backwards compatible function)."""
    return session_state_manager.update_state(session_id, details)

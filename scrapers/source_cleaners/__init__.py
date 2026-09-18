"""Source policy profiles used by the common maintenance orchestrator.

Adapters remain the only place that understands source HTML/API payloads.  A
profile contains operational expectations and safety limits, never lifecycle
or distribution mutations.
"""
from .base import SourceProfile
from .profiles import PROFILES, get_profile

__all__ = ["SourceProfile", "PROFILES", "get_profile"]

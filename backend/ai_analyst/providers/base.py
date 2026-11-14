"""Abstract LLM Provider interface and typed error hierarchy."""

from __future__ import annotations

from typing import Protocol


class ProviderError(Exception):
    """Base error for LLM provider failures."""


class ProviderTimeoutError(ProviderError):
    """Raised when the provider exceeds configured timeout."""


class ProviderRateLimitError(ProviderError):
    """Raised when the provider returns HTTP 429 / quota exceeded."""


class ProviderRefusalError(ProviderError):
    """Raised when the provider refuses to complete the prompt or blocks safety."""


class LLMProvider(Protocol):
    """Interface implemented by all LLM provider adapters."""

    provider_name: str
    model_name: str

    def generate_analysis(
        self,
        *,
        system_prompt: str,
        context_payload: dict,
        timeout_seconds: int = 30,
    ) -> str:
        """Generate raw JSON text matching DecisionAnalysis schema."""
        ...

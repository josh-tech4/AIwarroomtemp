"""AI Analyst service layer orchestrating provider calls and validation."""

from __future__ import annotations

import logging

from django.conf import settings

from ai_analyst.context_builder import (
    build_analysis_context,
    load_followup_prompt,
    load_system_prompt,
)
from ai_analyst.models import AIAnalysis, AIFollowUp
from ai_analyst.providers.base import LLMProvider, ProviderError
from ai_analyst.providers.gemini import GeminiProvider
from ai_analyst.providers.mock import MockProvider
from ai_analyst.validators import (
    EvidenceValidationError,
    validate_ai_output,
    validate_followup_output,
)
from simulation.models import SimulationRun

logger = logging.getLogger(__name__)


def get_configured_provider(provider_override: str | None = None) -> LLMProvider:
    """Resolve the active LLM provider adapter from settings or explicit test override."""
    name = (provider_override or getattr(settings, "AI_PROVIDER", "mock")).lower()
    if name == "gemini":
        return GeminiProvider()
    if name == "mock":
        return MockProvider()
    raise ProviderError(f"Unsupported AI provider '{name}'.")


class AIAnalystService:
    """Runs grounded AI analysis over an existing completed SimulationRun."""

    @classmethod
    def analyze_run(
        cls,
        *,
        run: SimulationRun,
        user,
        provider: LLMProvider | None = None,
    ) -> AIAnalysis:
        if run.status != SimulationRun.Status.COMPLETED:
            raise ValueError("Cannot run AI analysis on a simulation run that is not completed.")

        active_provider = provider or get_configured_provider()
        prompt_version, system_prompt = load_system_prompt()
        built = build_analysis_context(run)

        analysis = AIAnalysis.objects.create(
            run=run,
            provider=active_provider.provider_name,
            model_name=active_provider.model_name,
            prompt_version=prompt_version,
            status=AIAnalysis.Status.PENDING,
            context_summary={
                "run_id": built.payload["run_id"],
                "module": built.payload["module"],
                "allowed_metric_keys": built.payload["allowed_metric_keys"],
            },
            created_by=user,
        )

        timeout = getattr(settings, "AI_REQUEST_TIMEOUT_SECONDS", 30)

        try:
            raw_text = active_provider.generate_analysis(
                system_prompt=system_prompt,
                context_payload=built.payload,
                timeout_seconds=timeout,
            )
            validated = validate_ai_output(
                raw_text=raw_text,
                allowed_metric_keys=built.allowed_metric_keys,
                metric_values=built.metric_values,
            )
            analysis.structured_output = validated.analysis.model_dump()
            analysis.validation_warnings = validated.warnings
            analysis.status = AIAnalysis.Status.COMPLETED
            analysis.save(update_fields=["structured_output", "validation_warnings", "status"])
            logger.info(
                "AIAnalysis %s completed via %s", analysis.id, active_provider.provider_name
            )
            return analysis
        except (ProviderError, EvidenceValidationError) as exc:
            analysis.status = AIAnalysis.Status.FAILED
            analysis.error_message = str(exc)
            analysis.save(update_fields=["status", "error_message"])
            logger.warning("AIAnalysis %s failed safely: %s", analysis.id, exc)
            return analysis
        except Exception as exc:
            analysis.status = AIAnalysis.Status.FAILED
            analysis.error_message = "Unexpected error during AI analysis generation."
            analysis.save(update_fields=["status", "error_message"])
            logger.exception(
                "Unexpected error during AIAnalysis %s: %s", analysis.id, type(exc).__name__
            )
            return analysis

    @classmethod
    def ask_followup(
        cls,
        *,
        run: SimulationRun,
        user,
        question: str,
        provider: LLMProvider | None = None,
    ) -> AIFollowUp:
        """Answer a bounded follow-up question grounded strictly in SimulationRun context."""
        if run.status != SimulationRun.Status.COMPLETED:
            raise ValueError("Cannot ask AI follow-up on a run that is not completed.")

        active_provider = provider or get_configured_provider()
        prompt_version, system_prompt = load_followup_prompt()
        built = build_analysis_context(run)

        followup = AIFollowUp.objects.create(
            run=run,
            question=question.strip(),
            provider=active_provider.provider_name,
            model_name=active_provider.model_name,
            prompt_version=prompt_version,
            status=AIAnalysis.Status.PENDING,
            created_by=user,
        )

        timeout = getattr(settings, "AI_REQUEST_TIMEOUT_SECONDS", 30)
        try:
            gen_fn = getattr(active_provider, "generate_followup", None)
            if callable(gen_fn):
                raw_text = gen_fn(
                    system_prompt=system_prompt,
                    context_payload=built.payload,
                    question=question,
                    timeout_seconds=timeout,
                )
            else:
                raw_text = MockProvider().generate_followup(
                    system_prompt=system_prompt,
                    context_payload=built.payload,
                    question=question,
                    timeout_seconds=timeout,
                )

            validated = validate_followup_output(
                raw_text=raw_text,
                allowed_metric_keys=built.allowed_metric_keys,
                metric_values=built.metric_values,
            )
            followup.answer = validated.response.answer
            followup.cited_metrics = [c.model_dump() for c in validated.response.cited_metrics]
            followup.limitations = validated.response.limitations
            followup.validation_warnings = validated.warnings
            followup.status = AIAnalysis.Status.COMPLETED
            followup.save(
                update_fields=[
                    "answer",
                    "cited_metrics",
                    "limitations",
                    "validation_warnings",
                    "status",
                ]
            )
            return followup
        except (ProviderError, EvidenceValidationError) as exc:
            followup.status = AIAnalysis.Status.FAILED
            followup.error_message = str(exc)
            followup.save(update_fields=["status", "error_message"])
            return followup
        except Exception as exc:
            followup.status = AIAnalysis.Status.FAILED
            followup.error_message = "Unexpected error during follow-up generation."
            followup.save(update_fields=["status", "error_message"])
            logger.exception("Unexpected error during AIFollowUp %s: %s", followup.id, type(exc))
            return followup

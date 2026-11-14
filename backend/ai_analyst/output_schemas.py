"""Pydantic output schemas for AI Decision Analyst."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class EvidenceReference(BaseModel):
    """Links an AI claim directly to a persisted simulation metric or assumption key."""

    metric_key: str = Field(..., min_length=1)
    interpretation: str = Field(..., min_length=1)


class Recommendation(BaseModel):
    """Structured advisory recommendation grounded in simulation evidence."""

    title: str = Field(..., min_length=1)
    action: str = Field(..., min_length=1)
    rationale: str = Field(..., min_length=1)
    supporting_evidence: list[EvidenceReference] = Field(..., min_length=1)
    risks: list[str] = Field(default_factory=list)
    confidence: Literal["low", "medium", "high"]


class DecisionAnalysis(BaseModel):
    """Top-level structured output returned by the AI Decision Analyst."""

    executive_summary: str = Field(..., min_length=1)
    key_findings: list[str] = Field(..., min_length=1)
    strategy_comparison: list[str] = Field(default_factory=list)
    recommendations: list[Recommendation] = Field(..., min_length=1)
    missing_information: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(..., min_length=1)
    suggested_next_scenarios: list[str] = Field(default_factory=list)


class FollowUpResponse(BaseModel):
    """Structured response for a grounded follow-up question on a SimulationRun."""

    answer: str = Field(..., min_length=1)
    cited_metrics: list[EvidenceReference] = Field(default_factory=list)
    limitations: list[str] = Field(..., min_length=1)

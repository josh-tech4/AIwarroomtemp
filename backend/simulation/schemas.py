"""Typed Pydantic schemas for simulation engine inputs and outputs.

Pure Python — no Django dependencies. Uses Decimal for all monetary calculations.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class AssumptionUsed(BaseModel):
    """Provenance record of an input value consumed by an engine."""

    key: str
    value: Decimal
    unit: str
    source_type: str = "user_input"
    confidence: str = "medium"


class MetricOutput(BaseModel):
    """Single calculated metric produced by a simulation engine."""

    key: str
    label: str
    value: Decimal
    unit: str
    category: str
    formula_note: str = ""


class StrategyEvaluation(BaseModel):
    """Calculated output for a single strategy within a simulation run."""

    strategy_key: str
    strategy_name: str
    metrics: list[MetricOutput]
    warnings: list[str] = Field(default_factory=list)
    rank: int = 1


class ValidationReport(BaseModel):
    """Result of pre-run validation."""

    is_valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SimulationOutput(BaseModel):
    """Complete deterministic output contract returned by every SimulationEngine."""

    engine_key: str
    engine_version: str
    module: str
    currency: str
    baseline_metrics: list[MetricOutput] = Field(default_factory=list)
    metrics: list[MetricOutput] = Field(default_factory=list)
    strategy_results: list[StrategyEvaluation] = Field(default_factory=list)
    assumptions_used: list[AssumptionUsed] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

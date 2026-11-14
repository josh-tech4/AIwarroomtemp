"""Simulation engine interface and shared Decimal helpers."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Protocol

from simulation.schemas import SimulationOutput, ValidationReport

TWO_DP = Decimal("0.01")
FOUR_DP = Decimal("0.0001")


def to_decimal(value: Any, default: str | None = None) -> Decimal:
    """Safely convert numeric/string input to Decimal without binary float drift."""
    if value is None:
        if default is not None:
            return Decimal(default)
        raise ValueError("Missing required decimal value.")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def q_money(value: Decimal) -> Decimal:
    """Round monetary output to 2 decimal places using standard commercial rounding."""
    return value.quantize(TWO_DP, rounding=ROUND_HALF_UP)


def q_qty(value: Decimal) -> Decimal:
    """Round quantity/rate output to 2 decimal places."""
    return value.quantize(TWO_DP, rounding=ROUND_HALF_UP)


class SimulationEngine(Protocol):
    """Typed protocol implemented by all deterministic simulation engines."""

    engine_key: str
    engine_version: str
    module: str

    def validate(
        self, business_snapshot: dict[str, Any], scenario_config: dict[str, Any]
    ) -> ValidationReport:
        """Validate snapshot inputs and scenario parameters prior to execution."""
        ...

    def run(
        self,
        business_snapshot: dict[str, Any],
        scenario_config: dict[str, Any],
        strategies: list[dict[str, Any]] | None = None,
    ) -> SimulationOutput:
        """Run deterministic simulation and return typed SimulationOutput."""
        ...

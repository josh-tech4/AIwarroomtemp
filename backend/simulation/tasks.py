"""Celery tasks for asynchronous simulation execution (architecture-ready)."""

from __future__ import annotations

from celery import shared_task

from accounts.models import User
from scenarios.models import Scenario
from simulation.orchestrator import SimulationOrchestrator


@shared_task(name="simulation.execute_simulation_run")
def execute_simulation_run_task(
    scenario_id: str,
    user_id: str | None = None,
    strategy_keys: list[str] | None = None,
    idempotency_key: str | None = None,
) -> str:
    """Run a simulation asynchronously via Celery using the shared SimulationOrchestrator."""
    scenario = Scenario.objects.select_related("business__organization", "template").get(
        id=scenario_id
    )
    user = User.objects.filter(id=user_id).first() if user_id else None
    run = SimulationOrchestrator.execute_run(
        scenario=scenario,
        user=user,
        strategy_keys=strategy_keys,
        idempotency_key=idempotency_key,
    )
    return str(run.id)

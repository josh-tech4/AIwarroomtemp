"""Celery tasks for asynchronous AI analysis (architecture-ready)."""

from __future__ import annotations

from celery import shared_task

from accounts.models import User
from ai_analyst.services import AIAnalystService
from simulation.models import SimulationRun


@shared_task(name="ai_analyst.analyze_simulation_run")
def analyze_simulation_run_task(run_id: str, user_id: str | None = None) -> str:
    """Execute grounded AI analysis via Celery using the shared AIAnalystService."""
    run = SimulationRun.objects.select_related("business__organization", "scenario").get(id=run_id)
    user = User.objects.filter(id=user_id).first() if user_id else None
    analysis = AIAnalystService.analyze_run(run=run, user=user)
    return str(analysis.id)

"""Report generator service — consumes persisted snapshots and results only (no recalculation)."""

from __future__ import annotations

from django.utils import timezone

from ai_analyst.models import AIAnalysis
from businesses.models import BusinessProfile
from decisions.models import Decision
from reports.models import Report
from simulation.models import SimulationResult, SimulationRun
from simulation.services import build_strategy_comparison


class ReportGeneratorService:
    """Compiles structured on-screen reports from persisted domain entities."""

    @classmethod
    def generate_report(
        cls,
        *,
        business: BusinessProfile,
        run: SimulationRun | None,
        title: str,
        report_type: str,
        user,
    ) -> Report:
        sections: dict = {
            "generated_at": timezone.now().isoformat(),
            "disclaimer": (
                "All simulation figures are deterministic model estimates based on user-declared "
                "assumptions and illustrative inputs. They do not guarantee business outcomes or "
                "constitute financial or legal advice."
            ),
            "business": {
                "id": str(business.id),
                "name": business.name,
                "stage": business.stage,
                "industry": business.industry,
                "location": business.location,
                "currency": business.currency,
                "data_quality": business.data_quality,
                "is_demo": business.is_demo,
            },
            "run": None,
            "ai_analysis": None,
            "decisions": [],
        }

        if run is not None:
            results = SimulationResult.objects.filter(run=run)
            sections["run"] = {
                "id": str(run.id),
                "scenario_name": run.scenario.name,
                "module": run.scenario.module,
                "engine_key": run.engine_key,
                "engine_version": run.engine_version,
                "currency": run.currency,
                "completed_at": run.completed_at.isoformat() if run.completed_at else None,
                "assumptions_used": run.assumptions_used,
                "baseline_metrics": [
                    {
                        "metric_key": r.metric_key,
                        "label": r.label,
                        "value": str(r.value_numeric),
                        "unit": r.unit,
                    }
                    for r in results.filter(is_baseline=True)
                ],
                "scenario_metrics": [
                    {
                        "metric_key": r.metric_key,
                        "label": r.label,
                        "value": str(r.value_numeric),
                        "unit": r.unit,
                    }
                    for r in results.filter(is_baseline=False)
                ],
                "strategy_comparison": build_strategy_comparison(run).get("strategies", []),
                "warnings": run.warnings,
                "limitations": run.limitations,
            }

            latest_ai = (
                AIAnalysis.objects.filter(run=run, status=AIAnalysis.Status.COMPLETED)
                .order_by("-created_at")
                .first()
            )
            if latest_ai:
                sections["ai_analysis"] = {
                    "id": str(latest_ai.id),
                    "provider": latest_ai.provider,
                    "model_name": latest_ai.model_name,
                    "prompt_version": latest_ai.prompt_version,
                    "structured_output": latest_ai.structured_output,
                    "validation_warnings": latest_ai.validation_warnings,
                }

        decisions_qs = Decision.objects.filter(business=business).prefetch_related("actions")
        if run is not None:
            decisions_qs = decisions_qs.filter(run=run)

        sections["decisions"] = [
            {
                "id": str(d.id),
                "title": d.title,
                "selected_strategy_key": d.selected_strategy_key,
                "rationale": d.rationale,
                "status": d.status,
                "actions": [
                    {
                        "title": a.title,
                        "owner_name": a.owner_name or (a.owner.email if a.owner else ""),
                        "due_date": a.due_date.isoformat() if a.due_date else None,
                        "status": a.status,
                    }
                    for a in d.actions.all()
                ],
            }
            for d in decisions_qs
        ]

        return Report.objects.create(
            business=business,
            run=run,
            title=title,
            report_type=report_type,
            content=sections,
            created_by=user,
        )

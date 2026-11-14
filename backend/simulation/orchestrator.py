"""SimulationOrchestrator service: validates, snapshots, executes, and persists runs."""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from scenarios.models import Scenario
from simulation.engines.registry import get_engine
from simulation.models import SimulationResult, SimulationRun, Strategy, StrategyResult

logger = logging.getLogger(__name__)


def _json_safe(obj: Any) -> Any:
    """Recursively convert Decimal/UUID/datetime values into JSON-serializable primitives."""
    if isinstance(obj, Decimal):
        return str(obj)
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    return obj


class SimulationOrchestrator:
    """Coordinates snapshot creation, engine invocation, and result persistence."""

    @staticmethod
    def build_business_snapshot(scenario: Scenario) -> dict[str, Any]:
        """Freeze business profile, assumptions, metrics, components, and dependencies."""
        business = scenario.business
        assumptions = [
            {
                "key": a.key,
                "label": a.label or a.key,
                "value": str(a.value_numeric),
                "unit": a.unit,
                "assumption_type": a.assumption_type,
                "source_type": a.source_type,
                "source_reference": a.source_reference,
                "confidence": a.confidence,
                "notes": a.notes,
            }
            for a in business.assumptions.all()
        ]
        metrics = [
            {
                "key": m.key,
                "label": m.label or m.key,
                "value": str(m.value_numeric) if m.value_numeric is not None else None,
                "value_text": m.value_text,
                "unit": m.unit,
                "category": m.category,
                "source_type": m.source_type,
                "confidence": m.confidence,
            }
            for m in business.metrics.all()
        ]
        components = [
            {
                "id": str(c.id),
                "name": c.name,
                "component_type": c.component_type,
                "criticality": c.criticality,
            }
            for c in business.components.all()
        ]
        dependencies = [
            {
                "source": d.source_component.name,
                "target": d.target_component.name,
                "relationship_type": d.relationship_type,
                "criticality": d.criticality,
                "fallback_info": d.fallback_info,
            }
            for d in business.dependencies.select_related(
                "source_component", "target_component"
            ).all()
        ]
        return {
            "business_id": str(business.id),
            "name": business.name,
            "stage": business.stage,
            "industry": business.industry,
            "location": business.location,
            "currency": business.currency,
            "description": business.description,
            "data_quality": business.data_quality,
            "assumptions": assumptions,
            "metrics": metrics,
            "components": components,
            "dependencies": dependencies,
        }

    @staticmethod
    def build_scenario_config(scenario: Scenario) -> dict[str, Any]:
        """Extract configured parameters for the scenario."""
        params: dict[str, Any] = {}
        # Start with template defaults if available
        if scenario.template and isinstance(scenario.template.parameter_schema, dict):
            for key, schema_def in scenario.template.parameter_schema.items():
                if isinstance(schema_def, dict) and schema_def.get("default") is not None:
                    params[key] = str(schema_def["default"])

        # Apply explicit scenario parameter overrides
        for p in scenario.parameters.all():
            params[p.key] = str(p.value_numeric) if p.value_numeric is not None else p.value_text

        return {
            "scenario_id": str(scenario.id),
            "scenario_name": scenario.name,
            "module": scenario.module,
            "template_key": scenario.template.key if scenario.template else None,
            "parameters": params,
        }

    @staticmethod
    def ensure_scenario_strategies(
        scenario: Scenario, strategy_keys: list[str] | None = None
    ) -> list[Strategy]:
        """Ensure Strategy rows exist for the scenario, seeding from template defaults if empty."""
        if not scenario.strategies.exists() and scenario.template:
            for item in scenario.template.default_strategies or []:
                Strategy.objects.get_or_create(
                    scenario=scenario,
                    key=item["key"],
                    defaults={
                        "name": item.get("name", item["key"]),
                        "description": item.get("description", ""),
                        "parameter_overrides": item.get("parameter_overrides", {}),
                    },
                )
        qs = scenario.strategies.all()
        if strategy_keys:
            qs = qs.filter(key__in=strategy_keys)
        return list(qs)

    @classmethod
    def resolve_engine_key(cls, scenario: Scenario) -> str:
        if scenario.template and scenario.template.engine_key:
            return scenario.template.engine_key
        if scenario.module == "idea":
            return "business_idea_financial_v1"
        if scenario.module == "resilience":
            return "resilience_payment_gateway_outage_v1"
        raise ValidationError(f"No default engine mapped for module '{scenario.module}'.")

    @classmethod
    @transaction.atomic
    def execute_run(
        cls,
        *,
        scenario: Scenario,
        user,
        strategy_keys: list[str] | None = None,
        idempotency_key: str | None = None,
    ) -> SimulationRun:
        """Validate, snapshot, run deterministic simulation, and persist immutable results."""
        if idempotency_key:
            existing = SimulationRun.objects.filter(
                scenario=scenario, idempotency_key=idempotency_key
            ).first()
            if existing is not None:
                return existing

        engine_key = cls.resolve_engine_key(scenario)
        engine = get_engine(engine_key)

        business_snapshot = cls.build_business_snapshot(scenario)
        scenario_config = cls.build_scenario_config(scenario)

        validation = engine.validate(business_snapshot, scenario_config)
        if not validation.is_valid:
            raise ValidationError({"simulation_validation": validation.errors})

        strategy_objs = cls.ensure_scenario_strategies(scenario, strategy_keys=strategy_keys)
        strategy_configs = [
            {
                "key": s.key,
                "name": s.name,
                "parameter_overrides": s.parameter_overrides,
            }
            for s in strategy_objs
        ]
        strategy_by_key = {s.key: s for s in strategy_objs}

        snapshot_payload = _json_safe(
            {
                "business": business_snapshot,
                "scenario": scenario_config,
                "strategies": strategy_configs,
            }
        )

        run = SimulationRun.objects.create(
            business=scenario.business,
            scenario=scenario,
            engine_key=engine.engine_key,
            engine_version=engine.engine_version,
            currency=scenario.business.currency,
            status=SimulationRun.Status.RUNNING,
            idempotency_key=idempotency_key or None,
            input_snapshot=snapshot_payload,
            started_at=timezone.now(),
            created_by=user,
        )

        try:
            output = engine.run(business_snapshot, scenario_config, strategies=strategy_configs)

            result_rows = []
            for m in output.baseline_metrics:
                result_rows.append(
                    SimulationResult(
                        run=run,
                        is_baseline=True,
                        metric_key=m.key,
                        label=m.label,
                        value_numeric=m.value,
                        unit=m.unit,
                        category=m.category,
                        formula_note=m.formula_note,
                    )
                )
            for m in output.metrics:
                result_rows.append(
                    SimulationResult(
                        run=run,
                        is_baseline=False,
                        metric_key=m.key,
                        label=m.label,
                        value_numeric=m.value,
                        unit=m.unit,
                        category=m.category,
                        formula_note=m.formula_note,
                    )
                )
            SimulationResult.objects.bulk_create(result_rows)

            strategy_rows = []
            for eval_item in output.strategy_results:
                strat_obj = strategy_by_key.get(eval_item.strategy_key)
                if strat_obj is None:
                    strat_obj, _ = Strategy.objects.get_or_create(
                        scenario=scenario,
                        key=eval_item.strategy_key,
                        defaults={"name": eval_item.strategy_name},
                    )
                for m in eval_item.metrics:
                    strategy_rows.append(
                        StrategyResult(
                            run=run,
                            strategy=strat_obj,
                            metric_key=m.key,
                            label=m.label,
                            value_numeric=m.value,
                            unit=m.unit,
                            category=m.category,
                            formula_note=m.formula_note,
                            rank=eval_item.rank,
                            warnings=eval_item.warnings,
                        )
                    )
            StrategyResult.objects.bulk_create(strategy_rows)

            run.status = SimulationRun.Status.COMPLETED
            run.assumptions_used = _json_safe([a.model_dump() for a in output.assumptions_used])
            run.warnings = output.warnings
            run.limitations = output.limitations
            run.completed_at = timezone.now()
            run.save(
                update_fields=[
                    "status",
                    "assumptions_used",
                    "warnings",
                    "limitations",
                    "completed_at",
                ]
            )
            logger.info("SimulationRun %s completed (%s)", run.id, engine.engine_key)
            return run
        except Exception as exc:
            run.status = SimulationRun.Status.FAILED
            run.error_message = str(exc)
            run.completed_at = timezone.now()
            run.save(update_fields=["status", "error_message", "completed_at"])
            logger.exception("SimulationRun %s failed", run.id)
            raise

"""Query and comparison services for simulation runs (strategies & multi-run diffs)."""

from __future__ import annotations

from decimal import Decimal

from simulation.models import SimulationResult, SimulationRun, StrategyResult


def build_strategy_comparison(run: SimulationRun) -> dict:
    """Pivot normalized StrategyResult rows into a comparison structure."""
    rows = (
        StrategyResult.objects.filter(run=run)
        .select_related("strategy")
        .order_by("rank", "strategy__name", "metric_key")
    )

    grouped: dict = {}
    for row in rows:
        sid = str(row.strategy_id)
        if sid not in grouped:
            grouped[sid] = {
                "strategy_id": sid,
                "strategy_key": row.strategy.key,
                "strategy_name": row.strategy.name,
                "description": row.strategy.description,
                "rank": row.rank,
                "warnings": row.warnings,
                "metrics": [],
            }
        grouped[sid]["metrics"].append(
            {
                "metric_key": row.metric_key,
                "label": row.label,
                "value_numeric": str(row.value_numeric),
                "unit": row.unit,
                "category": row.category,
                "formula_note": row.formula_note,
            }
        )

    strategies = sorted(grouped.values(), key=lambda item: item["rank"])
    return {
        "mode": "strategies",
        "run_id": str(run.id),
        "scenario_id": str(run.scenario_id),
        "scenario_name": run.scenario.name,
        "module": run.scenario.module,
        "currency": run.currency,
        "engine_key": run.engine_key,
        "engine_version": run.engine_version,
        "strategies": strategies,
    }


def build_run_comparison(run_a: SimulationRun, run_b: SimulationRun) -> dict:
    """FR-020: Compare two prior SimulationRun snapshots and calculated metric deltas."""
    res_a = {r.metric_key: r for r in SimulationResult.objects.filter(run=run_a)}
    res_b = {r.metric_key: r for r in SimulationResult.objects.filter(run=run_b)}

    all_keys = sorted(set(res_a.keys()) | set(res_b.keys()))
    metric_diffs = []
    for k in all_keys:
        ra = res_a.get(k)
        rb = res_b.get(k)
        va = ra.value_numeric if ra else None
        vb = rb.value_numeric if rb else None
        delta = (vb - va) if (va is not None and vb is not None) else None
        pct_change = None
        if delta is not None and va is not None and va != Decimal("0"):
            pct_change = round((delta / abs(va)) * Decimal("100"), 2)

        metric_diffs.append(
            {
                "metric_key": k,
                "label": (rb or ra).label,
                "is_baseline": (rb or ra).is_baseline,
                "unit": (rb or ra).unit,
                "run_a_value": str(va) if va is not None else None,
                "run_b_value": str(vb) if vb is not None else None,
                "delta": str(delta) if delta is not None else None,
                "pct_change": str(pct_change) if pct_change is not None else None,
            }
        )

    assump_a = {a["key"]: a for a in (run_a.assumptions_used or [])}
    assump_b = {a["key"]: a for a in (run_b.assumptions_used or [])}
    assumption_diffs = []
    for k in sorted(set(assump_a.keys()) | set(assump_b.keys())):
        aa = assump_a.get(k)
        ab = assump_b.get(k)
        va = aa.get("value") if aa else None
        vb = ab.get("value") if ab else None
        if va != vb:
            assumption_diffs.append(
                {
                    "key": k,
                    "unit": (ab or aa or {}).get("unit", ""),
                    "run_a_value": str(va) if va is not None else None,
                    "run_b_value": str(vb) if vb is not None else None,
                }
            )

    return {
        "mode": "runs",
        "run_a": {
            "id": str(run_a.id),
            "scenario_name": run_a.scenario.name,
            "engine_version": run_a.engine_version,
            "created_at": run_a.created_at.isoformat(),
        },
        "run_b": {
            "id": str(run_b.id),
            "scenario_name": run_b.scenario.name,
            "engine_version": run_b.engine_version,
            "created_at": run_b.created_at.isoformat(),
        },
        "metric_diffs": metric_diffs,
        "assumption_diffs": assumption_diffs,
        "strategies": build_strategy_comparison(run_a).get("strategies", []),
    }

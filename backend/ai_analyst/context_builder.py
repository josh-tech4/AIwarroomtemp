"""Allowlisted context builder for AI Decision Analyst.

PRIVACY & SECURITY:
- Only passes allowlisted business/simulation fields to external LLM providers.
- Never includes user PII (emails, tokens, passwords) or unrelated org records.
- Delimits untrusted free-text descriptions to mitigate prompt injection.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from simulation.models import SimulationResult, SimulationRun, StrategyResult

PROMPT_VERSION = "v1.0.0"
PROMPT_FILE = Path(__file__).resolve().parent / "prompts" / "v1_decision_analysis.txt"
FOLLOWUP_PROMPT_FILE = Path(__file__).resolve().parent / "prompts" / "v1_followup.txt"


def load_system_prompt() -> tuple[str, str]:
    """Return (prompt_version, system_prompt_text)."""
    return PROMPT_VERSION, PROMPT_FILE.read_text(encoding="utf-8")


def load_followup_prompt() -> tuple[str, str]:
    """Return (prompt_version, followup_system_prompt_text)."""
    return PROMPT_VERSION, FOLLOWUP_PROMPT_FILE.read_text(encoding="utf-8")


@dataclass(frozen=True)
class BuiltContext:
    """Bundled allowlisted context and verification sets."""

    payload: dict[str, Any]
    allowed_metric_keys: set[str]
    metric_values: dict[str, str]


def _sanitize_untrusted_text(text: str, max_len: int = 1000) -> str:
    """Truncate and wrap untrusted user text so prompt-injection attempts stay bounded."""
    cleaned = (text or "").replace("</untrusted_user_content>", "").strip()
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len] + "...[truncated]"
    return f"<untrusted_user_content>{cleaned}</untrusted_user_content>"


def build_analysis_context(run: SimulationRun) -> BuiltContext:
    """Build strictly allowlisted context dictionary from persisted run snapshot & results."""
    snapshot = run.input_snapshot or {}
    biz = snapshot.get("business", {})
    scenario = snapshot.get("scenario", {})

    results = list(SimulationResult.objects.filter(run=run).order_by("-is_baseline", "metric_key"))
    strat_rows = list(
        StrategyResult.objects.filter(run=run)
        .select_related("strategy")
        .order_by("rank", "strategy__key", "metric_key")
    )

    allowed_keys: set[str] = set()
    metric_values: dict[str, str] = {}

    baseline_metrics = []
    scenario_metrics = []
    for r in results:
        allowed_keys.add(r.metric_key)
        metric_values[r.metric_key] = str(r.value_numeric)
        item = {
            "metric_key": r.metric_key,
            "label": r.label,
            "value": str(r.value_numeric),
            "unit": r.unit,
            "category": r.category,
            "formula_note": r.formula_note,
        }
        if r.is_baseline:
            baseline_metrics.append(item)
        else:
            scenario_metrics.append(item)

    strategies_map: dict[str, dict[str, Any]] = {}
    for sr in strat_rows:
        allowed_keys.add(sr.metric_key)
        # Store per-strategy key as well as metric key for evidence validation
        strategies_map.setdefault(
            sr.strategy.key,
            {
                "strategy_key": sr.strategy.key,
                "strategy_name": sr.strategy.name,
                "rank": sr.rank,
                "warnings": sr.warnings,
                "metrics": [],
            },
        )
        strategies_map[sr.strategy.key]["metrics"].append(
            {
                "metric_key": sr.metric_key,
                "label": sr.label,
                "value": str(sr.value_numeric),
                "unit": sr.unit,
            }
        )
        if sr.metric_key not in metric_values:
            metric_values[sr.metric_key] = str(sr.value_numeric)

    assumptions = []
    for a in run.assumptions_used or biz.get("assumptions", []):
        key = a.get("key", "")
        if key:
            allowed_keys.add(key)
            metric_values[key] = str(a.get("value", ""))
        assumptions.append(
            {
                "key": key,
                "value": str(a.get("value", "")),
                "unit": a.get("unit", ""),
                "source_type": a.get("source_type", "user_input"),
                "confidence": a.get("confidence", "medium"),
            }
        )

    payload = {
        "run_id": str(run.id),
        "module": scenario.get("module", run.scenario.module),
        "engine_key": run.engine_key,
        "engine_version": run.engine_version,
        "currency": run.currency,
        "business_summary": {
            "name": biz.get("name", run.business.name),
            "stage": biz.get("stage", run.business.stage),
            "industry": biz.get("industry", run.business.industry),
            "data_quality": biz.get("data_quality", "draft"),
            "description": _sanitize_untrusted_text(biz.get("description", "")),
        },
        "scenario": {
            "name": scenario.get("scenario_name", run.scenario.name),
            "parameters": scenario.get("parameters", {}),
        },
        "assumptions_used": assumptions,
        "baseline_metrics": baseline_metrics,
        "scenario_metrics": scenario_metrics,
        "strategy_comparison": list(strategies_map.values()),
        "warnings": run.warnings,
        "limitations": run.limitations,
        "allowed_metric_keys": sorted(allowed_keys),
    }

    return BuiltContext(
        payload=payload,
        allowed_metric_keys=allowed_keys,
        metric_values=metric_values,
    )

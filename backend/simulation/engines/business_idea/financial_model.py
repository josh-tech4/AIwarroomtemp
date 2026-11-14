"""Deterministic monthly unit-economics engine for the Business Idea Simulator.

Pure Python — zero Django or HTTP dependencies.
All monetary calculations use Decimal.
All outputs are explicitly labeled as model estimates based on user assumptions.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from simulation.engines.base import q_money, q_qty, to_decimal
from simulation.schemas import (
    AssumptionUsed,
    MetricOutput,
    SimulationOutput,
    StrategyEvaluation,
    ValidationReport,
)

HUNDRED = Decimal("100")
ZERO = Decimal("0")


class BusinessIdeaFinancialEngine:
    """Monthly financial unit-economics model for e-commerce / online grocery businesses."""

    engine_key = "business_idea_financial_v1"
    engine_version = "1.0.0"
    module = "idea"

    REQUIRED_INPUTS = (
        "orders_per_month",
        "avg_order_value",
        "variable_cost_per_order",
        "fixed_monthly_costs",
        "marketing_spend",
    )

    def _extract_inputs(
        self, business_snapshot: dict[str, Any], scenario_config: dict[str, Any]
    ) -> tuple[dict[str, Decimal], dict[str, AssumptionUsed]]:
        assumptions_map: dict[str, dict[str, Any]] = {
            item["key"]: item for item in business_snapshot.get("assumptions", [])
        }
        metrics_map: dict[str, dict[str, Any]] = {
            item["key"]: item for item in business_snapshot.get("metrics", [])
        }
        params_map: dict[str, Any] = scenario_config.get("parameters", {})

        def resolve(key: str, default: str | None = None) -> tuple[Decimal | None, str, str, str]:
            if key in params_map and params_map[key] is not None:
                return to_decimal(params_map[key]), "", "user_input", "medium"
            if key in assumptions_map:
                a = assumptions_map[key]
                return (
                    to_decimal(a["value"]),
                    a.get("unit", ""),
                    a.get("source_type", "user_input"),
                    a.get("confidence", "medium"),
                )
            if key in metrics_map and metrics_map[key].get("value") is not None:
                m = metrics_map[key]
                return (
                    to_decimal(m["value"]),
                    m.get("unit", ""),
                    m.get("source_type", "user_input"),
                    m.get("confidence", "medium"),
                )
            if default is not None:
                return Decimal(default), "", "illustrative", "low"
            return None, "", "user_input", "low"

        # Support either avg_order_value or average_order_value alias
        if (
            "avg_order_value" not in assumptions_map
            and "avg_order_value" not in metrics_map
            and "average_order_value" in assumptions_map
        ):
            assumptions_map["avg_order_value"] = assumptions_map["average_order_value"]

        values: dict[str, Decimal] = {}
        used: dict[str, AssumptionUsed] = {}

        for key in self.REQUIRED_INPUTS:
            val, unit, src, conf = resolve(key)
            if val is not None:
                values[key] = val
                used[key] = AssumptionUsed(
                    key=key,
                    value=val,
                    unit=unit or self._default_unit(key, business_snapshot.get("currency", "INR")),
                    source_type=src,
                    confidence=conf,
                )

        for opt_key in ("initial_capital", "capacity_limit"):
            val, unit, src, conf = resolve(opt_key)
            if val is not None:
                values[opt_key] = val
                used[opt_key] = AssumptionUsed(
                    key=opt_key,
                    value=val,
                    unit=unit
                    or self._default_unit(opt_key, business_snapshot.get("currency", "INR")),
                    source_type=src,
                    confidence=conf,
                )

        return values, used

    @staticmethod
    def _default_unit(key: str, currency: str) -> str:
        units = {
            "orders_per_month": "orders/month",
            "avg_order_value": f"{currency}/order",
            "variable_cost_per_order": f"{currency}/order",
            "fixed_monthly_costs": f"{currency}/month",
            "marketing_spend": f"{currency}/month",
            "initial_capital": currency,
            "capacity_limit": "orders/month",
        }
        return units.get(key, "")

    def validate(
        self, business_snapshot: dict[str, Any], scenario_config: dict[str, Any]
    ) -> ValidationReport:
        errors: list[str] = []
        warnings: list[str] = []
        values, _ = self._extract_inputs(business_snapshot, scenario_config)

        for req in self.REQUIRED_INPUTS:
            if req not in values:
                errors.append(f"Missing required business assumption: '{req}'.")

        for key, val in values.items():
            if val < ZERO:
                errors.append(f"Input '{key}' cannot be negative (got {val}).")

        params = scenario_config.get("parameters", {})
        demand_pct = to_decimal(params.get("demand_change_pct"), "0")
        if demand_pct < Decimal("-100"):
            errors.append("demand_change_pct cannot be less than -100%.")
        price_pct = to_decimal(params.get("price_change_pct"), "0")
        if price_pct < Decimal("-100"):
            errors.append("price_change_pct cannot be less than -100%.")

        if "initial_capital" not in values:
            warnings.append(
                "initial_capital is not set; simplified cash runway cannot be computed if negative."
            )

        return ValidationReport(is_valid=len(errors) == 0, errors=errors, warnings=warnings)

    def _compute_monthly_model(
        self,
        *,
        orders: Decimal,
        aov: Decimal,
        var_cost: Decimal,
        fixed_costs: Decimal,
        marketing: Decimal,
        initial_capital: Decimal | None,
        capacity_limit: Decimal | None,
        currency: str,
        prefix: str = "",
    ) -> tuple[list[MetricOutput], list[str]]:
        warnings: list[str] = []
        effective_orders = orders
        if capacity_limit is not None and orders > capacity_limit:
            effective_orders = capacity_limit
            warnings.append(
                f"Modeled orders ({q_qty(orders)}) exceeded capacity ({q_qty(capacity_limit)}); "
                f"effective orders capped at {q_qty(effective_orders)}."
            )

        gross_sales = q_money(effective_orders * aov)
        variable_costs = q_money(effective_orders * var_cost)
        contribution = q_money(gross_sales - variable_costs)
        operating_result = q_money(contribution - fixed_costs - marketing)

        if contribution < ZERO:
            warnings.append(
                "Negative unit contribution: variable cost per order exceeds average order value."
            )

        contribution_margin_pct = (
            q_qty((contribution / gross_sales) * HUNDRED) if gross_sales > ZERO else ZERO
        )

        metrics = [
            MetricOutput(
                key=f"{prefix}effective_orders",
                label="Effective Monthly Orders",
                value=q_qty(effective_orders),
                unit="orders/month",
                category="operational",
                formula_note="min(orders_per_month, capacity_limit) if capacity_limit set",
            ),
            MetricOutput(
                key=f"{prefix}gross_sales",
                label="Estimated Monthly Gross Sales",
                value=gross_sales,
                unit=f"{currency}/month",
                category="financial",
                formula_note="effective_orders * avg_order_value (estimate, not cash collected)",
            ),
            MetricOutput(
                key=f"{prefix}variable_costs",
                label="Estimated Variable Costs",
                value=variable_costs,
                unit=f"{currency}/month",
                category="financial",
                formula_note="effective_orders * variable_cost_per_order",
            ),
            MetricOutput(
                key=f"{prefix}contribution",
                label="Contribution Margin",
                value=contribution,
                unit=f"{currency}/month",
                category="financial",
                formula_note="gross_sales - variable_costs",
            ),
            MetricOutput(
                key=f"{prefix}contribution_margin_pct",
                label="Contribution Margin (%)",
                value=contribution_margin_pct,
                unit="%",
                category="financial",
                formula_note="(contribution / gross_sales) * 100",
            ),
            MetricOutput(
                key=f"{prefix}operating_result",
                label="Simplified Monthly Operating Result",
                value=operating_result,
                unit=f"{currency}/month",
                category="financial",
                formula_note="contribution - fixed_monthly_costs - marketing_spend",
            ),
        ]

        if operating_result < ZERO:
            monthly_burn = q_money(abs(operating_result))
            metrics.append(
                MetricOutput(
                    key=f"{prefix}monthly_net_burn",
                    label="Estimated Monthly Net Burn",
                    value=monthly_burn,
                    unit=f"{currency}/month",
                    category="financial",
                    formula_note="abs(operating_result) when operating_result < 0",
                )
            )
            if initial_capital is not None and monthly_burn > ZERO:
                runway = q_qty(initial_capital / monthly_burn)
                metrics.append(
                    MetricOutput(
                        key=f"{prefix}runway_months",
                        label="Simplified Cash Runway",
                        value=runway,
                        unit="months",
                        category="financial",
                        formula_note="initial_capital / monthly_net_burn (excludes timing)",
                    )
                )
        else:
            metrics.append(
                MetricOutput(
                    key=f"{prefix}monthly_net_burn",
                    label="Estimated Monthly Net Burn",
                    value=ZERO,
                    unit=f"{currency}/month",
                    category="financial",
                    formula_note="Zero burn when operating_result >= 0 (break-even or positive)",
                )
            )

        return metrics, warnings

    @staticmethod
    def _apply_pct(base: Decimal, pct: Decimal) -> Decimal:
        result = base * (Decimal("1") + (pct / HUNDRED))
        return max(ZERO, result)

    def run(
        self,
        business_snapshot: dict[str, Any],
        scenario_config: dict[str, Any],
        strategies: list[dict[str, Any]] | None = None,
    ) -> SimulationOutput:
        validation = self.validate(business_snapshot, scenario_config)
        if not validation.is_valid:
            raise ValueError("; ".join(validation.errors))

        currency = business_snapshot.get("currency", "INR")
        values, used = self._extract_inputs(business_snapshot, scenario_config)
        params = scenario_config.get("parameters", {})

        base_orders = values["orders_per_month"]
        base_aov = values["avg_order_value"]
        base_var = values["variable_cost_per_order"]
        base_fixed = values["fixed_monthly_costs"]
        base_mkt = values["marketing_spend"]
        initial_capital = values.get("initial_capital")
        base_cap = values.get("capacity_limit")

        # 1. Baseline calculation
        baseline_metrics, baseline_warnings = self._compute_monthly_model(
            orders=base_orders,
            aov=base_aov,
            var_cost=base_var,
            fixed_costs=base_fixed,
            marketing=base_mkt,
            initial_capital=initial_capital,
            capacity_limit=base_cap,
            currency=currency,
            prefix="baseline_",
        )

        # 2. Scenario calculation (apply scenario parameter overrides)
        scen_cap = (
            to_decimal(params["capacity_limit"])
            if params.get("capacity_limit") is not None
            else base_cap
        )
        scen_orders = self._apply_pct(base_orders, to_decimal(params.get("demand_change_pct"), "0"))
        scen_aov = self._apply_pct(base_aov, to_decimal(params.get("price_change_pct"), "0"))
        scen_var = self._apply_pct(
            base_var, to_decimal(params.get("variable_cost_change_pct"), "0")
        )
        scen_fixed = self._apply_pct(
            base_fixed, to_decimal(params.get("fixed_cost_change_pct"), "0")
        )
        scen_mkt = self._apply_pct(base_mkt, to_decimal(params.get("marketing_change_pct"), "0"))

        scenario_metrics, scen_warnings = self._compute_monthly_model(
            orders=scen_orders,
            aov=scen_aov,
            var_cost=scen_var,
            fixed_costs=scen_fixed,
            marketing=scen_mkt,
            initial_capital=initial_capital,
            capacity_limit=scen_cap,
            currency=currency,
            prefix="",
        )

        # Delta metric vs baseline operating result
        base_op = next(m.value for m in baseline_metrics if m.key == "baseline_operating_result")
        scen_op = next(m.value for m in scenario_metrics if m.key == "operating_result")
        scenario_metrics.append(
            MetricOutput(
                key="operating_result_delta_vs_baseline",
                label="Operating Result Delta vs Baseline",
                value=q_money(scen_op - base_op),
                unit=f"{currency}/month",
                category="financial",
                formula_note="scenario operating_result - baseline_operating_result",
            )
        )

        # 3. Strategy evaluation
        if not strategies:
            strategies = [
                {
                    "key": "baseline_plan",
                    "name": "Proceed With Scenario Assumptions",
                    "parameter_overrides": {},
                }
            ]

        strategy_results: list[StrategyEvaluation] = []
        for strat in strategies:
            overrides = strat.get("parameter_overrides", {})
            st_orders = self._apply_pct(
                scen_orders, to_decimal(overrides.get("demand_change_pct"), "0")
            )
            st_aov = self._apply_pct(scen_aov, to_decimal(overrides.get("price_change_pct"), "0"))
            st_var = self._apply_pct(
                scen_var, to_decimal(overrides.get("variable_cost_change_pct"), "0")
            )
            st_fixed = self._apply_pct(
                scen_fixed, to_decimal(overrides.get("fixed_cost_change_pct"), "0")
            )
            st_mkt = self._apply_pct(
                scen_mkt, to_decimal(overrides.get("marketing_change_pct"), "0")
            )
            st_metrics, st_warnings = self._compute_monthly_model(
                orders=st_orders,
                aov=st_aov,
                var_cost=st_var,
                fixed_costs=st_fixed,
                marketing=st_mkt,
                initial_capital=initial_capital,
                capacity_limit=scen_cap,
                currency=currency,
                prefix="",
            )
            strategy_results.append(
                StrategyEvaluation(
                    strategy_key=strat["key"],
                    strategy_name=strat.get("name", strat["key"]),
                    metrics=st_metrics,
                    warnings=st_warnings,
                )
            )

        # Rank strategies by highest operating_result
        def _op_result(se: StrategyEvaluation) -> Decimal:
            for m in se.metrics:
                if m.key == "operating_result":
                    return m.value
            return ZERO

        strategy_results.sort(key=_op_result, reverse=True)
        for idx, se in enumerate(strategy_results, start=1):
            se.rank = idx

        all_warnings = list(dict.fromkeys(validation.warnings + baseline_warnings + scen_warnings))
        limitations = [
            "Projections are illustrative estimates based on declared assumptions, not forecasts.",
            "Simplified monthly P&L excludes taxes, working-capital timing, refunds, and cohorts.",
        ]

        return SimulationOutput(
            engine_key=self.engine_key,
            engine_version=self.engine_version,
            module=self.module,
            currency=currency,
            baseline_metrics=baseline_metrics,
            metrics=scenario_metrics,
            strategy_results=strategy_results,
            assumptions_used=list(used.values()),
            warnings=all_warnings,
            limitations=limitations,
        )

"""Deterministic Payment Gateway Outage engine for Business Resilience Simulator.

Pure Python — zero Django or HTTP dependencies.
All monetary calculations use Decimal.

CRITICAL DISTINCTION:
    affected_transaction_value != revenue_loss.
    Actual unrecovered value depends on the chosen response strategy,
    backup capacity, failover/retry success rates, and recapture assumptions.
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

ZERO = Decimal("0")
ONE = Decimal("1")
HOURS_PER_DAY = Decimal("24")


class PaymentGatewayOutageEngine:
    """Models primary payment gateway outage impact and compares recovery strategies."""

    engine_key = "resilience_payment_gateway_outage_v1"
    engine_version = "1.0.0"
    module = "resilience"

    SUPPORTED_STRATEGIES = ("wait", "failover", "queue_retry")

    DEFAULTS = {
        "primary_gateway_share": "0.85",
        "outage_duration_hours": "2.0",
        "peak_hour_multiplier": "1.0",
        "backup_gateway_capacity": "150",
        "failover_success_rate": "0.85",
        "retry_success_rate": "0.55",
        "recapture_rate_after_recovery": "0.25",
        "failover_incremental_fee_per_order": "5.00",
        "retry_cost_per_order": "2.00",
    }

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

        # Support deriving daily_orders from orders_per_month / 30 if daily_orders absent
        if (
            "daily_orders" not in assumptions_map
            and "daily_orders" not in metrics_map
            and "orders_per_month" in assumptions_map
            and "daily_orders" not in params_map
        ):
            monthly = to_decimal(assumptions_map["orders_per_month"]["value"])
            assumptions_map["daily_orders"] = {
                "key": "daily_orders",
                "value": (monthly / Decimal("30")),
                "unit": "orders/day",
                "source_type": "derived",
                "confidence": "medium",
            }

        if (
            "avg_order_value" not in assumptions_map
            and "avg_order_value" not in metrics_map
            and "average_order_value" in assumptions_map
        ):
            assumptions_map["avg_order_value"] = assumptions_map["average_order_value"]

        def resolve(key: str) -> tuple[Decimal | None, str, str, str]:
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
            if key in self.DEFAULTS:
                return Decimal(self.DEFAULTS[key]), "", "illustrative", "low"
            return None, "", "user_input", "low"

        currency = business_snapshot.get("currency", "INR")
        keys = ("daily_orders", "avg_order_value", *self.DEFAULTS.keys())
        values: dict[str, Decimal] = {}
        used: dict[str, AssumptionUsed] = {}

        for key in keys:
            val, unit, src, conf = resolve(key)
            if val is not None:
                values[key] = val
                used[key] = AssumptionUsed(
                    key=key,
                    value=val,
                    unit=unit or self._default_unit(key, currency),
                    source_type=src,
                    confidence=conf,
                )

        return values, used

    @staticmethod
    def _default_unit(key: str, currency: str) -> str:
        mapping = {
            "daily_orders": "orders/day",
            "avg_order_value": f"{currency}/order",
            "primary_gateway_share": "ratio",
            "outage_duration_hours": "hours",
            "peak_hour_multiplier": "multiplier",
            "backup_gateway_capacity": "orders/hour",
            "failover_success_rate": "ratio",
            "retry_success_rate": "ratio",
            "recapture_rate_after_recovery": "ratio",
            "failover_incremental_fee_per_order": f"{currency}/order",
            "retry_cost_per_order": f"{currency}/order",
        }
        return mapping.get(key, "")

    def validate(
        self, business_snapshot: dict[str, Any], scenario_config: dict[str, Any]
    ) -> ValidationReport:
        errors: list[str] = []
        warnings: list[str] = []
        values, used = self._extract_inputs(business_snapshot, scenario_config)

        for req in ("daily_orders", "avg_order_value"):
            if req not in values:
                errors.append(f"Missing required business input: '{req}'.")

        for key, val in values.items():
            if val < ZERO:
                errors.append(f"Input '{key}' cannot be negative (got {val}).")

        for ratio_key in (
            "primary_gateway_share",
            "failover_success_rate",
            "retry_success_rate",
            "recapture_rate_after_recovery",
        ):
            if ratio_key in values and not (ZERO <= values[ratio_key] <= ONE):
                errors.append(
                    f"'{ratio_key}' must be between 0.0 and 1.0 (got {values[ratio_key]})."
                )

        if values.get("outage_duration_hours", ZERO) == ZERO:
            warnings.append("Outage duration is 0 hours; outage impact will be zero.")
        if values.get("daily_orders", ZERO) == ZERO:
            warnings.append("Daily orders is 0; outage impact will be zero.")

        if used.get("daily_orders") and used["daily_orders"].source_type == "derived":
            warnings.append(
                "daily_orders derived from orders_per_month / 30; enter explicit daily_orders."
            )

        return ValidationReport(is_valid=len(errors) == 0, errors=errors, warnings=warnings)

    def _evaluate_strategy(
        self,
        *,
        strategy_key: str,
        strategy_name: str,
        affected_orders: Decimal,
        affected_value: Decimal,
        outage_hours: Decimal,
        aov: Decimal,
        values: dict[str, Decimal],
        currency: str,
    ) -> StrategyEvaluation:
        warnings: list[str] = []
        incremental_cost = ZERO

        if affected_orders == ZERO:
            recovered_orders = ZERO
        elif strategy_key == "wait":
            recapture = values["recapture_rate_after_recovery"]
            recovered_orders = min(affected_orders, affected_orders * recapture)
        elif strategy_key == "failover":
            backup_cap_hr = values["backup_gateway_capacity"]
            failover_rate = values["failover_success_rate"]
            max_backup_orders = backup_cap_hr * outage_hours
            redirected = min(affected_orders, max_backup_orders)
            if affected_orders > max_backup_orders:
                warnings.append(
                    f"Affected orders ({q_qty(affected_orders)}) exceed backup gateway capacity "
                    f"({q_qty(max_backup_orders)} orders over {outage_hours}h)."
                )
            recovered_orders = min(affected_orders, redirected * failover_rate)
            incremental_cost = q_money(redirected * values["failover_incremental_fee_per_order"])
        elif strategy_key == "queue_retry":
            retry_rate = values["retry_success_rate"]
            recovered_orders = min(affected_orders, affected_orders * retry_rate)
            incremental_cost = q_money(affected_orders * values["retry_cost_per_order"])
        else:
            raise ValueError(f"Unsupported payment outage strategy: '{strategy_key}'.")

        recovered_orders = q_qty(min(affected_orders, recovered_orders))
        affected_orders_q = q_qty(affected_orders)
        unrecovered_orders = q_qty(max(ZERO, affected_orders_q - recovered_orders))

        recovered_value = q_money(recovered_orders * aov)
        unrecovered_value = q_money(unrecovered_orders * aov)
        net_recovered_value = q_money(recovered_value - incremental_cost)
        recovery_rate_pct = (
            q_qty((recovered_orders / affected_orders_q) * Decimal("100"))
            if affected_orders_q > ZERO
            else ZERO
        )

        metrics = [
            MetricOutput(
                key="affected_orders",
                label="Affected Orders",
                value=affected_orders_q,
                unit="orders",
                category="operational",
                formula_note="(daily_orders / 24) * outage_duration_hours * primary_gateway_share",
            ),
            MetricOutput(
                key="recovered_orders",
                label="Recovered Orders",
                value=recovered_orders,
                unit="orders",
                category="operational",
                formula_note="Bounded by affected_orders and strategy capacity/success rate",
            ),
            MetricOutput(
                key="unrecovered_orders",
                label="Unrecovered Orders",
                value=unrecovered_orders,
                unit="orders",
                category="operational",
                formula_note="affected_orders - recovered_orders",
            ),
            MetricOutput(
                key="recovery_rate_pct",
                label="Order Recovery Rate (%)",
                value=recovery_rate_pct,
                unit="%",
                category="operational",
                formula_note="(recovered_orders / affected_orders) * 100",
            ),
            MetricOutput(
                key="affected_transaction_value",
                label="Affected Transaction Value (Gross Exposure)",
                value=q_money(affected_value),
                unit=currency,
                category="financial",
                formula_note="affected_orders * avg_order_value (NOT automatically revenue loss)",
            ),
            MetricOutput(
                key="recovered_transaction_value",
                label="Recovered Transaction Value",
                value=recovered_value,
                unit=currency,
                category="financial",
                formula_note="recovered_orders * avg_order_value",
            ),
            MetricOutput(
                key="estimated_unrecovered_transaction_value",
                label="Estimated Unrecovered Transaction Value",
                value=unrecovered_value,
                unit=currency,
                category="financial",
                formula_note="unrecovered_orders * avg_order_value",
            ),
            MetricOutput(
                key="incremental_mitigation_cost",
                label="Incremental Gateway / Retry Cost",
                value=incremental_cost,
                unit=currency,
                category="financial",
                formula_note="Incremental transaction fees or retry operational costs",
            ),
            MetricOutput(
                key="net_recovered_value",
                label="Net Recovered Transaction Value",
                value=net_recovered_value,
                unit=currency,
                category="financial",
                formula_note="recovered_transaction_value - incremental_mitigation_cost",
            ),
        ]

        return StrategyEvaluation(
            strategy_key=strategy_key,
            strategy_name=strategy_name,
            metrics=metrics,
            warnings=warnings,
        )

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

        daily_orders = values["daily_orders"]
        aov = values["avg_order_value"]
        primary_share = values["primary_gateway_share"]
        outage_hours = values["outage_duration_hours"]
        peak_mult = values["peak_hour_multiplier"]

        orders_per_hour = (
            (daily_orders / HOURS_PER_DAY) * peak_mult if daily_orders > ZERO else ZERO
        )
        affected_orders = orders_per_hour * outage_hours * primary_share
        affected_value = q_money(affected_orders * aov)
        normal_daily_gmv = q_money(daily_orders * aov)

        baseline_metrics = [
            MetricOutput(
                key="baseline_daily_orders",
                label="Normal Daily Orders",
                value=q_qty(daily_orders),
                unit="orders/day",
                category="operational",
                formula_note="Declared normal daily order volume",
            ),
            MetricOutput(
                key="baseline_orders_per_hour",
                label="Modeled Hourly Order Rate",
                value=q_qty(orders_per_hour),
                unit="orders/hour",
                category="operational",
                formula_note="daily_orders / 24 (uniform distribution approximation)",
            ),
            MetricOutput(
                key="baseline_daily_gmv",
                label="Normal Daily Transaction Value",
                value=normal_daily_gmv,
                unit=currency,
                category="financial",
                formula_note="daily_orders * avg_order_value",
            ),
        ]

        if not strategies:
            strategies = [
                {"key": "wait", "name": "Wait for Primary Recovery"},
                {"key": "failover", "name": "Fail Over to Backup Gateway"},
                {"key": "queue_retry", "name": "Queue & Retry Failed Payments"},
            ]

        strategy_results: list[StrategyEvaluation] = []
        for strat in strategies:
            key = strat["key"]
            if key not in self.SUPPORTED_STRATEGIES:
                continue
            strategy_results.append(
                self._evaluate_strategy(
                    strategy_key=key,
                    strategy_name=strat.get("name", key),
                    affected_orders=affected_orders,
                    affected_value=affected_value,
                    outage_hours=outage_hours,
                    aov=aov,
                    values=values,
                    currency=currency,
                )
            )

        # Rank by net_recovered_value descending
        def _net_val(se: StrategyEvaluation) -> Decimal:
            for m in se.metrics:
                if m.key == "net_recovered_value":
                    return m.value
            return ZERO

        strategy_results.sort(key=_net_val, reverse=True)
        for idx, se in enumerate(strategy_results, start=1):
            se.rank = idx

        # Top-level run metrics reflect outage exposure + best ranked strategy summary
        top_metrics = [
            MetricOutput(
                key="affected_orders",
                label="Affected Orders During Outage",
                value=q_qty(affected_orders),
                unit="orders",
                category="operational",
                formula_note="orders_per_hour * outage_duration_hours * primary_gateway_share",
            ),
            MetricOutput(
                key="affected_transaction_value",
                label="Affected Transaction Value (Not Lost Revenue)",
                value=affected_value,
                unit=currency,
                category="financial",
                formula_note="Gross order value exposed; actual loss depends on strategy",
            ),
        ]

        if strategy_results:
            best = strategy_results[0]
            best_unrec = next(
                m.value for m in best.metrics if m.key == "estimated_unrecovered_transaction_value"
            )
            best_rec = next(m.value for m in best.metrics if m.key == "recovered_transaction_value")
            top_metrics.extend(
                [
                    MetricOutput(
                        key="best_strategy_recovered_value",
                        label=f"Recovered Value ({best.strategy_name})",
                        value=best_rec,
                        unit=currency,
                        category="financial",
                        formula_note="Highest net recovery across evaluated strategies",
                    ),
                    MetricOutput(
                        key="best_strategy_unrecovered_value",
                        label=f"Estimated Unrecovered Value ({best.strategy_name})",
                        value=best_unrec,
                        unit=currency,
                        category="financial",
                        formula_note="Remaining unrecovered value under top-ranked strategy",
                    ),
                ]
            )

        warnings = list(
            dict.fromkeys(
                validation.warnings
                + [
                    "Affected transaction value is gross exposure, NOT automatically lost revenue.",
                    "Order arrival across the outage window uses a uniform 24-hour approximation.",
                ]
            )
        )
        limitations = [
            "Uniform hourly order distribution ignores peak-hour traffic spikes.",
            "Does not account for permanent customer churn beyond immediate order abandonment.",
        ]

        return SimulationOutput(
            engine_key=self.engine_key,
            engine_version=self.engine_version,
            module=self.module,
            currency=currency,
            baseline_metrics=baseline_metrics,
            metrics=top_metrics,
            strategy_results=strategy_results,
            assumptions_used=list(used.values()),
            warnings=warnings,
            limitations=limitations,
        )

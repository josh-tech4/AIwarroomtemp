"""Pure Python unit tests for simulation engines.

Tests edge cases, zero values, capacity constraints, Decimal precision,
unit consistency, and deterministic reproducibility.
"""

from decimal import Decimal

from simulation.engines.business_idea.financial_model import BusinessIdeaFinancialEngine
from simulation.engines.resilience.payment_gateway_outage import PaymentGatewayOutageEngine


def _idea_snapshot(
    orders="1000",
    aov="600",
    var_cost="420",
    fixed="120000",
    marketing="50000",
    capital="1000000",
    capacity=None,
):
    assumptions = [
        {
            "key": "orders_per_month",
            "value": orders,
            "unit": "orders/month",
            "source_type": "user_input",
        },
        {"key": "avg_order_value", "value": aov, "unit": "INR/order", "source_type": "user_input"},
        {
            "key": "variable_cost_per_order",
            "value": var_cost,
            "unit": "INR/order",
            "source_type": "user_input",
        },
        {
            "key": "fixed_monthly_costs",
            "value": fixed,
            "unit": "INR/month",
            "source_type": "user_input",
        },
        {
            "key": "marketing_spend",
            "value": marketing,
            "unit": "INR/month",
            "source_type": "user_input",
        },
    ]
    if capital is not None:
        assumptions.append(
            {"key": "initial_capital", "value": capital, "unit": "INR", "source_type": "user_input"}
        )
    if capacity is not None:
        assumptions.append(
            {
                "key": "capacity_limit",
                "value": capacity,
                "unit": "orders/month",
                "source_type": "user_input",
            }
        )
    return {"currency": "INR", "assumptions": assumptions, "metrics": []}


def _metric_map(metrics):
    return {m.key: m for m in metrics}


class TestBusinessIdeaFinancialEngine:
    def setup_method(self):
        self.engine = BusinessIdeaFinancialEngine()

    def test_baseline_and_demand_shock_calculations(self):
        snapshot = _idea_snapshot()
        scenario = {"parameters": {"demand_change_pct": "-30"}}
        out = self.engine.run(snapshot, scenario)

        base = _metric_map(out.baseline_metrics)
        scen = _metric_map(out.metrics)

        # Baseline: 1000 * 600 = 600k; var = 420k; contrib = 180k; op = 180k - 170k = 10k
        assert base["baseline_gross_sales"].value == Decimal("600000.00")
        assert base["baseline_variable_costs"].value == Decimal("420000.00")
        assert base["baseline_contribution"].value == Decimal("180000.00")
        assert base["baseline_operating_result"].value == Decimal("10000.00")
        assert base["baseline_monthly_net_burn"].value == Decimal("0")
        assert "baseline_runway_months" not in base

        # Scenario (-30% -> 700): sales = 420k; var = 294k; contrib = 126k; op = -44k
        assert scen["effective_orders"].value == Decimal("700.00")
        assert scen["gross_sales"].value == Decimal("420000.00")
        assert scen["operating_result"].value == Decimal("-44000.00")
        assert scen["monthly_net_burn"].value == Decimal("44000.00")
        # Runway: 1,000,000 / 44,000 = 22.73 months
        assert scen["runway_months"].value == Decimal("22.73")

    def test_capacity_limit_caps_orders(self):
        snapshot = _idea_snapshot(orders="1500", capacity="1000")
        out = self.engine.run(snapshot, {"parameters": {"demand_change_pct": "20"}})
        scen = _metric_map(out.metrics)
        assert scen["effective_orders"].value == Decimal("1000.00")
        assert any("capacity" in w.lower() for w in out.warnings)

    def test_zero_orders_handles_cleanly(self):
        snapshot = _idea_snapshot(orders="0")
        out = self.engine.run(snapshot, {"parameters": {}})
        scen = _metric_map(out.metrics)
        assert scen["gross_sales"].value == Decimal("0.00")
        assert scen["contribution_margin_pct"].value == Decimal("0")

    def test_missing_required_assumption_fails_validation(self):
        snapshot = {"currency": "INR", "assumptions": [], "metrics": []}
        report = self.engine.validate(snapshot, {"parameters": {}})
        assert report.is_valid is False
        assert len(report.errors) == 5

    def test_reproducibility(self):
        snapshot = _idea_snapshot()
        scenario = {"parameters": {"demand_change_pct": "-20", "price_change_pct": "5"}}
        out1 = self.engine.run(snapshot, scenario)
        out2 = self.engine.run(snapshot, scenario)
        assert out1.model_dump() == out2.model_dump()


def _outage_snapshot(daily_orders="2400", aov="500"):
    return {
        "currency": "INR",
        "assumptions": [
            {
                "key": "daily_orders",
                "value": daily_orders,
                "unit": "orders/day",
                "source_type": "user_input",
            },
            {
                "key": "avg_order_value",
                "value": aov,
                "unit": "INR/order",
                "source_type": "user_input",
            },
        ],
        "metrics": [],
    }


class TestPaymentGatewayOutageEngine:
    def setup_method(self):
        self.engine = PaymentGatewayOutageEngine()

    def test_zero_outage_duration_produces_zero_impact(self):
        out = self.engine.run(
            _outage_snapshot(),
            {"parameters": {"outage_duration_hours": "0"}},
        )
        top = _metric_map(out.metrics)
        assert top["affected_orders"].value == Decimal("0.00")
        assert top["affected_transaction_value"].value == Decimal("0.00")

    def test_zero_daily_orders_no_division_by_zero(self):
        out = self.engine.run(
            _outage_snapshot(daily_orders="0"),
            {"parameters": {"outage_duration_hours": "4"}},
        )
        top = _metric_map(out.metrics)
        assert top["affected_orders"].value == Decimal("0.00")
        for se in out.strategy_results:
            sm = _metric_map(se.metrics)
            assert sm["recovered_orders"].value == Decimal("0.00")
            assert sm["recovery_rate_pct"].value == Decimal("0")

    def test_backup_capacity_constrains_failover_and_recovered_never_exceeds_affected(self):
        # 2400/day = 100/hr; 2h * 1.0 share = 200 affected orders
        # Backup capacity = 40/hr * 2h = 80 max redirected -> * 0.90 success = 72 recovered
        out = self.engine.run(
            _outage_snapshot(daily_orders="2400", aov="500"),
            {
                "parameters": {
                    "outage_duration_hours": "2",
                    "primary_gateway_share": "1.0",
                    "backup_gateway_capacity": "40",
                    "failover_success_rate": "0.90",
                    "failover_incremental_fee_per_order": "10",
                }
            },
            strategies=[{"key": "failover", "name": "Failover"}],
        )
        failover = _metric_map(out.strategy_results[0].metrics)
        assert failover["affected_orders"].value == Decimal("200.00")
        assert failover["recovered_orders"].value == Decimal("72.00")
        assert failover["unrecovered_orders"].value == Decimal("128.00")
        assert failover["recovered_orders"].value <= failover["affected_orders"].value
        assert failover["affected_transaction_value"].value == Decimal("100000.00")
        assert failover["recovered_transaction_value"].value == Decimal("36000.00")
        assert failover["estimated_unrecovered_transaction_value"].value == Decimal("64000.00")
        assert failover["incremental_mitigation_cost"].value == Decimal("800.00")
        assert failover["net_recovered_value"].value == Decimal("35200.00")

    def test_all_three_strategies_evaluated_and_distinction_documented(self):
        out = self.engine.run(
            _outage_snapshot(daily_orders="2400", aov="500"),
            {"parameters": {"outage_duration_hours": "2", "primary_gateway_share": "0.80"}},
        )
        keys = {s.strategy_key for s in out.strategy_results}
        assert keys == {"wait", "failover", "queue_retry"}
        assert any("not automatically" in w.lower() for w in out.warnings)

    def test_invalid_ratio_rejected_by_validate(self):
        report = self.engine.validate(
            _outage_snapshot(),
            {"parameters": {"primary_gateway_share": "1.5"}},
        )
        assert report.is_valid is False

"""Idempotent seeding of default MVP scenario templates."""

from __future__ import annotations

from scenarios.models import ScenarioTemplate

DEFAULT_TEMPLATES = [
    {
        "key": "business_idea_stress_test",
        "module": ScenarioTemplate.Module.IDEA,
        "name": "Business Idea Unit Economics Stress Test",
        "description": (
            "Test monthly revenue, contribution margin, operating result, and simplified runway "
            "under demand, pricing, cost, or capacity shocks."
        ),
        "engine_key": "business_idea_financial_v1",
        "version": "1.0.0",
        "parameter_schema": {
            "demand_change_pct": {
                "label": "Demand / Orders Change (%)",
                "type": "decimal",
                "unit": "%",
                "default": 0,
                "min": -100,
                "max": 500,
            },
            "price_change_pct": {
                "label": "Average Order Value Change (%)",
                "type": "decimal",
                "unit": "%",
                "default": 0,
                "min": -90,
                "max": 300,
            },
            "variable_cost_change_pct": {
                "label": "Variable Cost per Order Change (%)",
                "type": "decimal",
                "unit": "%",
                "default": 0,
                "min": -90,
                "max": 500,
            },
            "fixed_cost_change_pct": {
                "label": "Fixed Monthly Costs Change (%)",
                "type": "decimal",
                "unit": "%",
                "default": 0,
                "min": -90,
                "max": 500,
            },
            "marketing_change_pct": {
                "label": "Marketing Spend Change (%)",
                "type": "decimal",
                "unit": "%",
                "default": 0,
                "min": -100,
                "max": 500,
            },
            "capacity_limit": {
                "label": "Monthly Fulfillment Capacity Limit (orders)",
                "type": "decimal",
                "unit": "orders/month",
                "default": None,
                "min": 0,
            },
        },
        "default_strategies": [
            {
                "key": "baseline_plan",
                "name": "Proceed With Current Assumptions",
                "description": "Execute scenario parameters without additional mitigation.",
                "parameter_overrides": {},
            },
            {
                "key": "lean_marketing_cut",
                "name": "Reduce Marketing Spend by 25%",
                "description": "Cut paid acquisition spend by 25% to preserve runway.",
                "parameter_overrides": {"marketing_change_pct": -25},
            },
            {
                "key": "margin_defense_pricing",
                "name": "Increase Price 8% & Cut Variable Cost 5%",
                "description": (
                    "Offset demand/cost pressure via modest price increase and supplier terms."
                ),
                "parameter_overrides": {
                    "price_change_pct": 8,
                    "variable_cost_change_pct": -5,
                },
            },
        ],
    },
    {
        "key": "payment_gateway_outage",
        "module": ScenarioTemplate.Module.RESILIENCE,
        "name": "Primary Payment Gateway Outage",
        "description": (
            "Simulate primary payment gateway downtime and compare Wait, Failover to Backup, "
            "and Queue & Retry recovery strategies."
        ),
        "engine_key": "resilience_payment_gateway_outage_v1",
        "version": "1.0.0",
        "parameter_schema": {
            "outage_duration_hours": {
                "label": "Outage Duration",
                "type": "decimal",
                "unit": "hours",
                "default": 2,
                "min": 0,
                "max": 168,
            },
            "peak_hour_multiplier": {
                "label": "Peak Hour Traffic Multiplier (1.0 = uniform 24h)",
                "type": "decimal",
                "unit": "multiplier",
                "default": 1.0,
                "min": 0.25,
                "max": 5.0,
            },
            "primary_gateway_share": {
                "label": "Share of Orders via Primary Gateway (0-1)",
                "type": "decimal",
                "unit": "ratio",
                "default": 0.85,
                "min": 0,
                "max": 1,
            },
            "backup_gateway_capacity": {
                "label": "Backup Gateway Capacity",
                "type": "decimal",
                "unit": "orders/hour",
                "default": 150,
                "min": 0,
            },
            "failover_success_rate": {
                "label": "Failover Success Rate (0-1)",
                "type": "decimal",
                "unit": "ratio",
                "default": 0.85,
                "min": 0,
                "max": 1,
            },
            "retry_success_rate": {
                "label": "Queue & Retry Success Rate (0-1)",
                "type": "decimal",
                "unit": "ratio",
                "default": 0.55,
                "min": 0,
                "max": 1,
            },
            "recapture_rate_after_recovery": {
                "label": "Organic Recapture After Recovery (0-1)",
                "type": "decimal",
                "unit": "ratio",
                "default": 0.25,
                "min": 0,
                "max": 1,
            },
            "failover_incremental_fee_per_order": {
                "label": "Incremental Failover Gateway Fee",
                "type": "decimal",
                "unit": "INR/order",
                "default": 5,
                "min": 0,
            },
            "retry_cost_per_order": {
                "label": "Queue & Retry Messaging/Ops Cost",
                "type": "decimal",
                "unit": "INR/order",
                "default": 2,
                "min": 0,
            },
        },
        "default_strategies": [
            {
                "key": "wait",
                "name": "Wait for Primary Recovery",
                "description": (
                    "No automated mitigation; rely on customers returning organically post-outage."
                ),
                "parameter_overrides": {},
            },
            {
                "key": "failover",
                "name": "Fail Over to Backup Gateway",
                "description": (
                    "Route affected checkout traffic to secondary gateway up to its capacity."
                ),
                "parameter_overrides": {},
            },
            {
                "key": "queue_retry",
                "name": "Queue & Retry Failed Payments",
                "description": (
                    "Hold failed payment intents and retry automatically once gateway recovers."
                ),
                "parameter_overrides": {},
            },
        ],
    },
]


def ensure_default_templates() -> list[ScenarioTemplate]:
    """Ensure the two MVP scenario templates exist in the database."""
    templates = []
    for item in DEFAULT_TEMPLATES:
        tpl, _ = ScenarioTemplate.objects.update_or_create(
            key=item["key"],
            defaults={
                "module": item["module"],
                "name": item["name"],
                "description": item["description"],
                "engine_key": item["engine_key"],
                "version": item["version"],
                "parameter_schema": item["parameter_schema"],
                "default_strategies": item["default_strategies"],
                "is_active": True,
            },
        )
        templates.append(tpl)
    return templates

"""Deterministic Mock LLM Provider for CI, tests, and offline local development."""

from __future__ import annotations

import json
from typing import Any


class MockProvider:
    """Produces valid, evidence-grounded DecisionAnalysis JSON from the supplied context."""

    provider_name = "mock"
    model_name = "mock-deterministic-v1"

    def generate_analysis(
        self,
        *,
        system_prompt: str,
        context_payload: dict[str, Any],
        timeout_seconds: int = 30,
    ) -> str:
        module = context_payload.get("module", "idea")
        currency = context_payload.get("currency", "INR")
        biz_name = context_payload.get("business_summary", {}).get("name", "Business")
        scenario_name = context_payload.get("scenario", {}).get("name", "Scenario")
        scen_metrics = context_payload.get("scenario_metrics", [])
        base_metrics = context_payload.get("baseline_metrics", [])
        strategies = context_payload.get("strategy_comparison", [])
        assumptions = context_payload.get("assumptions_used", [])

        metric_lookup = {m["metric_key"]: m for m in (scen_metrics + base_metrics)}
        assumption_keys = [a["key"] for a in assumptions if a.get("source_type") == "illustrative"]

        if module == "resilience":
            affected_orders = metric_lookup.get("affected_orders", {}).get("value", "0")
            affected_val = metric_lookup.get("affected_transaction_value", {}).get("value", "0")
            best_rec = metric_lookup.get("best_strategy_recovered_value", {}).get("value", "0")
            best_unrec = metric_lookup.get("best_strategy_unrecovered_value", {}).get("value", "0")

            evidence = [
                {
                    "metric_key": "affected_orders",
                    "interpretation": (
                        f"{affected_orders} orders are exposed during the modeled outage window."
                    ),
                },
                {
                    "metric_key": "affected_transaction_value",
                    "interpretation": (
                        f"Gross exposed transaction value is {affected_val} {currency}; "
                        "this is NOT automatically lost revenue."
                    ),
                },
            ]
            if "best_strategy_unrecovered_value" in metric_lookup:
                evidence.append(
                    {
                        "metric_key": "best_strategy_unrecovered_value",
                        "interpretation": (
                            "Under the top-ranked strategy, estimated unrecovered value drops "
                            f"to {best_unrec} {currency} (with {best_rec} {currency} recovered)."
                        ),
                    }
                )

            strat_lines = []
            for st in strategies:
                st_metrics = {m["metric_key"]: m["value"] for m in st.get("metrics", [])}
                strat_lines.append(
                    f"Rank #{st['rank']} — {st['strategy_name']}: recovers "
                    f"{st_metrics.get('recovered_orders', '0')} orders "
                    f"(net recovered {st_metrics.get('net_recovered_value', '0')} {currency}, "
                    f"cost {st_metrics.get('incremental_mitigation_cost', '0')} {currency})."
                )

            response = {
                "executive_summary": (
                    f"Deterministic resilience analysis for {biz_name} under '{scenario_name}'. "
                    f"{affected_orders} orders representing {affected_val} {currency} in gross "
                    "transaction value are exposed during the outage. Unrecovered exposure "
                    "varies substantially across mitigation strategies."
                ),
                "key_findings": [
                    (
                        f"Total exposed orders: {affected_orders} "
                        "(uniform 24-hour arrival approximation)."
                    ),
                    (
                        f"Gross affected transaction value: {affected_val} {currency} "
                        "(distinct from revenue loss)."
                    ),
                    *[f"Strategy evaluation: {line}" for line in strat_lines[:2]],
                ],
                "strategy_comparison": strat_lines or ["Only one baseline strategy was evaluated."],
                "recommendations": [
                    {
                        "title": "Prioritize automated backup/mitigation over passive waiting",
                        "action": (
                            "Review failover capacity and retry workflows against incremental "
                            "fee assumptions before outage occurrence."
                        ),
                        "rationale": (
                            "Comparing recovered orders vs incremental mitigation cost reveals "
                            "clear trade-offs across strategies."
                        ),
                        "supporting_evidence": evidence,
                        "risks": [
                            (
                                "Backup gateway capacity is based on user-supplied assumptions "
                                "and may degrade under peak load."
                            ),
                            "Uniform hourly demand may underestimate evening peak outage impact.",
                        ],
                        "confidence": "medium",
                    }
                ],
                "missing_information": [
                    "Hourly order distribution curve (peak vs off-peak hours).",
                    "Contractual SLA and burst rate limits for secondary payment gateway.",
                    *[f"Verify illustrative default assumption: {k}." for k in assumption_keys[:3]],
                ],
                "limitations": [
                    "Uses a uniform 24-hour order distribution approximation.",
                    (
                        "Estimates are derived from user-declared assumptions and do not account "
                        "for long-term customer churn."
                    ),
                ],
                "suggested_next_scenarios": [
                    "Test a 4-hour peak outage with reduced backup gateway capacity.",
                    "Sensitivity test on failover_success_rate (0.65 vs 0.90).",
                ],
            }
            return json.dumps(response)

        # Business Idea Financial Model analysis
        gross_sales = metric_lookup.get("gross_sales", {}).get("value", "0")
        op_res = metric_lookup.get("operating_result", {}).get("value", "0")
        contrib = metric_lookup.get("contribution", {}).get("value", "0")
        delta = metric_lookup.get("operating_result_delta_vs_baseline", {}).get("value", "0")

        evidence = [
            {
                "metric_key": "gross_sales",
                "interpretation": (
                    f"Modeled monthly gross sales equal {gross_sales} {currency}/month."
                ),
            },
            {
                "metric_key": "contribution",
                "interpretation": (
                    f"Contribution margin after variable costs is {contrib} {currency}/month."
                ),
            },
            {
                "metric_key": "operating_result",
                "interpretation": (
                    f"Simplified monthly operating result is {op_res} {currency}/month "
                    f"(delta of {delta} {currency}/month vs baseline)."
                ),
            },
        ]
        if "runway_months" in metric_lookup:
            runway = metric_lookup["runway_months"]["value"]
            evidence.append(
                {
                    "metric_key": "runway_months",
                    "interpretation": (
                        f"At current burn, simplified cash runway is {runway} months."
                    ),
                }
            )

        strat_lines = []
        for st in strategies:
            st_metrics = {m["metric_key"]: m["value"] for m in st.get("metrics", [])}
            strat_lines.append(
                f"Rank #{st['rank']} — {st['strategy_name']}: operating result "
                f"{st_metrics.get('operating_result', '0')} {currency}/month, "
                f"gross sales {st_metrics.get('gross_sales', '0')} {currency}/month."
            )

        response = {
            "executive_summary": (
                f"Illustrative unit-economics analysis for {biz_name} under '{scenario_name}'. "
                f"Modeled monthly gross sales are {gross_sales} {currency}/month with an operating "
                f"result of {op_res} {currency}/month (change of {delta} {currency}/month vs "
                "baseline). All figures are model estimates contingent on declared assumptions."
            ),
            "key_findings": [
                (
                    f"Modeled gross sales: {gross_sales} {currency}/month; "
                    f"contribution: {contrib} {currency}/month."
                ),
                (
                    f"Simplified operating result: {op_res} {currency}/month "
                    f"({delta} {currency} vs baseline)."
                ),
                "Operating result sensitivity is driven by order volume and variable cost.",
            ],
            "strategy_comparison": strat_lines or ["Single scenario projection evaluated."],
            "recommendations": [
                {
                    "title": "Stress-test acquisition spend and unit contribution before scaling",
                    "action": (
                        "Validate variable cost per order and demand elasticity via a small "
                        "pilot before committing fixed overhead."
                    ),
                    "rationale": (
                        "Maintaining positive contribution margin protects runway if demand falls "
                        "below initial expectations."
                    ),
                    "supporting_evidence": evidence,
                    "risks": [
                        "Declared demand and pricing assumptions are unverified estimates.",
                        "Model excludes working-capital timing delays, refunds, and taxes.",
                    ],
                    "confidence": "medium",
                }
            ],
            "missing_information": [
                "Customer repeat purchase rate and cohort retention curve.",
                "Supplier bulk discount tiers and delivery fulfillment variance.",
                "Working capital cycle and tax assumptions.",
            ],
            "limitations": [
                "Outputs are illustrative model estimates, not guaranteed financial forecasts.",
                "Simplified monthly P&L excludes working-capital timing, refunds, and taxes.",
            ],
            "suggested_next_scenarios": [
                "Test a 20% increase in variable cost per order combined with -15% demand.",
                "Test capacity expansion impact when orders exceed fulfillment ceiling.",
            ],
        }
        return json.dumps(response)

    def generate_followup(
        self,
        *,
        system_prompt: str,
        context_payload: dict[str, Any],
        question: str,
        timeout_seconds: int = 30,
    ) -> str:
        """Deterministic grounded follow-up answer citing persisted metric keys."""
        del system_prompt, timeout_seconds
        module = context_payload.get("module", "idea")
        currency = context_payload.get("currency", "INR")
        scen_metrics = context_payload.get("scenario_metrics", [])
        base_metrics = context_payload.get("baseline_metrics", [])
        strategies = context_payload.get("strategy_comparison", [])
        metric_lookup = {m["metric_key"]: m for m in (scen_metrics + base_metrics)}
        q_lower = question.lower()

        cited: list[dict[str, str]] = []
        parts: list[str] = []

        if module == "resilience":
            aff = metric_lookup.get("affected_orders", {}).get("value", "0")
            aff_val = metric_lookup.get("affected_transaction_value", {}).get("value", "0")
            best_rec = metric_lookup.get("best_strategy_recovered_value", {}).get("value", "0")
            best_unrec = metric_lookup.get("best_strategy_unrecovered_value", {}).get("value", "0")
            top = strategies[0] if strategies else None

            cited.append(
                {
                    "metric_key": "affected_transaction_value",
                    "interpretation": (
                        f"Gross affected value is {aff_val} {currency} ({aff} orders)."
                    ),
                }
            )
            if "best_strategy_recovered_value" in metric_lookup:
                cited.append(
                    {
                        "metric_key": "best_strategy_recovered_value",
                        "interpretation": (
                            f"Top strategy recovers {best_rec} {currency} of exposure."
                        ),
                    }
                )
            if "best_strategy_unrecovered_value" in metric_lookup:
                cited.append(
                    {
                        "metric_key": "best_strategy_unrecovered_value",
                        "interpretation": f"Residual unrecovered value is {best_unrec} {currency}.",
                    }
                )

            if "cost" in q_lower or "fee" in q_lower or "strategy" in q_lower or "best" in q_lower:
                parts.append(
                    f"Based on the persisted outage run, top-ranked strategy "
                    f"'{top['strategy_name'] if top else 'N/A'}' recovers {best_rec} {currency} "
                    f"out of {aff_val} {currency} gross exposed transaction value, leaving "
                    f"{best_unrec} {currency} unrecovered."
                )
            else:
                parts.append(
                    f"During this modeled outage, {aff} orders ({aff_val} {currency} gross value) "
                    "are exposed — note that gross exposure is not automatic revenue loss because "
                    f"mitigation recovers {best_rec} {currency} under the best-ranked strategy."
                )
        else:
            sales = metric_lookup.get("gross_sales", {}).get("value", "0")
            op = metric_lookup.get("operating_result", {}).get("value", "0")
            contrib = metric_lookup.get("contribution", {}).get("value", "0")
            delta = metric_lookup.get("operating_result_delta_vs_baseline", {}).get("value", "0")

            cited.append(
                {
                    "metric_key": "operating_result",
                    "interpretation": (
                        f"Modeled monthly operating result is {op} {currency}/month "
                        f"(delta {delta} {currency}/month vs baseline)."
                    ),
                }
            )
            cited.append(
                {
                    "metric_key": "contribution",
                    "interpretation": f"Monthly contribution is {contrib} {currency}/month.",
                }
            )
            if "runway_months" in metric_lookup:
                rw = metric_lookup["runway_months"]["value"]
                cited.append(
                    {
                        "metric_key": "runway_months",
                        "interpretation": f"Simplified cash runway is {rw} months.",
                    }
                )

            if "runway" in q_lower or "cash" in q_lower or "burn" in q_lower:
                rw = metric_lookup.get("runway_months", {}).get("value")
                rw_text = f" giving an estimated simplified runway of {rw} months" if rw else ""
                parts.append(
                    f"Under these assumptions, monthly operating result is {op} {currency}/month"
                    f"{rw_text} (before accounting for tax or receivables timing)."
                )
            else:
                parts.append(
                    f"For the modeled scenario, gross sales are {sales} {currency}/month, "
                    f"contribution is {contrib} {currency}/month, and simplified operating result "
                    f"is {op} {currency}/month (a {delta} {currency}/month shift vs baseline)."
                )

        if strategies:
            strat_summary = "; ".join(f"#{s['rank']} {s['strategy_name']}" for s in strategies)
            parts.append(f"Evaluated strategies rank as: {strat_summary}.")

        return json.dumps(
            {
                "answer": " ".join(parts),
                "cited_metrics": cited,
                "limitations": [
                    (
                        "Answer derived strictly from persisted deterministic simulation outputs "
                        "and declared assumptions."
                    ),
                    (
                        "Unmodeled factors (macro shifts, working capital timing, customer churn) "
                        "are excluded."
                    ),
                ],
            }
        )

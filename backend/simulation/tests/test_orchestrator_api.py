"""Integration tests for SimulationOrchestrator, immutable snapshots, and simulation API."""

from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework import status

from businesses.models import BusinessAssumption
from businesses.tests.factories import BusinessAssumptionFactory, BusinessProfileFactory
from scenarios.models import Scenario, ScenarioParameter
from scenarios.template_seed import ensure_default_templates


@pytest.mark.django_db
class TestSimulationOrchestratorAndAPI:
    def _create_idea_business_and_scenario(self, org, user):
        templates = ensure_default_templates()
        idea_tpl = next(t for t in templates if t.key == "business_idea_stress_test")
        biz = BusinessProfileFactory(organization=org, created_by=user, currency="INR")
        defaults = [
            ("orders_per_month", "1000", "orders/month"),
            ("avg_order_value", "600", "INR/order"),
            ("variable_cost_per_order", "420", "INR/order"),
            ("fixed_monthly_costs", "120000", "INR/month"),
            ("marketing_spend", "50000", "INR/month"),
            ("initial_capital", "1000000", "INR"),
        ]
        for k, v, u in defaults:
            BusinessAssumptionFactory(business=biz, key=k, value_numeric=Decimal(v), unit=u)

        scenario = Scenario.objects.create(
            business=biz,
            template=idea_tpl,
            module="idea",
            name="Demand Drop -30%",
            created_by=user,
        )
        ScenarioParameter.objects.create(
            scenario=scenario,
            key="demand_change_pct",
            value_numeric=Decimal("-30"),
            unit="%",
            override_type=ScenarioParameter.OverrideType.PERCENTAGE,
        )
        return biz, scenario

    def test_run_simulation_api_and_snapshot_immutability(
        self, authenticated_client, organization, user
    ):
        biz, scenario = self._create_idea_business_and_scenario(organization, user)

        resp = authenticated_client.post(
            reverse("simulation-run-list"),
            {"scenario_id": str(scenario.id)},
            format="json",
            HTTP_IDEMPOTENCY_KEY="idem-key-001",
        )
        assert resp.status_code == status.HTTP_202_ACCEPTED
        run_id = resp.data["id"]
        assert resp.data["status"] == "completed"

        # Retry with same Idempotency-Key returns same run without duplicating
        resp_dup = authenticated_client.post(
            reverse("simulation-run-list"),
            {"scenario_id": str(scenario.id)},
            format="json",
            HTTP_IDEMPOTENCY_KEY="idem-key-001",
        )
        assert resp_dup.data["id"] == run_id

        # Mutate business assumption AFTER the run
        aov = BusinessAssumption.objects.get(business=biz, key="avg_order_value")
        aov.value_numeric = Decimal("9999.0000")
        aov.save()

        # Past run results & snapshot must NEVER mutate
        results_resp = authenticated_client.get(reverse("simulation-run-results", args=[run_id]))
        assert results_resp.status_code == status.HTTP_200_OK
        gross_sales = next(
            m for m in results_resp.data["metrics"] if m["metric_key"] == "gross_sales"
        )
        assert Decimal(gross_sales["value_numeric"]) == Decimal("420000.0000")

        # Strategy comparison endpoint works
        strat_resp = authenticated_client.get(reverse("simulation-run-strategies", args=[run_id]))
        assert strat_resp.status_code == status.HTTP_200_OK
        assert len(strat_resp.data["strategies"]) == 3

    def test_tenant_isolation_on_simulation_runs(
        self,
        authenticated_client,
        another_authenticated_client,
        organization,
        user,
    ):
        _, scenario = self._create_idea_business_and_scenario(organization, user)
        resp = authenticated_client.post(
            reverse("simulation-run-list"),
            {"scenario_id": str(scenario.id)},
            format="json",
        )
        run_id = resp.data["id"]

        # Another org cannot read or run scenarios in Org A
        other_get = another_authenticated_client.get(
            reverse("simulation-run-detail", args=[run_id])
        )
        assert other_get.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]

        other_run = another_authenticated_client.post(
            reverse("simulation-run-list"),
            {"scenario_id": str(scenario.id)},
            format="json",
        )
        assert other_run.status_code == status.HTTP_403_FORBIDDEN

    def test_spec_section14_alias_and_nested_endpoints(
        self, authenticated_client, organization, user
    ):
        biz, scenario = self._create_idea_business_and_scenario(organization, user)

        # /api/v1/users/me/ and /api/v1/scenario-templates/
        assert authenticated_client.get("/api/v1/users/me/").status_code == status.HTTP_200_OK
        tpl_resp = authenticated_client.get("/api/v1/scenario-templates/")
        assert tpl_resp.status_code == status.HTTP_200_OK
        assert len(tpl_resp.data["results"]) >= 2

        # Nested /api/v1/businesses/{id}/scenarios/
        nested_list = authenticated_client.get(f"/api/v1/businesses/{biz.id}/scenarios/")
        assert nested_list.status_code == status.HTTP_200_OK
        assert len(nested_list.data["results"]) == 1

        # Nested /api/v1/scenarios/{id}/runs/ with empty body
        run_resp = authenticated_client.post(
            f"/api/v1/scenarios/{scenario.id}/runs/", {}, format="json"
        )
        assert run_resp.status_code == status.HTTP_202_ACCEPTED
        run_id = run_resp.data["id"]

        # Spec §14 /api/v1/simulation-runs/{id}/analyze/ and /analysis/
        analyze_resp = authenticated_client.post(
            f"/api/v1/simulation-runs/{run_id}/analyze/", {}, format="json"
        )
        assert analyze_resp.status_code == status.HTTP_202_ACCEPTED
        analysis_resp = authenticated_client.get(f"/api/v1/simulation-runs/{run_id}/analysis/")
        assert analysis_resp.status_code == status.HTTP_200_OK
        assert analysis_resp.data["status"] == "completed"

    def test_scenario_duplicate_and_multi_run_comparison_fr020(
        self, authenticated_client, another_authenticated_client, organization, user
    ):
        biz, scenario = self._create_idea_business_and_scenario(organization, user)
        run1 = authenticated_client.post(
            reverse("simulation-run-list"), {"scenario_id": str(scenario.id)}, format="json"
        ).data

        # Duplicate scenario and double demand shock (+10%)
        dup_resp = authenticated_client.post(reverse("scenario-duplicate", args=[str(scenario.id)]))
        assert dup_resp.status_code == status.HTTP_201_CREATED
        scen2_id = dup_resp.data["id"]
        authenticated_client.post(
            f"/api/v1/scenarios/{scen2_id}/parameters/",
            {"key": "demand_change_pct", "value_numeric": "10", "unit": "%"},
            format="json",
        )
        run2 = authenticated_client.post(
            reverse("simulation-run-list"), {"scenario_id": scen2_id}, format="json"
        ).data

        # Compare Run 1 vs Run 2
        cmp_resp = authenticated_client.post(
            reverse("simulation-run-compare", args=[run1["id"]]),
            {"compare_with_run_id": run2["id"]},
            format="json",
        )
        assert cmp_resp.status_code == status.HTTP_200_OK
        assert cmp_resp.data["mode"] == "runs"
        sales_diff = next(
            d for d in cmp_resp.data["metric_diffs"] if d["metric_key"] == "gross_sales"
        )
        assert Decimal(sales_diff["delta"]) > 0

        # Cross-tenant user cannot compare with Org A's run
        other_cmp = another_authenticated_client.post(
            reverse("simulation-run-compare", args=[run1["id"]]),
            {"compare_with_run_id": run2["id"]},
            format="json",
        )
        assert other_cmp.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]

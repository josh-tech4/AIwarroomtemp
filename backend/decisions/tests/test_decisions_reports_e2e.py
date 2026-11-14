"""End-to-end tests covering Decisions, ActionItems, Reports, Audit, and full workflow."""

from decimal import Decimal

import pytest
from django.core.management import call_command
from django.urls import reverse
from rest_framework import status

from audit.models import AuditEvent
from decisions.models import Decision


@pytest.mark.django_db
class TestDecisionsReportsAndEndToEnd:
    def test_full_end_to_end_workflow(self, api_client):
        # 1. Register user
        reg = api_client.post(
            reverse("auth-register"),
            {
                "email": "e2e_founder@example.com",
                "full_name": "E2E Founder",
                "password": "StrongPassword123!",
                "password_confirm": "StrongPassword123!",
            },
            format="json",
        )
        assert reg.status_code == status.HTTP_201_CREATED
        token = reg.data["tokens"]["access"]
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        # 2. Create workspace organization
        org_resp = api_client.post(
            reverse("organization-list"),
            {"name": "E2E Grocery Labs"},
            format="json",
        )
        assert org_resp.status_code == status.HTTP_201_CREATED
        org_id = org_resp.data["id"]

        # 3. Create business profile
        biz_resp = api_client.post(
            reverse("business-list"),
            {
                "organization": org_id,
                "name": "FreshBasket India",
                "stage": "operating",
                "industry": "online_grocery",
                "location": "Mumbai",
                "currency": "INR",
                "description": "Same-day online grocery delivery.",
            },
            format="json",
        )
        assert biz_resp.status_code == status.HTTP_201_CREATED
        biz_id = biz_resp.data["id"]

        # 4. Enter assumptions
        for k, v, u, atype in [
            ("daily_orders", "2400", "orders/day", "demand"),
            ("avg_order_value", "500", "INR/order", "pricing"),
            ("orders_per_month", "72000", "orders/month", "demand"),
            ("variable_cost_per_order", "350", "INR/order", "cost"),
            ("fixed_monthly_costs", "500000", "INR/month", "cost"),
            ("marketing_spend", "200000", "INR/month", "cost"),
        ]:
            ar = api_client.post(
                f"/api/v1/businesses/{biz_id}/assumptions/",
                {
                    "key": k,
                    "value_numeric": v,
                    "unit": u,
                    "assumption_type": atype,
                    "source_type": "user_input",
                },
                format="json",
            )
            assert ar.status_code == status.HTTP_201_CREATED

        # 5. Add components and dependency
        c1 = api_client.post(
            f"/api/v1/businesses/{biz_id}/components/",
            {"name": "Checkout", "component_type": "website", "criticality": "critical"},
            format="json",
        ).data["id"]
        c2 = api_client.post(
            f"/api/v1/businesses/{biz_id}/components/",
            {
                "name": "Primary Gateway",
                "component_type": "payment_gateway",
                "criticality": "critical",
            },
            format="json",
        ).data["id"]
        dep_resp = api_client.post(
            f"/api/v1/businesses/{biz_id}/dependencies/",
            {"source_component": c1, "target_component": c2, "relationship_type": "depends_on"},
            format="json",
        )
        assert dep_resp.status_code == status.HTTP_201_CREATED

        # 6. Configure resilience scenario
        tpl_resp = api_client.get(reverse("scenario-template-list"))
        res_tpl = next(t for t in tpl_resp.data["results"] if t["key"] == "payment_gateway_outage")
        scen_resp = api_client.post(
            reverse("scenario-list"),
            {
                "business": biz_id,
                "template": res_tpl["id"],
                "module": "resilience",
                "name": "3-Hour Peak Gateway Outage",
            },
            format="json",
        )
        assert scen_resp.status_code == status.HTTP_201_CREATED
        scen_id = scen_resp.data["id"]
        api_client.post(
            f"/api/v1/scenarios/{scen_id}/parameters/",
            {"key": "outage_duration_hours", "value_numeric": "3", "unit": "hours"},
            format="json",
        )

        # 7. Run simulation
        run_resp = api_client.post(
            reverse("simulation-run-list"),
            {"scenario_id": scen_id},
            format="json",
        )
        assert run_resp.status_code == status.HTTP_202_ACCEPTED
        run_id = run_resp.data["id"]

        # 8. Compare strategies
        comp_resp = api_client.get(reverse("simulation-run-strategies", args=[run_id]))
        assert comp_resp.status_code == status.HTTP_200_OK
        assert len(comp_resp.data["strategies"]) == 3
        top_strategy = comp_resp.data["strategies"][0]["strategy_key"]

        # 9. Request AI analysis
        ai_resp = api_client.post(
            reverse("ai-analyze"),
            {"run_id": run_id},
            format="json",
        )
        assert ai_resp.status_code == status.HTTP_202_ACCEPTED
        assert ai_resp.data["status"] == "completed"

        # 10. Save & approve decision + add action item
        dec_resp = api_client.post(
            reverse("decision-list"),
            {
                "business": biz_id,
                "run": run_id,
                "title": "Enable automated secondary gateway failover",
                "selected_strategy_key": top_strategy,
                "rationale": "Reduces unrecovered orders without high customer abandonment.",
            },
            format="json",
        )
        assert dec_resp.status_code == status.HTTP_201_CREATED
        dec_id = dec_resp.data["id"]

        act_resp = api_client.post(
            f"/api/v1/decisions/{dec_id}/actions/",
            {"title": "Configure Cashfree failover routing", "owner_name": "Payments Lead"},
            format="json",
        )
        assert act_resp.status_code == status.HTTP_201_CREATED

        approve_resp = api_client.post(reverse("decision-approve", args=[dec_id]))
        assert approve_resp.status_code == status.HTTP_200_OK
        assert approve_resp.data["status"] == Decision.Status.APPROVED

        # 11. Generate report
        rep_resp = api_client.post(
            reverse("report-list"),
            {
                "business": biz_id,
                "run": run_id,
                "title": "Payment Gateway Outage Executive Brief",
                "report_type": "resilience_assessment",
            },
            format="json",
        )
        assert rep_resp.status_code == status.HTTP_201_CREATED
        content = rep_resp.data["content"]
        assert content["run"]["id"] == run_id
        assert content["ai_analysis"] is not None
        assert len(content["decisions"]) == 1
        assert len(content["decisions"][0]["actions"]) == 1
        assert AuditEvent.objects.filter(organization_id=org_id).count() >= 3

        # 12. CSV export endpoint works cleanly
        csv_resp = api_client.get(reverse("report-export-csv", args=[rep_resp.data["id"]]))
        assert csv_resp.status_code == status.HTTP_200_OK
        assert "text/csv" in csv_resp["Content-Type"]
        assert "FreshBasket India" in csv_resp.content.decode("utf-8")

    def test_seed_demo_command_is_idempotent(self):
        call_command("seed_demo")
        call_command("seed_demo")
        from businesses.models import BusinessProfile

        assert BusinessProfile.objects.filter(is_demo=True).count() == 1
        assert Decimal("550") > 0

    def test_spec_section_14_aliases_upserts_and_openapi(self, api_client):
        # Verify OpenAPI schema & Swagger UI endpoints
        schema_resp = api_client.get("/api/schema/")
        assert schema_resp.status_code == status.HTTP_200_OK
        docs_resp = api_client.get("/api/docs/")
        assert docs_resp.status_code == status.HTTP_200_OK

        # Seed demo and log in via /api/v1/auth/token/
        call_command("seed_demo")
        tok_resp = api_client.post(
            "/api/v1/auth/token/",
            {"email": "demo@aiwarroom.local", "password": "DemoPass123!"},
            format="json",
        )
        assert tok_resp.status_code == status.HTTP_200_OK
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tok_resp.data['access']}")

        # /api/v1/users/me/ and /api/v1/scenario-templates/
        me_resp = api_client.get("/api/v1/users/me/")
        assert me_resp.status_code == status.HTTP_200_OK
        assert me_resp.data["email"] == "demo@aiwarroom.local"

        tpl_resp = api_client.get("/api/v1/scenario-templates/")
        assert tpl_resp.status_code == status.HTTP_200_OK
        assert tpl_resp.data["count"] >= 2

        biz_id = api_client.get("/api/v1/businesses/").data["results"][0]["id"]

        # Upsert existing assumption key without 400/500 unique collision
        upsert_a = api_client.post(
            f"/api/v1/businesses/{biz_id}/assumptions/",
            {
                "key": "avg_order_value",
                "value_numeric": "625.0000",
                "unit": "INR/order",
                "assumption_type": "pricing",
                "source_type": "user_input",
            },
            format="json",
        )
        assert upsert_a.status_code == status.HTTP_201_CREATED
        assert Decimal(upsert_a.data["value_numeric"]) == Decimal("625.0000")

        # Upsert metric
        m1 = api_client.post(
            f"/api/v1/businesses/{biz_id}/metrics/",
            {"key": "repeat_rate", "value_numeric": "0.35", "unit": "ratio"},
            format="json",
        )
        assert m1.status_code == status.HTTP_201_CREATED
        m2 = api_client.post(
            f"/api/v1/businesses/{biz_id}/metrics/",
            {"key": "repeat_rate", "value_numeric": "0.42", "unit": "ratio"},
            format="json",
        )
        assert m2.status_code == status.HTTP_201_CREATED
        assert Decimal(m2.data["value_numeric"]) == Decimal("0.4200")

        # /api/v1/businesses/{id}/scenarios/ and /api/v1/scenarios/{id}/runs/
        scen_list = api_client.get(f"/api/v1/businesses/{biz_id}/scenarios/")
        assert scen_list.status_code == status.HTTP_200_OK
        scen_id = scen_list.data["results"][0]["id"]

        run_resp = api_client.post(
            f"/api/v1/scenarios/{scen_id}/runs/",
            {},
            format="json",
        )
        assert run_resp.status_code == status.HTTP_202_ACCEPTED
        run_id = run_resp.data["id"]

        # /api/v1/simulation-runs/{id}/compare/, /analyze/, /analysis/
        cmp_resp = api_client.post(f"/api/v1/simulation-runs/{run_id}/compare/", {}, format="json")
        assert cmp_resp.status_code == status.HTTP_200_OK

        an_post = api_client.post(f"/api/v1/simulation-runs/{run_id}/analyze/", {}, format="json")
        assert an_post.status_code == status.HTTP_202_ACCEPTED

        an_get = api_client.get(f"/api/v1/simulation-runs/{run_id}/analysis/")
        assert an_get.status_code == status.HTTP_200_OK
        assert an_get.data["status"] == "completed"

        # Celery task wrappers call shared service layer cleanly
        from ai_analyst.tasks import analyze_simulation_run_task
        from simulation.tasks import execute_simulation_run_task

        task_run_id = execute_simulation_run_task(scen_id)
        task_an_id = analyze_simulation_run_task(task_run_id)
        assert task_run_id and task_an_id

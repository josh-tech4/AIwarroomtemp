"""Tests for scenarios app."""

from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework import status

from businesses.tests.factories import BusinessProfileFactory
from scenarios.models import Scenario


@pytest.mark.django_db
class TestScenarioAPI:
    def test_templates_auto_seeded_and_listed(self, authenticated_client):
        resp = authenticated_client.get(reverse("scenario-template-list"))
        assert resp.status_code == status.HTTP_200_OK
        keys = {t["key"] for t in resp.data["results"]}
        assert "business_idea_stress_test" in keys
        assert "payment_gateway_outage" in keys

    def test_create_scenario_and_parameter_override(self, authenticated_client, organization, user):
        biz = BusinessProfileFactory(organization=organization, created_by=user)
        tpl_resp = authenticated_client.get(reverse("scenario-template-list"))
        tpl_id = tpl_resp.data["results"][0]["id"]
        tpl_module = tpl_resp.data["results"][0]["module"]

        resp = authenticated_client.post(
            reverse("scenario-list"),
            {
                "business": str(biz.id),
                "template": tpl_id,
                "module": tpl_module,
                "name": "Test Scenario",
            },
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED
        scenario_id = resp.data["id"]

        param_url = f"/api/v1/scenarios/{scenario_id}/parameters/"
        p_resp = authenticated_client.post(
            param_url,
            {
                "key": "demand_change_pct",
                "value_numeric": "-25.0000",
                "unit": "%",
                "override_type": "percentage",
            },
            format="json",
        )
        assert p_resp.status_code == status.HTTP_201_CREATED
        assert Decimal(p_resp.data["value_numeric"]) == Decimal("-25.0000")
        assert Scenario.objects.filter(id=scenario_id).exists()

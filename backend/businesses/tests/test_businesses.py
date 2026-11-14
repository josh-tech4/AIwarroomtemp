"""Tests for businesses app — CRUD, constraints, dependencies, and tenant isolation."""

from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse
from rest_framework import status

from accounts.tests.factories import UserFactory
from businesses.models import BusinessAssumption, BusinessComponent, BusinessProfile, Dependency
from organizations.models import OrganizationMember
from organizations.tests.factories import OrganizationMemberFactory

from .factories import (
    BusinessAssumptionFactory,
    BusinessComponentFactory,
    BusinessProfileFactory,
)


@pytest.mark.django_db
class TestBusinessProfileAPI:
    def test_create_business_profile(self, authenticated_client, organization):
        response = authenticated_client.post(
            reverse("business-list"),
            {
                "organization": str(organization.id),
                "name": "FreshCart Grocery",
                "stage": "idea",
                "industry": "online_grocery",
                "location": "Bengaluru",
                "currency": "INR",
                "description": "30-minute grocery delivery.",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "FreshCart Grocery"
        assert response.data["currency"] == "INR"

    def test_cannot_create_business_in_other_org(self, authenticated_client, another_organization):
        response = authenticated_client.post(
            reverse("business-list"),
            {
                "organization": str(another_organization.id),
                "name": "Hijacked Business",
                "stage": "idea",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_viewer_cannot_create_business(self, organization):
        from organizations.tests.test_orgs import get_authenticated_client

        viewer = UserFactory()
        OrganizationMemberFactory(
            organization=organization, user=viewer, role=OrganizationMember.Role.VIEWER
        )
        client = get_authenticated_client(viewer)
        response = client.post(
            reverse("business-list"),
            {"organization": str(organization.id), "name": "Viewer Biz"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_archive_and_restore_business(self, authenticated_client, organization, user):
        biz = BusinessProfileFactory(organization=organization, created_by=user)
        resp = authenticated_client.post(reverse("business-archive", args=[str(biz.id)]))
        assert resp.status_code == status.HTTP_200_OK
        biz.refresh_from_db()
        assert biz.status == BusinessProfile.Status.ARCHIVED

        resp2 = authenticated_client.post(reverse("business-restore", args=[str(biz.id)]))
        assert resp2.status_code == status.HTTP_200_OK
        biz.refresh_from_db()
        assert biz.status == BusinessProfile.Status.ACTIVE


@pytest.mark.django_db
class TestBusinessTenantIsolation:
    def test_org_a_cannot_read_or_modify_org_b_business(
        self, authenticated_client, another_organization, another_user
    ):
        biz_b = BusinessProfileFactory(organization=another_organization, created_by=another_user)
        resp = authenticated_client.get(reverse("business-detail", args=[str(biz_b.id)]))
        assert resp.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]

        resp_patch = authenticated_client.patch(
            reverse("business-detail", args=[str(biz_b.id)]),
            {"name": "Pwned"},
            format="json",
        )
        assert resp_patch.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]

    def test_org_a_cannot_access_org_b_assumptions(
        self, authenticated_client, another_organization, another_user
    ):
        biz_b = BusinessProfileFactory(organization=another_organization, created_by=another_user)
        BusinessAssumptionFactory(business=biz_b, key="avg_order_value")

        url = f"/api/v1/businesses/{biz_b.id}/assumptions/"
        resp = authenticated_client.get(url)
        assert resp.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestAssumptionsAndDependencies:
    def test_create_assumption_with_provenance(self, authenticated_client, organization, user):
        biz = BusinessProfileFactory(organization=organization, created_by=user)
        url = f"/api/v1/businesses/{biz.id}/assumptions/"
        resp = authenticated_client.post(
            url,
            {
                "key": "average_order_value",
                "label": "Average Order Value",
                "value_numeric": "500.0000",
                "unit": "INR/order",
                "assumption_type": "pricing",
                "source_type": "user_input",
                "confidence": "medium",
            },
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED
        assert Decimal(resp.data["value_numeric"]) == Decimal("500.0000")
        assert BusinessAssumption.objects.filter(business=biz, key="average_order_value").exists()

    def test_dependency_self_loop_rejected_by_db_and_api(
        self, authenticated_client, organization, user
    ):
        biz = BusinessProfileFactory(organization=organization, created_by=user)
        comp = BusinessComponentFactory(business=biz, name="Checkout")

        with pytest.raises(IntegrityError), transaction.atomic():
            Dependency.objects.create(business=biz, source_component=comp, target_component=comp)

        url = f"/api/v1/businesses/{biz.id}/dependencies/"
        resp = authenticated_client.post(
            url,
            {
                "source_component": str(comp.id),
                "target_component": str(comp.id),
                "relationship_type": "depends_on",
            },
            format="json",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_dependency_cycle_rejected(self, authenticated_client, organization, user):
        biz = BusinessProfileFactory(organization=organization, created_by=user)
        a = BusinessComponentFactory(business=biz, name="Checkout", component_type="website")
        b = BusinessComponentFactory(
            business=biz, name="Razorpay", component_type="payment_gateway"
        )

        url = f"/api/v1/businesses/{biz.id}/dependencies/"
        r1 = authenticated_client.post(
            url,
            {"source_component": str(a.id), "target_component": str(b.id)},
            format="json",
        )
        assert r1.status_code == status.HTTP_201_CREATED

        r2 = authenticated_client.post(
            url,
            {"source_component": str(b.id), "target_component": str(a.id)},
            format="json",
        )
        assert r2.status_code == status.HTTP_400_BAD_REQUEST
        assert BusinessComponent.objects.filter(business=biz).count() == 2

    def test_duplicate_business_clones_model_and_dependencies(
        self, authenticated_client, organization, user
    ):
        biz = BusinessProfileFactory(organization=organization, created_by=user, name="OriginalCo")
        BusinessAssumptionFactory(business=biz, key="orders_per_month", value_numeric="1200.0000")
        c1 = BusinessComponentFactory(business=biz, name="Web", component_type="website")
        c2 = BusinessComponentFactory(business=biz, name="PG", component_type="payment_gateway")
        authenticated_client.post(
            f"/api/v1/businesses/{biz.id}/dependencies/",
            {"source_component": str(c1.id), "target_component": str(c2.id)},
            format="json",
        )

        dup_resp = authenticated_client.post(reverse("business-duplicate", args=[str(biz.id)]))
        assert dup_resp.status_code == status.HTTP_201_CREATED
        assert dup_resp.data["name"] == "OriginalCo (Copy)"
        assert dup_resp.data["assumptions_count"] == 1
        assert dup_resp.data["components_count"] == 2
        dup_id = dup_resp.data["id"]
        deps = authenticated_client.get(f"/api/v1/businesses/{dup_id}/dependencies/")
        assert len(deps.data["results"]) == 1

    def test_extract_draft_and_business_readiness_checks(
        self, authenticated_client, organization, user
    ):
        # Draft extractor parses plain-language business idea without mutating DB
        count_before = BusinessProfile.objects.count()
        draft_resp = authenticated_client.post(
            reverse("business-extract-draft"),
            {
                "description": (
                    "Launch a specialty online grocery delivery service in Mumbai targeting "
                    "2500 orders per month at AOV ₹600 with 12 lakh starting capital."
                ),
                "currency": "INR",
            },
            format="json",
        )
        assert draft_resp.status_code == status.HTTP_200_OK
        assert BusinessProfile.objects.count() == count_before
        assert draft_resp.data["industry"] == "online_grocery"
        assump_map = {a["key"]: a for a in draft_resp.data["suggested_assumptions"]}
        assert assump_map["orders_per_month"]["value_numeric"] == "2500"
        assert assump_map["avg_order_value"]["value_numeric"] == "600"
        assert assump_map["initial_capital"]["value_numeric"] == "1200000"

        # Readiness flags suspicious unit margin (variable_cost >= aov)
        biz = BusinessProfileFactory(organization=organization, created_by=user)
        BusinessAssumptionFactory(business=biz, key="avg_order_value", value_numeric="400.0000")
        BusinessAssumptionFactory(
            business=biz, key="variable_cost_per_order", value_numeric="450.0000"
        )
        ready_resp = authenticated_client.get(reverse("business-readiness", args=[str(biz.id)]))
        assert ready_resp.status_code == status.HTTP_200_OK
        assert ready_resp.data["idea_ready"] is False
        assert any("Suspicious unit economics" in w for w in ready_resp.data["warnings"])

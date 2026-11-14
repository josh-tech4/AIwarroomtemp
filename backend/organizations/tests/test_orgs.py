"""Tests for organizations app — CRUD, roles, and tenant isolation."""

import pytest
from django.db import IntegrityError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.tests.factories import UserFactory
from organizations.models import OrganizationMember

from .factories import OrganizationMemberFactory


def get_authenticated_client(user):
    client = APIClient()
    response = client.post(
        reverse("auth-login"),
        {"email": user.email, "password": "testpassword123"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    return client


@pytest.mark.django_db
class TestOrganizationCRUD:
    def test_create_organization_makes_creator_owner(self, authenticated_client, user):
        response = authenticated_client.post(
            reverse("organization-list"),
            {"name": "My Startup", "description": "Test org"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        org_id = response.data["id"]

        member = OrganizationMember.objects.get(organization_id=org_id, user=user)
        assert member.role == OrganizationMember.Role.OWNER

    def test_list_returns_only_own_orgs(
        self, authenticated_client, organization, another_organization
    ):
        response = authenticated_client.get(reverse("organization-list"))
        assert response.status_code == status.HTTP_200_OK
        org_ids = [o["id"] for o in response.data["results"]]
        assert str(organization.id) in org_ids
        assert str(another_organization.id) not in org_ids

    def test_unique_membership_constraint(self, organization, user):
        with pytest.raises(IntegrityError):
            OrganizationMember.objects.create(
                organization=organization,
                user=user,
                role=OrganizationMember.Role.VIEWER,
            )


@pytest.mark.django_db
class TestTenantIsolation:
    """SECURITY: Prove Org A cannot access Org B's resources."""

    def test_org_a_cannot_access_org_b_detail(self, authenticated_client, another_organization):
        response = authenticated_client.get(
            reverse("organization-detail", args=[str(another_organization.id)])
        )
        assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]

    def test_org_a_cannot_see_org_b_members(self, authenticated_client, another_organization):
        url = f"/api/v1/organizations/{another_organization.id}/members/"
        response = authenticated_client.get(url)
        assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]

    def test_non_admin_cannot_invite_members(self, organization):
        analyst = UserFactory()
        new_user = UserFactory()
        OrganizationMemberFactory(
            organization=organization, user=analyst, role=OrganizationMember.Role.ANALYST
        )

        client = get_authenticated_client(analyst)
        url = f"/api/v1/organizations/{organization.id}/members/invite/"
        response = client.post(url, {"email": new_user.email, "role": "viewer"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_owner_can_invite_and_remove_member(self, authenticated_client, organization):
        new_user = UserFactory()
        url = f"/api/v1/organizations/{organization.id}/members/invite/"
        response = authenticated_client.post(
            url, {"email": new_user.email, "role": "analyst"}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        member_id = response.data["id"]

        delete_url = f"/api/v1/organizations/{organization.id}/members/{member_id}/"
        del_resp = authenticated_client.delete(delete_url)
        assert del_resp.status_code == status.HTTP_204_NO_CONTENT

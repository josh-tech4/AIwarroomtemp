"""
Pytest configuration for AI WarRoom backend.

Shared fixtures available to all test modules.
"""

import pytest
from rest_framework.test import APIClient

from accounts.tests.factories import UserFactory
from organizations.models import OrganizationMember
from organizations.tests.factories import OrganizationFactory, OrganizationMemberFactory


@pytest.fixture
def api_client():
    """Unauthenticated API client."""
    return APIClient()


@pytest.fixture
def user(db):
    """A regular active user."""
    return UserFactory()


@pytest.fixture
def another_user(db):
    """A second user (different org, for isolation tests)."""
    return UserFactory()


@pytest.fixture
def organization(db, user):
    """An organization with `user` as the owner."""
    org = OrganizationFactory(created_by=user)
    OrganizationMemberFactory(
        organization=org,
        user=user,
        role=OrganizationMember.Role.OWNER,
    )
    return org


@pytest.fixture
def another_organization(db, another_user):
    """A completely separate organization (tenant isolation tests)."""
    org = OrganizationFactory(created_by=another_user)
    OrganizationMemberFactory(
        organization=org,
        user=another_user,
        role=OrganizationMember.Role.OWNER,
    )
    return org


@pytest.fixture
def authenticated_client(db, user):
    """API client authenticated as `user`, with JWT access token."""
    from django.urls import reverse

    client = APIClient()
    response = client.post(
        reverse("auth-login"),
        {"email": user.email, "password": "testpassword123"},
        format="json",
    )
    assert response.status_code == 200, f"Login failed: {response.data}"
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    return client


@pytest.fixture
def another_authenticated_client(db, another_user):
    """API client authenticated as `another_user`."""
    from django.urls import reverse

    client = APIClient()
    response = client.post(
        reverse("auth-login"),
        {"email": another_user.email, "password": "testpassword123"},
        format="json",
    )
    assert response.status_code == 200
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    return client

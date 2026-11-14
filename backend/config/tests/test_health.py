"""Health check endpoint tests."""

import pytest
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
def test_health_check_returns_ok(api_client):
    response = api_client.get(reverse("health-check"))
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] == "ok"
    assert data["components"]["database"] == "ok"
    assert data["components"]["api"] == "ok"

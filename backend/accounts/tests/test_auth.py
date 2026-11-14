"""Tests for accounts app — authentication and profile."""

import pytest
from django.urls import reverse
from rest_framework import status

from .factories import UserFactory


@pytest.mark.django_db
class TestRegistration:
    def test_register_new_user_success(self, api_client):
        response = api_client.post(
            reverse("auth-register"),
            {
                "email": "newuser@example.com",
                "full_name": "New User",
                "password": "StrongPass123!",
                "password_confirm": "StrongPass123!",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert "tokens" in response.data
        assert "access" in response.data["tokens"]
        assert "refresh" in response.data["tokens"]
        assert response.data["user"]["email"] == "newuser@example.com"

    def test_register_duplicate_email_fails(self, api_client, user):
        response = api_client.post(
            reverse("auth-register"),
            {
                "email": user.email,
                "password": "StrongPass123!",
                "password_confirm": "StrongPass123!",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_register_password_mismatch_fails(self, api_client):
        response = api_client.post(
            reverse("auth-register"),
            {
                "email": "mismatch@example.com",
                "password": "StrongPass123!",
                "password_confirm": "DifferentPass!",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_register_weak_password_fails(self, api_client):
        response = api_client.post(
            reverse("auth-register"),
            {
                "email": "weak@example.com",
                "password": "123",
                "password_confirm": "123",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestLoginLogout:
    def test_login_success_returns_tokens(self, api_client, user):
        response = api_client.post(
            reverse("auth-login"),
            {"email": user.email, "password": "testpassword123"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
        assert "refresh" in response.data

    def test_login_wrong_password_fails(self, api_client, user):
        response = api_client.post(
            reverse("auth-login"),
            {"email": user.email, "password": "wrongpassword"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_nonexistent_user_fails(self, api_client):
        response = api_client.post(
            reverse("auth-login"),
            {"email": "ghost@example.com", "password": "anypassword"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_logout_authenticated_user(self, authenticated_client):
        response = authenticated_client.post(reverse("auth-logout"), {}, format="json")
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestProfile:
    def test_me_returns_current_user(self, authenticated_client, user):
        response = authenticated_client.get(reverse("auth-me"))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["email"] == user.email

    def test_me_unauthenticated_fails(self, api_client):
        response = api_client.get(reverse("auth-me"))
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_me_update_full_name(self, authenticated_client):
        response = authenticated_client.patch(
            reverse("auth-me"),
            {"full_name": "Updated Name"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["full_name"] == "Updated Name"

    def test_change_password(self, authenticated_client, user):
        response = authenticated_client.put(
            reverse("auth-change-password"),
            {
                "current_password": "testpassword123",
                "new_password": "NewStrongPassword99!",
                "new_password_confirm": "NewStrongPassword99!",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.check_password("NewStrongPassword99!")
        assert UserFactory._meta.model.objects.filter(id=user.id).exists()

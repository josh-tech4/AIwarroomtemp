"""URL patterns for accounts app."""

from django.urls import path

from . import views

urlpatterns = [
    path("register/", views.RegisterView.as_view(), name="auth-register"),
    path("login/", views.RateLimitedLoginView.as_view(), name="auth-login"),
    path("token/", views.RateLimitedLoginView.as_view(), name="auth-token"),
    path("logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("token/refresh/", views.RateLimitedTokenRefreshView.as_view(), name="auth-token-refresh"),
    path("me/", views.MeView.as_view(), name="auth-me"),
    path("me/change-password/", views.ChangePasswordView.as_view(), name="auth-change-password"),
]

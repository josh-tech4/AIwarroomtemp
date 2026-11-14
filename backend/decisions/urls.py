"""URL patterns for decisions app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"", views.DecisionViewSet, basename="decision")

action_router = DefaultRouter()
action_router.register(r"actions", views.ActionItemViewSet, basename="decision-action")

urlpatterns = [
    path("", include(router.urls)),
    path("<uuid:decision_pk>/", include(action_router.urls)),
]

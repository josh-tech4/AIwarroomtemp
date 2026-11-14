"""URL patterns for simulation app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"runs", views.SimulationRunViewSet, basename="simulation-run")

urlpatterns = [
    path("", include(router.urls)),
]

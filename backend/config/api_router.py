"""Central API router for AI WarRoom v1."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from accounts.views import MeView
from scenarios.views import ScenarioTemplateViewSet
from simulation.views import SimulationRunViewSet

runs_router = DefaultRouter()
runs_router.register(r"", SimulationRunViewSet, basename="simulation-runs-alias")

templates_router = DefaultRouter()
templates_router.register(r"", ScenarioTemplateViewSet, basename="scenario-templates-alias")

urlpatterns = [
    path("auth/", include("accounts.urls")),
    path("users/me/", MeView.as_view(), name="users-me"),
    path("organizations/", include("organizations.urls")),
    path("businesses/", include("businesses.urls")),
    path("scenario-templates/", include(templates_router.urls)),
    path("scenarios/", include("scenarios.urls")),
    path("simulation/", include("simulation.urls")),
    path("simulation-runs/", include(runs_router.urls)),
    path("ai-analyst/", include("ai_analyst.urls")),
    path("decisions/", include("decisions.urls")),
    path("reports/", include("reports.urls")),
    path("audit/", include("audit.urls")),
]

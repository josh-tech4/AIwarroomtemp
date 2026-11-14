"""URL patterns for scenarios app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from simulation.views import ScenarioRunCreateView

from . import views

router = DefaultRouter()
router.register(r"templates", views.ScenarioTemplateViewSet, basename="scenario-template")
router.register(r"", views.ScenarioViewSet, basename="scenario")

param_router = DefaultRouter()
param_router.register(r"parameters", views.ScenarioParameterViewSet, basename="scenario-parameter")

urlpatterns = [
    path("", include(router.urls)),
    path("<uuid:scenario_pk>/", include(param_router.urls)),
    path("<uuid:scenario_pk>/runs/", ScenarioRunCreateView.as_view(), name="scenario-run-create"),
]

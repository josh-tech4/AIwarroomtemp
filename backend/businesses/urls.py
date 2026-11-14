"""URL patterns for businesses app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from scenarios.views import ScenarioViewSet

from . import views

router = DefaultRouter()
router.register(r"", views.BusinessProfileViewSet, basename="business")

nested_router = DefaultRouter()
nested_router.register(r"metrics", views.BusinessMetricViewSet, basename="business-metric")
nested_router.register(
    r"assumptions", views.BusinessAssumptionViewSet, basename="business-assumption"
)
nested_router.register(r"components", views.BusinessComponentViewSet, basename="business-component")
nested_router.register(r"dependencies", views.DependencyViewSet, basename="business-dependency")
nested_router.register(r"scenarios", ScenarioViewSet, basename="business-scenario")

urlpatterns = [
    path("", include(router.urls)),
    path("<uuid:business_pk>/", include(nested_router.urls)),
]

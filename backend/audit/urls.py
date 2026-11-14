"""URL patterns for audit app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"events", views.AuditEventViewSet, basename="audit-event")

urlpatterns = [
    path("", include(router.urls)),
]

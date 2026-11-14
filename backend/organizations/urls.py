"""URL patterns for organizations app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"", views.OrganizationViewSet, basename="organization")

member_router = DefaultRouter()
member_router.register(r"members", views.OrganizationMemberViewSet, basename="organization-member")

urlpatterns = [
    path("", include(router.urls)),
    path("<uuid:org_pk>/", include(member_router.urls)),
]

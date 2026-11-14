"""Views for businesses app — strictly organization-scoped."""

from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from organizations.permissions import IsOrganizationWriter, get_user_membership

from .draft_extractor import extract_business_draft
from .models import (
    BusinessAssumption,
    BusinessComponent,
    BusinessMetric,
    BusinessProfile,
    Dependency,
)
from .serializers import (
    BusinessAssumptionSerializer,
    BusinessComponentSerializer,
    BusinessMetricSerializer,
    BusinessProfileSerializer,
    DependencySerializer,
)
from .services import (
    archive_business,
    compute_business_readiness,
    duplicate_business,
    restore_business,
)


class BusinessProfileViewSet(ModelViewSet):
    """CRUD and archive endpoints for BusinessProfile."""

    queryset = BusinessProfile.objects.none()
    serializer_class = BusinessProfileSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizationWriter]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return BusinessProfile.objects.none()
        qs = BusinessProfile.objects.filter(
            organization__members__user=self.request.user
        ).select_related("organization", "created_by")

        org_id = self.request.query_params.get("organization")
        if org_id:
            qs = qs.filter(organization_id=org_id)

        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        return qs.distinct()

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        business = self.get_object()
        archive_business(business)
        return Response(BusinessProfileSerializer(business).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        business = self.get_object()
        restore_business(business)
        return Response(BusinessProfileSerializer(business).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """UC-11: Duplicate a business model with its assumptions, components, and dependencies."""
        business = self.get_object()
        cloned = duplicate_business(business, request.user)
        return Response(BusinessProfileSerializer(cloned).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def readiness(self, request, pk=None):
        """Spec §5.2 Step 4: Validate required inputs, units, and structural completeness."""
        business = self.get_object()
        return Response(compute_business_readiness(business), status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="extract-draft")
    def extract_draft(self, request):
        """Spec §5.2 Step 2: AI-assisted draft extraction from plain-language description."""
        description = (request.data.get("description") or "").strip()
        currency = (request.data.get("currency") or "INR").upper()[:3] or "INR"
        if len(description) < 10:
            return Response(
                {
                    "error": {
                        "code": "description_too_short",
                        "message": "Provide at least 10 characters describing the business idea.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        draft = extract_business_draft(description=description, currency=currency)
        return Response(draft, status=status.HTTP_200_OK)


class BaseBusinessNestedViewSet(ModelViewSet):
    """Base viewset enforcing organization membership for nested business resources."""

    permission_classes = [permissions.IsAuthenticated]

    def get_business(self, require_write: bool = False) -> BusinessProfile:
        business_id = self.kwargs["business_pk"]
        try:
            business = BusinessProfile.objects.select_related("organization").get(id=business_id)
        except BusinessProfile.DoesNotExist as exc:
            raise NotFound("Business profile not found.") from exc

        membership = get_user_membership(self.request.user, business.organization)
        if membership is None:
            raise PermissionDenied("You do not have access to this business.")
        if require_write and not membership.can_write:
            raise PermissionDenied("You do not have write access in this organization.")
        return business

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if "business_pk" in self.kwargs:
            context["business"] = self.get_business(
                require_write=self.request.method not in permissions.SAFE_METHODS
            )
        return context

    def perform_create(self, serializer):
        business = self.get_business(require_write=True)
        serializer.save(business=business)

    def perform_update(self, serializer):
        self.get_business(require_write=True)
        serializer.save()

    def perform_destroy(self, instance):
        self.get_business(require_write=True)
        instance.delete()


class BusinessMetricViewSet(BaseBusinessNestedViewSet):
    """Manage business metrics (upserts by key on create)."""

    queryset = BusinessMetric.objects.none()
    serializer_class = BusinessMetricSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return BusinessMetric.objects.none()
        business = self.get_business()
        return BusinessMetric.objects.filter(business=business)

    def perform_create(self, serializer):
        business = self.get_business(require_write=True)
        key = serializer.validated_data["key"]
        existing = BusinessMetric.objects.filter(business=business, key=key).first()
        if existing:
            for attr, value in serializer.validated_data.items():
                setattr(existing, attr, value)
            existing.save()
            serializer.instance = existing
        else:
            serializer.save(business=business)


class BusinessAssumptionViewSet(BaseBusinessNestedViewSet):
    """Manage business assumptions (upserts by key on create)."""

    queryset = BusinessAssumption.objects.none()
    serializer_class = BusinessAssumptionSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return BusinessAssumption.objects.none()
        business = self.get_business()
        return BusinessAssumption.objects.filter(business=business)

    def perform_create(self, serializer):
        business = self.get_business(require_write=True)
        key = serializer.validated_data["key"]
        existing = BusinessAssumption.objects.filter(business=business, key=key).first()
        if existing:
            for attr, value in serializer.validated_data.items():
                setattr(existing, attr, value)
            existing.save()
            serializer.instance = existing
        else:
            serializer.save(business=business)


class BusinessComponentViewSet(BaseBusinessNestedViewSet):
    """Manage business components."""

    queryset = BusinessComponent.objects.none()
    serializer_class = BusinessComponentSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return BusinessComponent.objects.none()
        business = self.get_business()
        return BusinessComponent.objects.filter(business=business)


class DependencyViewSet(BaseBusinessNestedViewSet):
    """Manage directed dependencies between components."""

    queryset = Dependency.objects.none()
    serializer_class = DependencySerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Dependency.objects.none()
        business = self.get_business()
        return Dependency.objects.filter(business=business).select_related(
            "source_component", "target_component"
        )

"""Views for decisions app."""

from __future__ import annotations

from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response

from audit.services import record_audit_event
from organizations.permissions import IsOrganizationWriter, get_user_membership

from .models import ActionItem, Decision
from .serializers import ActionItemSerializer, DecisionSerializer


class DecisionViewSet(viewsets.ModelViewSet):
    """CRUD and human approval actions for business decisions."""

    queryset = Decision.objects.none()
    serializer_class = DecisionSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizationWriter]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Decision.objects.none()
        qs = (
            Decision.objects.filter(business__organization__members__user=self.request.user)
            .select_related("business", "run", "created_by", "approved_by")
            .prefetch_related("actions")
        )
        business_id = self.request.query_params.get("business")
        if business_id:
            qs = qs.filter(business_id=business_id)
        return qs.distinct()

    def perform_create(self, serializer):
        decision = serializer.save()
        record_audit_event(
            organization=decision.business.organization,
            actor=self.request.user,
            action="decision.created",
            resource_type="decision",
            resource_id=str(decision.id),
            metadata={"title": decision.title},
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        decision = self.get_object()
        decision.status = Decision.Status.APPROVED
        decision.approved_by = request.user
        decision.approved_at = timezone.now()
        decision.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
        record_audit_event(
            organization=decision.business.organization,
            actor=request.user,
            action="decision.approved",
            resource_type="decision",
            resource_id=str(decision.id),
            metadata={"title": decision.title},
        )
        return Response(DecisionSerializer(decision).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        decision = self.get_object()
        decision.status = Decision.Status.REJECTED
        decision.approved_by = request.user
        decision.approved_at = timezone.now()
        decision.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
        return Response(DecisionSerializer(decision).data, status=status.HTTP_200_OK)


class ActionItemViewSet(viewsets.ModelViewSet):
    """Manage ActionItems nested under a Decision."""

    queryset = ActionItem.objects.none()
    serializer_class = ActionItemSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_decision(self, require_write: bool = False) -> Decision:
        decision_id = self.kwargs["decision_pk"]
        try:
            decision = Decision.objects.select_related("business__organization").get(id=decision_id)
        except Decision.DoesNotExist as exc:
            raise NotFound("Decision not found.") from exc
        membership = get_user_membership(self.request.user, decision.business.organization)
        if membership is None:
            raise PermissionDenied("You do not have access to this decision.")
        if require_write and not membership.can_write:
            raise PermissionDenied("You do not have write access in this organization.")
        return decision

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ActionItem.objects.none()
        decision = self.get_decision()
        return ActionItem.objects.filter(decision=decision).select_related("owner")

    def perform_create(self, serializer):
        decision = self.get_decision(require_write=True)
        serializer.save(decision=decision)

    def perform_update(self, serializer):
        self.get_decision(require_write=True)
        serializer.save()

    def perform_destroy(self, instance):
        self.get_decision(require_write=True)
        instance.delete()

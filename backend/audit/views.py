"""Serializers and views for audit app."""

from __future__ import annotations

from rest_framework import permissions, serializers, viewsets

from .models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True)

    class Meta:
        model = AuditEvent
        fields = [
            "id",
            "organization",
            "actor",
            "actor_email",
            "action",
            "resource_type",
            "resource_id",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class AuditEventViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only organization-scoped audit log."""

    queryset = AuditEvent.objects.none()
    serializer_class = AuditEventSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return AuditEvent.objects.none()
        return (
            AuditEvent.objects.filter(organization__members__user=self.request.user)
            .select_related("actor", "organization")
            .distinct()
        )

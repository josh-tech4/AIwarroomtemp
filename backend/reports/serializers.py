"""Serializers for reports app."""

from __future__ import annotations

from rest_framework import serializers

from businesses.models import BusinessProfile
from organizations.permissions import get_user_membership
from simulation.models import SimulationRun

from .models import Report


class ReportCreateSerializer(serializers.Serializer):
    business = serializers.UUIDField()
    run = serializers.UUIDField(required=False, allow_null=True)
    title = serializers.CharField(max_length=255)
    report_type = serializers.ChoiceField(
        choices=Report.ReportType.choices,
        default=Report.ReportType.SIMULATION_SUMMARY,
    )

    def validate_business(self, value):
        try:
            biz = BusinessProfile.objects.select_related("organization").get(id=value)
        except BusinessProfile.DoesNotExist as exc:
            raise serializers.ValidationError("Business profile not found.") from exc
        request = self.context.get("request")
        membership = get_user_membership(request.user, biz.organization)
        if membership is None or not membership.can_write:
            raise serializers.ValidationError("You do not have write access to this business.")
        return biz

    def validate(self, attrs: dict) -> dict:
        run_id = attrs.get("run")
        biz = attrs["business"]
        if run_id is not None:
            try:
                run = SimulationRun.objects.select_related("scenario").get(id=run_id, business=biz)
            except SimulationRun.DoesNotExist as exc:
                raise serializers.ValidationError(
                    {"run": "Simulation run not found for this business."}
                ) from exc
            attrs["run"] = run
        return attrs


class ReportSerializer(serializers.ModelSerializer):
    business_name = serializers.CharField(source="business.name", read_only=True)

    class Meta:
        model = Report
        fields = [
            "id",
            "business",
            "business_name",
            "run",
            "title",
            "report_type",
            "content",
            "created_by",
            "created_at",
        ]
        read_only_fields = fields

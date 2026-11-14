"""Serializers for scenarios app."""

from __future__ import annotations

from rest_framework import serializers

from businesses.models import BusinessProfile
from organizations.permissions import get_user_membership

from .models import Scenario, ScenarioParameter, ScenarioTemplate


class ScenarioTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScenarioTemplate
        fields = [
            "id",
            "key",
            "module",
            "name",
            "description",
            "engine_key",
            "version",
            "parameter_schema",
            "default_strategies",
            "is_active",
        ]


class ScenarioParameterSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScenarioParameter
        fields = [
            "id",
            "scenario",
            "key",
            "value_numeric",
            "value_text",
            "unit",
            "override_type",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "scenario", "created_at", "updated_at"]

    def validate(self, attrs: dict) -> dict:
        if attrs.get("value_numeric") is None and not attrs.get("value_text"):
            raise serializers.ValidationError(
                "Either value_numeric or value_text must be provided."
            )
        return attrs


class ScenarioStrategySummarySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    key = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()
    parameter_overrides = serializers.JSONField()


class ScenarioSerializer(serializers.ModelSerializer):
    parameters = ScenarioParameterSerializer(many=True, read_only=True)
    strategies = ScenarioStrategySummarySerializer(many=True, read_only=True)
    template_key = serializers.CharField(source="template.key", read_only=True)
    template_name = serializers.CharField(source="template.name", read_only=True)
    engine_key = serializers.CharField(source="template.engine_key", read_only=True)
    business_name = serializers.CharField(source="business.name", read_only=True)

    class Meta:
        model = Scenario
        fields = [
            "id",
            "business",
            "business_name",
            "template",
            "template_key",
            "template_name",
            "engine_key",
            "module",
            "name",
            "description",
            "status",
            "parameters",
            "strategies",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def validate_business(self, business: BusinessProfile) -> BusinessProfile:
        request = self.context.get("request")
        membership = get_user_membership(request.user, business.organization)
        if membership is None or not membership.can_write:
            raise serializers.ValidationError("You do not have write access to this business.")
        return business

    def validate(self, attrs: dict) -> dict:
        template = attrs.get("template")
        module = attrs.get("module")
        if template and module and template.module != module:
            raise serializers.ValidationError(
                {"module": f"Module must match template module ({template.module})."}
            )
        return attrs

    def create(self, validated_data: dict) -> Scenario:
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)

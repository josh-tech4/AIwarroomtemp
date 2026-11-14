"""Serializers for businesses app."""

from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from organizations.models import Organization
from organizations.permissions import get_user_membership

from .models import (
    BusinessAssumption,
    BusinessComponent,
    BusinessMetric,
    BusinessProfile,
    Dependency,
)
from .services import has_dependency_cycle, validate_dependency


class BusinessProfileSerializer(serializers.ModelSerializer):
    """Serializer for BusinessProfile with organization membership check."""

    organization_name = serializers.CharField(source="organization.name", read_only=True)
    assumptions_count = serializers.IntegerField(source="assumptions.count", read_only=True)
    components_count = serializers.IntegerField(source="components.count", read_only=True)

    class Meta:
        model = BusinessProfile
        fields = [
            "id",
            "organization",
            "organization_name",
            "name",
            "stage",
            "industry",
            "custom_industry",
            "location",
            "currency",
            "description",
            "baseline_date",
            "data_quality",
            "status",
            "is_demo",
            "assumptions_count",
            "components_count",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at", "is_demo"]

    def validate_currency(self, value: str) -> str:
        code = value.upper().strip()
        if len(code) != 3 or not code.isalpha():
            raise serializers.ValidationError("Currency must be a 3-letter ISO code (e.g. INR).")
        return code

    def validate_organization(self, org: Organization) -> Organization:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        membership = get_user_membership(request.user, org)
        if membership is None or not membership.can_write:
            raise serializers.ValidationError(
                "You do not have write permission in this organization."
            )
        return org

    def create(self, validated_data: dict) -> BusinessProfile:
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class BusinessMetricSerializer(serializers.ModelSerializer):
    """Serializer for BusinessMetric."""

    class Meta:
        model = BusinessMetric
        fields = [
            "id",
            "business",
            "key",
            "label",
            "value_numeric",
            "value_text",
            "unit",
            "category",
            "source_type",
            "source_reference",
            "confidence",
            "notes",
            "valid_from",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "business", "created_at", "updated_at"]

    def validate(self, attrs: dict) -> dict:
        if attrs.get("value_numeric") is None and not attrs.get("value_text"):
            raise serializers.ValidationError(
                "Either value_numeric or value_text must be provided."
            )
        return attrs


class BusinessAssumptionSerializer(serializers.ModelSerializer):
    """Serializer for BusinessAssumption."""

    class Meta:
        model = BusinessAssumption
        fields = [
            "id",
            "business",
            "key",
            "label",
            "value_numeric",
            "unit",
            "assumption_type",
            "source_type",
            "source_reference",
            "confidence",
            "notes",
            "valid_from",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "business", "created_at", "updated_at"]


class BusinessComponentSerializer(serializers.ModelSerializer):
    """Serializer for BusinessComponent."""

    class Meta:
        model = BusinessComponent
        fields = [
            "id",
            "business",
            "name",
            "component_type",
            "criticality",
            "description",
            "configuration",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "business", "created_at", "updated_at"]


class DependencySerializer(serializers.ModelSerializer):
    """Serializer for component dependencies with cross-business & cycle checks."""

    source_component_name = serializers.CharField(source="source_component.name", read_only=True)
    target_component_name = serializers.CharField(source="target_component.name", read_only=True)

    class Meta:
        model = Dependency
        fields = [
            "id",
            "business",
            "source_component",
            "source_component_name",
            "target_component",
            "target_component_name",
            "relationship_type",
            "criticality",
            "fallback_info",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "business", "created_at", "updated_at"]

    def validate(self, attrs: dict) -> dict:
        business = self.context["business"]
        source = attrs.get("source_component")
        target = attrs.get("target_component")
        if source and target:
            try:
                validate_dependency(business, source, target)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(str(exc)) from exc
            if has_dependency_cycle(business, source.id, target.id):
                raise serializers.ValidationError(
                    "Adding this dependency would introduce a circular dependency."
                )
        return attrs

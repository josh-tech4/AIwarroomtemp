"""Serializers for decisions app."""

from __future__ import annotations

from rest_framework import serializers

from businesses.models import BusinessProfile
from organizations.permissions import get_user_membership

from .models import ActionItem, Decision


class ActionItemSerializer(serializers.ModelSerializer):
    owner_email = serializers.EmailField(source="owner.email", read_only=True)

    class Meta:
        model = ActionItem
        fields = [
            "id",
            "decision",
            "title",
            "description",
            "owner",
            "owner_email",
            "owner_name",
            "due_date",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "decision", "created_at", "updated_at"]


class DecisionSerializer(serializers.ModelSerializer):
    actions = ActionItemSerializer(many=True, read_only=True)
    business_name = serializers.CharField(source="business.name", read_only=True)

    class Meta:
        model = Decision
        fields = [
            "id",
            "business",
            "business_name",
            "run",
            "title",
            "description",
            "selected_strategy_key",
            "rationale",
            "status",
            "approved_by",
            "approved_at",
            "actions",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "approved_by",
            "approved_at",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def validate_business(self, business: BusinessProfile) -> BusinessProfile:
        request = self.context.get("request")
        membership = get_user_membership(request.user, business.organization)
        if membership is None or not membership.can_write:
            raise serializers.ValidationError("You do not have write access to this business.")
        return business

    def validate(self, attrs: dict) -> dict:
        business = attrs.get("business") or getattr(self.instance, "business", None)
        run = attrs.get("run")
        if run and business and run.business_id != business.id:
            raise serializers.ValidationError(
                {"run": "Simulation run must belong to the same business."}
            )
        return attrs

    def create(self, validated_data: dict) -> Decision:
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)

"""Serializers for simulation app."""

from __future__ import annotations

from rest_framework import serializers

from scenarios.models import Scenario

from .models import SimulationResult, SimulationRun, Strategy, StrategyResult


class StrategySerializer(serializers.ModelSerializer):
    class Meta:
        model = Strategy
        fields = ["id", "scenario", "key", "name", "description", "parameter_overrides"]
        read_only_fields = ["id", "scenario"]


class SimulationResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = SimulationResult
        fields = [
            "id",
            "is_baseline",
            "metric_key",
            "label",
            "value_numeric",
            "unit",
            "category",
            "formula_note",
        ]


class StrategyResultSerializer(serializers.ModelSerializer):
    strategy_key = serializers.CharField(source="strategy.key", read_only=True)
    strategy_name = serializers.CharField(source="strategy.name", read_only=True)

    class Meta:
        model = StrategyResult
        fields = [
            "id",
            "strategy",
            "strategy_key",
            "strategy_name",
            "metric_key",
            "label",
            "value_numeric",
            "unit",
            "category",
            "formula_note",
            "rank",
            "warnings",
        ]


class SimulationRunCreateSerializer(serializers.Serializer):
    """Input payload for triggering a simulation run."""

    scenario_id = serializers.UUIDField()
    strategy_keys = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )
    idempotency_key = serializers.CharField(max_length=128, required=False, allow_blank=True)

    def validate_scenario_id(self, value):
        try:
            return Scenario.objects.select_related("business__organization", "template").get(
                id=value
            )
        except Scenario.DoesNotExist as exc:
            raise serializers.ValidationError("Scenario not found.") from exc


class SimulationRunSerializer(serializers.ModelSerializer):
    scenario_name = serializers.CharField(source="scenario.name", read_only=True)
    business_name = serializers.CharField(source="business.name", read_only=True)
    module = serializers.CharField(source="scenario.module", read_only=True)
    results = SimulationResultSerializer(many=True, read_only=True)

    class Meta:
        model = SimulationRun
        fields = [
            "id",
            "business",
            "business_name",
            "scenario",
            "scenario_name",
            "module",
            "engine_key",
            "engine_version",
            "currency",
            "status",
            "input_snapshot",
            "assumptions_used",
            "warnings",
            "limitations",
            "error_message",
            "started_at",
            "completed_at",
            "created_at",
            "results",
        ]
        read_only_fields = fields

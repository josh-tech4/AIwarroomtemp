"""Serializers for ai_analyst app."""

from __future__ import annotations

from rest_framework import serializers

from simulation.models import SimulationRun

from .models import AIAnalysis, AIFollowUp


class AnalyzeRunRequestSerializer(serializers.Serializer):
    run_id = serializers.UUIDField()

    def validate_run_id(self, value):
        try:
            return SimulationRun.objects.select_related("business__organization", "scenario").get(
                id=value
            )
        except SimulationRun.DoesNotExist as exc:
            raise serializers.ValidationError("Simulation run not found.") from exc


class FollowUpRequestSerializer(serializers.Serializer):
    run_id = serializers.UUIDField(required=False)
    question = serializers.CharField(min_length=3, max_length=1000)

    def validate_run_id(self, value):
        try:
            return SimulationRun.objects.select_related("business__organization", "scenario").get(
                id=value
            )
        except SimulationRun.DoesNotExist as exc:
            raise serializers.ValidationError("Simulation run not found.") from exc


class AIFollowUpSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIFollowUp
        fields = [
            "id",
            "run",
            "question",
            "answer",
            "cited_metrics",
            "limitations",
            "validation_warnings",
            "provider",
            "model_name",
            "prompt_version",
            "status",
            "error_message",
            "created_at",
        ]
        read_only_fields = fields


class AIAnalysisSerializer(serializers.ModelSerializer):
    business_id = serializers.UUIDField(source="run.business_id", read_only=True)
    scenario_name = serializers.CharField(source="run.scenario.name", read_only=True)

    class Meta:
        model = AIAnalysis
        fields = [
            "id",
            "run",
            "business_id",
            "scenario_name",
            "provider",
            "model_name",
            "prompt_version",
            "status",
            "structured_output",
            "validation_warnings",
            "error_message",
            "created_at",
        ]
        read_only_fields = fields

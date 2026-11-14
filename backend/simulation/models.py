"""Simulation models: runs, immutable snapshots, results, and strategy comparisons."""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class Strategy(models.Model):
    """Strategy option evaluated within a Scenario."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scenario = models.ForeignKey(
        "scenarios.Scenario",
        on_delete=models.CASCADE,
        related_name="strategies",
    )
    key = models.SlugField(max_length=100)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    parameter_overrides = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "simulation_strategy"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["scenario", "key"],
                name="unique_strategy_per_scenario",
            )
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.key})"


class SimulationRun(models.Model):
    """Immutable record of a single simulation execution."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(
        "businesses.BusinessProfile",
        on_delete=models.CASCADE,
        related_name="simulation_runs",
    )
    scenario = models.ForeignKey(
        "scenarios.Scenario",
        on_delete=models.CASCADE,
        related_name="simulation_runs",
    )
    engine_key = models.CharField(max_length=100)
    engine_version = models.CharField(max_length=30)
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    idempotency_key = models.CharField(max_length=128, null=True, blank=True)
    input_snapshot = models.JSONField(default=dict)
    assumptions_used = models.JSONField(default=list)
    warnings = models.JSONField(default=list)
    limitations = models.JSONField(default=list)
    error_message = models.TextField(blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="simulation_runs",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "simulation_run"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["scenario", "idempotency_key"],
                condition=models.Q(idempotency_key__isnull=False),
                name="unique_run_idempotency_per_scenario",
            )
        ]
        indexes = [
            models.Index(fields=["business", "-created_at"]),
            models.Index(fields=["scenario", "-created_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:
        return f"Run {self.id} ({self.engine_key} - {self.status})"


class SimulationResult(models.Model):
    """Normalized metric output produced by a SimulationRun."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(
        SimulationRun,
        on_delete=models.CASCADE,
        related_name="results",
    )
    is_baseline = models.BooleanField(default=False)
    metric_key = models.CharField(max_length=120)
    label = models.CharField(max_length=255)
    value_numeric = models.DecimalField(max_digits=18, decimal_places=4)
    unit = models.CharField(max_length=64)
    category = models.CharField(max_length=40, default="financial")
    formula_note = models.TextField(blank=True)

    class Meta:
        db_table = "simulation_result"
        ordering = ["-is_baseline", "category", "metric_key"]
        indexes = [
            models.Index(fields=["run", "metric_key"]),
        ]

    def __str__(self) -> str:
        return f"{self.metric_key}={self.value_numeric} {self.unit}"


class StrategyResult(models.Model):
    """Normalized metric output for a specific Strategy within a SimulationRun."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(
        SimulationRun,
        on_delete=models.CASCADE,
        related_name="strategy_results",
    )
    strategy = models.ForeignKey(
        Strategy,
        on_delete=models.CASCADE,
        related_name="results",
    )
    metric_key = models.CharField(max_length=120)
    label = models.CharField(max_length=255)
    value_numeric = models.DecimalField(max_digits=18, decimal_places=4)
    unit = models.CharField(max_length=64)
    category = models.CharField(max_length=40, default="financial")
    formula_note = models.TextField(blank=True)
    rank = models.PositiveIntegerField(default=1)
    warnings = models.JSONField(default=list)

    class Meta:
        db_table = "simulation_strategy_result"
        ordering = ["rank", "strategy__name", "metric_key"]
        indexes = [
            models.Index(fields=["run", "strategy"]),
        ]

    def __str__(self) -> str:
        return f"{self.strategy.key}: {self.metric_key}={self.value_numeric}"

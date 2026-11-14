"""AIAnalysis and AIFollowUp persistence models."""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class AIAnalysis(models.Model):
    """Persisted AI explanation grounded in a specific SimulationRun."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(
        "simulation.SimulationRun",
        on_delete=models.CASCADE,
        related_name="ai_analyses",
    )
    provider = models.CharField(max_length=50)
    model_name = models.CharField(max_length=100)
    prompt_version = models.CharField(max_length=30)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    context_summary = models.JSONField(default=dict)
    structured_output = models.JSONField(default=dict, blank=True)
    validation_warnings = models.JSONField(default=list, blank=True)
    error_message = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="ai_analyses",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ai_analyst_analysis"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["run", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"AIAnalysis {self.id} ({self.provider}/{self.model_name} - {self.status})"


class AIFollowUp(models.Model):
    """Persisted grounded follow-up Q&A exchange linked to a SimulationRun."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(
        "simulation.SimulationRun",
        on_delete=models.CASCADE,
        related_name="follow_ups",
    )
    question = models.TextField()
    answer = models.TextField(blank=True)
    cited_metrics = models.JSONField(default=list, blank=True)
    limitations = models.JSONField(default=list, blank=True)
    validation_warnings = models.JSONField(default=list, blank=True)
    provider = models.CharField(max_length=50)
    model_name = models.CharField(max_length=100)
    prompt_version = models.CharField(max_length=30, default="v1.0.0")
    status = models.CharField(
        max_length=20, choices=AIAnalysis.Status.choices, default=AIAnalysis.Status.COMPLETED
    )
    error_message = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="ai_followups",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ai_analyst_followup"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["run", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"AIFollowUp {self.id} on Run {self.run_id}"

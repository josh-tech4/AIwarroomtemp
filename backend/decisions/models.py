"""Human-owned Decision and ActionItem models."""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class Decision(models.Model):
    """Explicit human business decision informed by simulation runs & advisory AI."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(
        "businesses.BusinessProfile",
        on_delete=models.CASCADE,
        related_name="decisions",
    )
    run = models.ForeignKey(
        "simulation.SimulationRun",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decisions",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    selected_strategy_key = models.CharField(max_length=100, blank=True)
    rationale = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_decisions",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_decisions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "decisions_decision"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["business", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.status})"


class ActionItem(models.Model):
    """Execution follow-up task belonging to a Decision."""

    class Status(models.TextChoices):
        TODO = "todo", "To Do"
        IN_PROGRESS = "in_progress", "In Progress"
        DONE = "done", "Done"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    decision = models.ForeignKey(
        Decision,
        on_delete=models.CASCADE,
        related_name="actions",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="action_items",
    )
    owner_name = models.CharField(max_length=255, blank=True)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TODO)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "decisions_action_item"
        ordering = ["due_date", "created_at"]

    def __str__(self) -> str:
        return f"{self.title} ({self.status})"

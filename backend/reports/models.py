"""Report model storing snapshot-grounded business simulation reports."""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class Report(models.Model):
    """Structured report compiled from persisted snapshots, results, AI analysis, and decisions."""

    class ReportType(models.TextChoices):
        SIMULATION_SUMMARY = "simulation_summary", "Simulation Summary"
        RESILIENCE_ASSESSMENT = "resilience_assessment", "Resilience Assessment"
        EXECUTIVE_BRIEF = "executive_brief", "Executive Brief"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(
        "businesses.BusinessProfile",
        on_delete=models.CASCADE,
        related_name="reports",
    )
    run = models.ForeignKey(
        "simulation.SimulationRun",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reports",
    )
    title = models.CharField(max_length=255)
    report_type = models.CharField(
        max_length=30,
        choices=ReportType.choices,
        default=ReportType.SIMULATION_SUMMARY,
    )
    content = models.JSONField(default=dict)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_reports",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reports_report"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["business", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.business.name})"

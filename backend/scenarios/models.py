"""Scenario templates, configured scenarios, and parameter overrides."""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class ScenarioTemplate(models.Model):
    """Versioned blueprint for a simulation scenario."""

    class Module(models.TextChoices):
        IDEA = "idea", "Business Idea Simulator"
        RESILIENCE = "resilience", "Business Resilience Simulator"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.SlugField(max_length=100, unique=True)
    module = models.CharField(max_length=20, choices=Module.choices)
    name = models.CharField(max_length=255)
    description = models.TextField()
    engine_key = models.CharField(max_length=100)
    version = models.CharField(max_length=30, default="1.0.0")
    parameter_schema = models.JSONField(default=dict)
    default_strategies = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "scenarios_template"
        ordering = ["module", "name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.module} v{self.version})"


class Scenario(models.Model):
    """User-configured scenario attached to a BusinessProfile."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        CONFIGURED = "configured", "Configured"
        ARCHIVED = "archived", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(
        "businesses.BusinessProfile",
        on_delete=models.CASCADE,
        related_name="scenarios",
    )
    template = models.ForeignKey(
        ScenarioTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="scenarios",
    )
    module = models.CharField(max_length=20, choices=ScenarioTemplate.Module.choices)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.CONFIGURED)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_scenarios",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "scenarios_scenario"
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["business", "module"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.business.name})"


class ScenarioParameter(models.Model):
    """Explicit parameter override or configuration for a Scenario."""

    class OverrideType(models.TextChoices):
        PERCENTAGE = "percentage", "Percentage Change (%)"
        ABSOLUTE = "absolute", "Absolute Value"
        SETTING = "setting", "Configuration Setting"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scenario = models.ForeignKey(
        Scenario,
        on_delete=models.CASCADE,
        related_name="parameters",
    )
    key = models.SlugField(max_length=100)
    value_numeric = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    value_text = models.CharField(max_length=255, blank=True)
    unit = models.CharField(max_length=64, blank=True)
    override_type = models.CharField(
        max_length=20, choices=OverrideType.choices, default=OverrideType.ABSOLUTE
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "scenarios_parameter"
        ordering = ["key"]
        constraints = [
            models.UniqueConstraint(
                fields=["scenario", "key"],
                name="unique_scenario_parameter_key",
            )
        ]

    def __str__(self) -> str:
        val = self.value_numeric if self.value_numeric is not None else self.value_text
        return f"{self.key}={val} {self.unit}"

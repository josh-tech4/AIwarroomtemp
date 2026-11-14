"""Admin configuration for scenarios app."""

from django.contrib import admin

from .models import Scenario, ScenarioParameter, ScenarioTemplate


@admin.register(ScenarioTemplate)
class ScenarioTemplateAdmin(admin.ModelAdmin):
    list_display = ["name", "key", "module", "engine_key", "version", "is_active"]
    list_filter = ["module", "is_active"]


@admin.register(Scenario)
class ScenarioAdmin(admin.ModelAdmin):
    list_display = ["name", "business", "module", "status", "created_at"]
    list_filter = ["module", "status"]


@admin.register(ScenarioParameter)
class ScenarioParameterAdmin(admin.ModelAdmin):
    list_display = ["scenario", "key", "value_numeric", "unit", "override_type"]

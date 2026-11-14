"""Admin configuration for simulation app."""

from django.contrib import admin

from .models import SimulationResult, SimulationRun, Strategy, StrategyResult


@admin.register(SimulationRun)
class SimulationRunAdmin(admin.ModelAdmin):
    list_display = ["id", "business", "scenario", "engine_key", "status", "created_at"]
    list_filter = ["status", "engine_key"]
    readonly_fields = ["id", "input_snapshot", "created_at"]


@admin.register(SimulationResult)
class SimulationResultAdmin(admin.ModelAdmin):
    list_display = ["run", "metric_key", "value_numeric", "unit", "is_baseline"]


@admin.register(Strategy)
class StrategyAdmin(admin.ModelAdmin):
    list_display = ["scenario", "key", "name"]


@admin.register(StrategyResult)
class StrategyResultAdmin(admin.ModelAdmin):
    list_display = ["run", "strategy", "metric_key", "value_numeric", "rank"]

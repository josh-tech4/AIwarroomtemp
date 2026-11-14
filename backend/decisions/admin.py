"""Admin configuration for decisions app."""

from django.contrib import admin

from .models import ActionItem, Decision


@admin.register(Decision)
class DecisionAdmin(admin.ModelAdmin):
    list_display = ["title", "business", "status", "selected_strategy_key", "created_at"]
    list_filter = ["status"]


@admin.register(ActionItem)
class ActionItemAdmin(admin.ModelAdmin):
    list_display = ["title", "decision", "status", "due_date"]
    list_filter = ["status"]

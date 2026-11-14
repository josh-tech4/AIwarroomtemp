"""Admin configuration for ai_analyst app."""

from django.contrib import admin

from .models import AIAnalysis


@admin.register(AIAnalysis)
class AIAnalysisAdmin(admin.ModelAdmin):
    list_display = ["id", "run", "provider", "model_name", "prompt_version", "status", "created_at"]
    list_filter = ["provider", "status", "prompt_version"]
    readonly_fields = ["id", "created_at"]

"""Admin configuration for audit app."""

from django.contrib import admin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ["action", "organization", "actor", "resource_type", "created_at"]
    list_filter = ["action", "resource_type"]
    readonly_fields = ["id", "created_at"]

"""Admin configuration for businesses app."""

from django.contrib import admin

from .models import (
    BusinessAssumption,
    BusinessComponent,
    BusinessMetric,
    BusinessProfile,
    Dependency,
)


@admin.register(BusinessProfile)
class BusinessProfileAdmin(admin.ModelAdmin):
    list_display = ["name", "organization", "stage", "industry", "currency", "status"]
    list_filter = ["stage", "industry", "status"]
    search_fields = ["name", "organization__name"]


@admin.register(BusinessMetric)
class BusinessMetricAdmin(admin.ModelAdmin):
    list_display = ["business", "key", "value_numeric", "unit", "source_type"]
    list_filter = ["category", "source_type"]


@admin.register(BusinessAssumption)
class BusinessAssumptionAdmin(admin.ModelAdmin):
    list_display = ["business", "key", "value_numeric", "unit", "source_type", "confidence"]
    list_filter = ["assumption_type", "source_type", "confidence"]


@admin.register(BusinessComponent)
class BusinessComponentAdmin(admin.ModelAdmin):
    list_display = ["business", "name", "component_type", "criticality"]
    list_filter = ["component_type", "criticality"]


@admin.register(Dependency)
class DependencyAdmin(admin.ModelAdmin):
    list_display = ["business", "source_component", "relationship_type", "target_component"]

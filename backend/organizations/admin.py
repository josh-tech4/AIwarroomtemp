"""Admin configuration for organizations app."""

from django.contrib import admin

from .models import Organization, OrganizationMember


class MemberInline(admin.TabularInline):
    model = OrganizationMember
    extra = 0
    readonly_fields = ["id", "created_at"]


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "created_by", "created_at"]
    search_fields = ["name", "slug"]
    readonly_fields = ["id", "created_at", "updated_at"]
    inlines = [MemberInline]


@admin.register(OrganizationMember)
class OrganizationMemberAdmin(admin.ModelAdmin):
    list_display = ["user", "organization", "role", "created_at"]
    list_filter = ["role"]
    search_fields = ["user__email", "organization__name"]
    readonly_fields = ["id", "created_at"]

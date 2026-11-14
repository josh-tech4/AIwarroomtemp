"""Organization-scoped permission helpers and DRF permission classes.

SECURITY: Every queryset and object action must enforce org membership.
Never trust org IDs from the browser without verifying membership.
"""

from __future__ import annotations

from rest_framework import permissions

from .models import Organization, OrganizationMember


def get_user_membership(user, organization) -> OrganizationMember | None:
    """Return the user's membership in an organization, or None."""
    if not user or not user.is_authenticated or organization is None:
        return None
    try:
        return OrganizationMember.objects.select_related("organization").get(
            organization=organization, user=user
        )
    except OrganizationMember.DoesNotExist:
        return None


def _extract_org(obj):
    """Extract the Organization instance from a domain object."""
    if isinstance(obj, Organization):
        return obj
    if hasattr(obj, "organization"):
        return obj.organization
    if hasattr(obj, "business") and hasattr(obj.business, "organization"):
        return obj.business.organization
    if hasattr(obj, "scenario") and hasattr(obj.scenario, "business"):
        return obj.scenario.business.organization
    if hasattr(obj, "run") and hasattr(obj.run, "business"):
        return obj.run.business.organization
    if hasattr(obj, "decision") and hasattr(obj.decision, "business"):
        return obj.decision.business.organization
    return None


class IsOrganizationMember(permissions.BasePermission):
    """Allow any authenticated organization member (any role)."""

    message = "You are not a member of this organization."

    def has_object_permission(self, request, view, obj):
        org = _extract_org(obj)
        if org is None:
            return False
        return get_user_membership(request.user, org) is not None


class IsOrganizationWriter(permissions.BasePermission):
    """Allow owner, admin, or analyst roles for mutations; members for reads."""

    message = "You do not have write access to this organization."

    def has_object_permission(self, request, view, obj):
        org = _extract_org(obj)
        if org is None:
            return False
        membership = get_user_membership(request.user, org)
        if membership is None:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return membership.can_write


class IsOrganizationAdmin(permissions.BasePermission):
    """Allow owner or admin roles only."""

    message = "Only organization admins can perform this action."

    def has_object_permission(self, request, view, obj):
        org = _extract_org(obj)
        if org is None:
            return False
        membership = get_user_membership(request.user, org)
        return membership is not None and membership.can_manage

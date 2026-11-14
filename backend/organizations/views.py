"""Views for organizations app."""

import logging

from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .models import Organization, OrganizationMember
from .permissions import IsOrganizationAdmin, IsOrganizationMember, get_user_membership
from .serializers import (
    InviteMemberSerializer,
    OrganizationMemberSerializer,
    OrganizationSerializer,
)

logger = logging.getLogger(__name__)
User = get_user_model()


class OrganizationViewSet(ModelViewSet):
    """CRUD for organizations. List returns only organizations the user belongs to."""

    queryset = Organization.objects.none()
    serializer_class = OrganizationSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizationMember]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Organization.objects.none()
        return (
            Organization.objects.filter(members__user=self.request.user)
            .prefetch_related("members")
            .distinct()
        )

    def get_permissions(self):
        if self.action in ["update", "partial_update"]:
            return [permissions.IsAuthenticated(), IsOrganizationAdmin()]
        return super().get_permissions()

    def get_object(self):
        obj = super().get_object()
        membership = get_user_membership(self.request.user, obj)
        if membership is None:
            raise PermissionDenied("You are not a member of this organization.")
        return obj

    def destroy(self, request, *args, **kwargs):
        org = self.get_object()
        membership = get_user_membership(request.user, org)
        if not membership or not membership.is_owner:
            return Response(
                {
                    "error": {
                        "code": "permission_denied",
                        "message": "Only the organization owner can delete it.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        logger.info("Organization deleted: %s by %s", org.id, request.user.id)
        return super().destroy(request, *args, **kwargs)


class OrganizationMemberViewSet(ModelViewSet):
    """Manage members within an organization."""

    queryset = OrganizationMember.objects.none()
    serializer_class = OrganizationMemberSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_organization(self):
        org_id = self.kwargs["org_pk"]
        try:
            org = Organization.objects.get(id=org_id)
        except Organization.DoesNotExist as exc:
            raise NotFound("Organization not found.") from exc
        membership = get_user_membership(self.request.user, org)
        if membership is None:
            raise PermissionDenied("You are not a member of this organization.")
        return org, membership

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return OrganizationMember.objects.none()
        org, _ = self.get_organization()
        return (
            OrganizationMember.objects.filter(organization=org)
            .select_related("user", "organization")
            .order_by("created_at")
        )

    def create(self, request, *args, **kwargs):
        return self.invite(request, *args, **kwargs)

    @action(detail=False, methods=["post"], url_path="invite")
    def invite(self, request, org_pk=None):
        """Invite an existing user to the organization by email."""
        org, membership = self.get_organization()
        if not membership.can_manage:
            return Response(
                {
                    "error": {
                        "code": "permission_denied",
                        "message": "Only admins can invite members.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = InviteMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        role = serializer.validated_data["role"]

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {
                    "error": {
                        "code": "user_not_found",
                        "message": f"No user found with email {email}.",
                    }
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        member, created = OrganizationMember.objects.get_or_create(
            organization=org,
            user=user,
            defaults={"role": role},
        )
        if not created:
            return Response(
                {
                    "error": {
                        "code": "already_member",
                        "message": "User is already a member.",
                    }
                },
                status=status.HTTP_409_CONFLICT,
            )

        logger.info("User %s added to org %s with role %s", user.id, org.id, role)
        return Response(OrganizationMemberSerializer(member).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        org, requesting_membership = self.get_organization()
        if not requesting_membership.can_manage:
            raise PermissionDenied("Only admins can change member roles.")
        member = self.get_object()
        if member.is_owner and not requesting_membership.is_owner:
            raise PermissionDenied("Cannot modify the owner role.")
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        org, requesting_membership = self.get_organization()
        member = self.get_object()
        if member.is_owner:
            return Response(
                {
                    "error": {
                        "code": "cannot_remove_owner",
                        "message": "Cannot remove the organization owner.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if not requesting_membership.can_manage:
            return Response(
                {
                    "error": {
                        "code": "permission_denied",
                        "message": "Only admins can remove members.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

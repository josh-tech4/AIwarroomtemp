"""Serializers for organizations app."""

from __future__ import annotations

from django.db import transaction
from django.utils.text import slugify
from rest_framework import serializers

from .models import Organization, OrganizationMember


class OrganizationSerializer(serializers.ModelSerializer):
    """Full organization detail."""

    member_count = serializers.SerializerMethodField()
    current_user_role = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "member_count",
            "current_user_role",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    def get_member_count(self, obj) -> int:
        return obj.members.count()

    def get_current_user_role(self, obj) -> str | None:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        member = obj.members.filter(user=request.user).first()
        return member.role if member else None

    @transaction.atomic
    def create(self, validated_data: dict) -> Organization:
        name = validated_data["name"]
        base_slug = slugify(name) or "org"
        slug = base_slug
        counter = 1
        while Organization.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1

        user = self.context["request"].user
        org = Organization.objects.create(
            slug=slug,
            created_by=user,
            **validated_data,
        )
        OrganizationMember.objects.create(
            organization=org,
            user=user,
            role=OrganizationMember.Role.OWNER,
        )
        return org


class OrganizationMemberSerializer(serializers.ModelSerializer):
    """Member record with user details."""

    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_full_name = serializers.CharField(source="user.full_name", read_only=True)
    user_id = serializers.UUIDField(source="user.id", read_only=True)

    class Meta:
        model = OrganizationMember
        fields = ["id", "user_id", "user_email", "user_full_name", "role", "created_at"]
        read_only_fields = ["id", "user_id", "user_email", "user_full_name", "created_at"]


class InviteMemberSerializer(serializers.Serializer):
    """Serializer for inviting a user to an organization."""

    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=OrganizationMember.Role.choices, default=OrganizationMember.Role.VIEWER
    )

    def validate_email(self, value: str) -> str:
        return value.lower().strip()

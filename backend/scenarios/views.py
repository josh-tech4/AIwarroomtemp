"""Views for scenarios app."""

from __future__ import annotations

from django.db import transaction
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from organizations.permissions import IsOrganizationWriter, get_user_membership

from .models import Scenario, ScenarioParameter, ScenarioTemplate
from .serializers import (
    ScenarioParameterSerializer,
    ScenarioSerializer,
    ScenarioTemplateSerializer,
)
from .template_seed import ensure_default_templates


class ScenarioTemplateViewSet(ReadOnlyModelViewSet):
    """List and retrieve available versioned scenario templates."""

    queryset = ScenarioTemplate.objects.none()
    serializer_class = ScenarioTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ScenarioTemplate.objects.none()
        if not ScenarioTemplate.objects.exists():
            ensure_default_templates()
        qs = ScenarioTemplate.objects.filter(is_active=True)
        module = self.request.query_params.get("module")
        if module:
            qs = qs.filter(module=module)
        return qs


class ScenarioViewSet(ModelViewSet):
    """CRUD for business scenarios, strictly organization-scoped."""

    queryset = Scenario.objects.none()
    serializer_class = ScenarioSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizationWriter]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Scenario.objects.none()
        qs = (
            Scenario.objects.filter(business__organization__members__user=self.request.user)
            .select_related("business", "template", "created_by")
            .prefetch_related("parameters", "strategies")
        )
        business_id = self.kwargs.get("business_pk") or self.request.query_params.get("business")
        if business_id:
            qs = qs.filter(business_id=business_id)
        module = self.request.query_params.get("module")
        if module:
            qs = qs.filter(module=module)
        return qs.distinct()

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def duplicate(self, request, pk=None):
        """UC-11: Duplicate a scenario with its parameter overrides and strategies."""
        source = self.get_object()
        cloned = Scenario.objects.create(
            business=source.business,
            template=source.template,
            module=source.module,
            name=f"{source.name} (Copy)",
            description=source.description,
            status=source.status,
            created_by=request.user,
        )
        for p in source.parameters.all():
            ScenarioParameter.objects.create(
                scenario=cloned,
                key=p.key,
                value_numeric=p.value_numeric,
                value_text=p.value_text,
                unit=p.unit,
                override_type=p.override_type,
                notes=p.notes,
            )
        for st in source.strategies.all():
            from simulation.models import Strategy

            Strategy.objects.create(
                scenario=cloned,
                key=st.key,
                name=st.name,
                description=st.description,
                parameter_overrides=st.parameter_overrides,
            )
        return Response(ScenarioSerializer(cloned).data, status=status.HTTP_201_CREATED)

    def get_serializer(self, *args, **kwargs):
        if "business_pk" in self.kwargs and "data" in kwargs and isinstance(kwargs["data"], dict):
            data = kwargs["data"].copy()
            data.setdefault("business", str(self.kwargs["business_pk"]))
            kwargs["data"] = data
        return super().get_serializer(*args, **kwargs)


class ScenarioParameterViewSet(ModelViewSet):
    """Manage scenario parameter overrides."""

    queryset = ScenarioParameter.objects.none()
    serializer_class = ScenarioParameterSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_scenario(self, require_write: bool = False) -> Scenario:
        scenario_id = self.kwargs["scenario_pk"]
        try:
            scenario = Scenario.objects.select_related("business__organization").get(id=scenario_id)
        except Scenario.DoesNotExist as exc:
            raise NotFound("Scenario not found.") from exc
        membership = get_user_membership(self.request.user, scenario.business.organization)
        if membership is None:
            raise PermissionDenied("You do not have access to this scenario.")
        if require_write and not membership.can_write:
            raise PermissionDenied("You do not have write access in this organization.")
        return scenario

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ScenarioParameter.objects.none()
        scenario = self.get_scenario()
        return ScenarioParameter.objects.filter(scenario=scenario)

    def perform_create(self, serializer):
        scenario = self.get_scenario(require_write=True)
        # Upsert by key if parameter already exists on scenario
        key = serializer.validated_data["key"]
        existing = ScenarioParameter.objects.filter(scenario=scenario, key=key).first()
        if existing:
            for attr, value in serializer.validated_data.items():
                setattr(existing, attr, value)
            existing.save()
            serializer.instance = existing
        else:
            serializer.save(scenario=scenario)

    def perform_update(self, serializer):
        self.get_scenario(require_write=True)
        serializer.save()

    def perform_destroy(self, instance):
        self.get_scenario(require_write=True)
        instance.delete()

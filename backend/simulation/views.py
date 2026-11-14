"""Views for simulation app — run execution, results, and strategy comparison."""

from __future__ import annotations

from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from ai_analyst.models import AIAnalysis, AIFollowUp
from ai_analyst.serializers import (
    AIAnalysisSerializer,
    AIFollowUpSerializer,
    FollowUpRequestSerializer,
)
from ai_analyst.services import AIAnalystService
from organizations.permissions import IsOrganizationMember, get_user_membership
from scenarios.models import Scenario

from .models import SimulationResult, SimulationRun
from .orchestrator import SimulationOrchestrator
from .serializers import (
    SimulationResultSerializer,
    SimulationRunCreateSerializer,
    SimulationRunSerializer,
)
from .services import build_run_comparison, build_strategy_comparison


class SimulationRunViewSet(viewsets.GenericViewSet):
    """Trigger, retrieve, and compare simulation runs."""

    queryset = SimulationRun.objects.none()
    serializer_class = SimulationRunSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizationMember]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return SimulationRun.objects.none()
        qs = (
            SimulationRun.objects.filter(business__organization__members__user=self.request.user)
            .select_related("business", "scenario", "created_by")
            .prefetch_related("results")
        )
        business_id = self.request.query_params.get("business")
        if business_id:
            qs = qs.filter(business_id=business_id)
        scenario_id = self.request.query_params.get("scenario")
        if scenario_id:
            qs = qs.filter(scenario_id=scenario_id)
        return qs.distinct()

    def list(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        run = self.get_object()
        return Response(self.get_serializer(run).data)

    @method_decorator(ratelimit(key="user", rate="30/m", method="POST", block=True))
    def create(self, request):
        """Validate, snapshot, and execute a simulation run. Returns 202 Accepted."""
        serializer = SimulationRunCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        scenario = serializer.validated_data["scenario_id"]
        membership = get_user_membership(request.user, scenario.business.organization)
        if membership is None or not membership.can_write:
            raise PermissionDenied(
                "You do not have permission to run simulations for this business."
            )

        idem_key = (
            request.headers.get("Idempotency-Key")
            or serializer.validated_data.get("idempotency_key")
            or None
        )

        run = SimulationOrchestrator.execute_run(
            scenario=scenario,
            user=request.user,
            strategy_keys=serializer.validated_data.get("strategy_keys"),
            idempotency_key=idem_key,
        )
        data = SimulationRunSerializer(run).data
        return Response(data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        """Return normalized metrics for a simulation run."""
        run = self.get_object()
        rows = SimulationResult.objects.filter(run=run)
        return Response(
            {
                "run_id": str(run.id),
                "status": run.status,
                "currency": run.currency,
                "engine_key": run.engine_key,
                "engine_version": run.engine_version,
                "baseline_metrics": SimulationResultSerializer(
                    rows.filter(is_baseline=True), many=True
                ).data,
                "metrics": SimulationResultSerializer(
                    rows.filter(is_baseline=False), many=True
                ).data,
                "warnings": run.warnings,
                "limitations": run.limitations,
            }
        )

    @action(detail=True, methods=["get"])
    def strategies(self, request, pk=None):
        """Return strategy comparison matrix for a simulation run."""
        run = self.get_object()
        return Response(build_strategy_comparison(run))

    @action(detail=True, methods=["post"])
    def compare(self, request, pk=None):
        """Compare strategies within a run, or compare two prior runs (FR-020)."""
        run = self.get_object()
        compare_id = request.data.get("compare_with_run_id") or request.data.get("other_run_id")
        if compare_id:
            try:
                other_run = SimulationRun.objects.select_related(
                    "business__organization", "scenario"
                ).get(id=compare_id)
            except SimulationRun.DoesNotExist as exc:
                raise NotFound("Comparison simulation run not found.") from exc
            membership = get_user_membership(request.user, other_run.business.organization)
            if membership is None:
                raise PermissionDenied("You do not have access to the comparison simulation run.")
            return Response(build_run_comparison(run, other_run))
        return Response(build_strategy_comparison(run))

    @action(detail=True, methods=["post"])
    @method_decorator(ratelimit(key="user", rate="15/m", method="POST", block=True))
    def analyze(self, request, pk=None):
        """Trigger AI Decision Analyst directly on a completed simulation run."""
        run = self.get_object()
        membership = get_user_membership(request.user, run.business.organization)
        if membership is None or not membership.can_write:
            raise PermissionDenied("You do not have permission to analyze this simulation run.")
        if run.status != SimulationRun.Status.COMPLETED:
            return Response(
                {
                    "error": {
                        "code": "run_not_completed",
                        "message": "Simulation run must be completed before AI analysis.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        analysis = AIAnalystService.analyze_run(run=run, user=request.user)
        resp_status = (
            status.HTTP_202_ACCEPTED
            if analysis.status == AIAnalysis.Status.COMPLETED
            else status.HTTP_502_BAD_GATEWAY
        )
        return Response(AIAnalysisSerializer(analysis).data, status=resp_status)

    @action(detail=True, methods=["get"])
    def analysis(self, request, pk=None):
        """Retrieve latest AI analysis for a simulation run."""
        run = self.get_object()
        latest = AIAnalysis.objects.filter(run=run).order_by("-created_at").first()
        if latest is None:
            raise NotFound("No AI analysis found for this simulation run.")
        return Response(AIAnalysisSerializer(latest).data)

    @action(detail=True, methods=["post"])
    @method_decorator(ratelimit(key="user", rate="20/m", method="POST", block=True))
    def ask(self, request, pk=None):
        """Spec §13.1: Answer a bounded follow-up question grounded in this SimulationRun."""
        run = self.get_object()
        if run.status != SimulationRun.Status.COMPLETED:
            return Response(
                {
                    "error": {
                        "code": "run_not_completed",
                        "message": "Simulation run must be completed before follow-up Q&A.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        ser = FollowUpRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        followup = AIAnalystService.ask_followup(
            run=run,
            user=request.user,
            question=ser.validated_data["question"],
        )
        resp_status = (
            status.HTTP_201_CREATED
            if followup.status == AIAnalysis.Status.COMPLETED
            else status.HTTP_502_BAD_GATEWAY
        )
        return Response(AIFollowUpSerializer(followup).data, status=resp_status)

    @action(detail=True, methods=["get"])
    def questions(self, request, pk=None):
        """List grounded follow-up Q&A history for a simulation run."""
        run = self.get_object()
        qs = AIFollowUp.objects.filter(run=run).order_by("created_at")
        return Response(AIFollowUpSerializer(qs, many=True).data)


class ScenarioRunCreateView(APIView):
    """Execute a simulation run via POST /api/v1/scenarios/{scenario_pk}/runs/."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SimulationRunCreateSerializer

    @method_decorator(ratelimit(key="user", rate="30/m", method="POST", block=True))
    def post(self, request, scenario_pk):
        try:
            scenario = Scenario.objects.select_related("business__organization", "template").get(
                id=scenario_pk
            )
        except Scenario.DoesNotExist as exc:
            raise NotFound("Scenario not found.") from exc

        membership = get_user_membership(request.user, scenario.business.organization)
        if membership is None or not membership.can_write:
            raise PermissionDenied(
                "You do not have permission to run simulations for this business."
            )

        idem_key = request.headers.get("Idempotency-Key") or request.data.get("idempotency_key")
        strategy_keys = request.data.get("strategy_keys")
        run = SimulationOrchestrator.execute_run(
            scenario=scenario,
            user=request.user,
            strategy_keys=strategy_keys,
            idempotency_key=idem_key or None,
        )
        return Response(SimulationRunSerializer(run).data, status=status.HTTP_202_ACCEPTED)

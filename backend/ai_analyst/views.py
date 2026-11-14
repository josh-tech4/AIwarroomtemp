"""Views for ai_analyst app."""

from __future__ import annotations

from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from organizations.permissions import IsOrganizationMember, get_user_membership

from .models import AIAnalysis, AIFollowUp
from .serializers import (
    AIAnalysisSerializer,
    AIFollowUpSerializer,
    AnalyzeRunRequestSerializer,
    FollowUpRequestSerializer,
)
from .services import AIAnalystService


class AnalyzeSimulationRunView(APIView):
    """Trigger AI Decision Analyst explanation on a completed SimulationRun."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AnalyzeRunRequestSerializer

    @method_decorator(ratelimit(key="user", rate="15/m", method="POST", block=True))
    def post(self, request):
        serializer = AnalyzeRunRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        run = serializer.validated_data["run_id"]

        membership = get_user_membership(request.user, run.business.organization)
        if membership is None or not membership.can_write:
            raise PermissionDenied("You do not have permission to analyze this simulation run.")

        if run.status != "completed":
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


class AIAnalysisViewSet(viewsets.ReadOnlyModelViewSet):
    """Retrieve persisted AI analyses, strictly organization-scoped."""

    queryset = AIAnalysis.objects.none()
    serializer_class = AIAnalysisSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizationMember]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return AIAnalysis.objects.none()
        qs = AIAnalysis.objects.filter(
            run__business__organization__members__user=self.request.user
        ).select_related("run__business", "run__scenario")
        run_id = self.request.query_params.get("run")
        if run_id:
            qs = qs.filter(run_id=run_id)
        return qs.distinct()


class AskFollowUpView(APIView):
    """Ask a follow-up question strictly grounded in a completed SimulationRun."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = FollowUpRequestSerializer

    @method_decorator(ratelimit(key="user", rate="20/m", method="POST", block=True))
    def post(self, request):
        serializer = FollowUpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        run = serializer.validated_data.get("run_id")
        if run is None:
            return Response(
                {"error": {"code": "missing_run_id", "message": "run_id is required."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        membership = get_user_membership(request.user, run.business.organization)
        if membership is None:
            raise PermissionDenied("You do not have access to this simulation run.")

        if run.status != "completed":
            return Response(
                {
                    "error": {
                        "code": "run_not_completed",
                        "message": "Simulation run must be completed before follow-up Q&A.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        followup = AIAnalystService.ask_followup(
            run=run,
            user=request.user,
            question=serializer.validated_data["question"],
        )
        resp_status = (
            status.HTTP_201_CREATED
            if followup.status == AIAnalysis.Status.COMPLETED
            else status.HTTP_502_BAD_GATEWAY
        )
        return Response(AIFollowUpSerializer(followup).data, status=resp_status)


class AIFollowUpViewSet(viewsets.ReadOnlyModelViewSet):
    """Retrieve persisted grounded follow-up Q&A exchanges."""

    queryset = AIFollowUp.objects.none()
    serializer_class = AIFollowUpSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizationMember]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return AIFollowUp.objects.none()
        qs = AIFollowUp.objects.filter(
            run__business__organization__members__user=self.request.user
        ).select_related("run__business")
        run_id = self.request.query_params.get("run")
        if run_id:
            qs = qs.filter(run_id=run_id)
        return qs.distinct()

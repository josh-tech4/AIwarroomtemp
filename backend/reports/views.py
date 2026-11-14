"""Views for reports app."""

from __future__ import annotations

import csv
import io

from django.http import HttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from audit.services import record_audit_event
from organizations.permissions import IsOrganizationWriter

from .models import Report
from .serializers import ReportCreateSerializer, ReportSerializer
from .services import ReportGeneratorService


class ReportViewSet(viewsets.ModelViewSet):
    """Generate and retrieve snapshot-grounded reports."""

    queryset = Report.objects.none()
    serializer_class = ReportSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizationWriter]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Report.objects.none()
        qs = Report.objects.filter(
            business__organization__members__user=self.request.user
        ).select_related("business", "run", "created_by")
        business_id = self.request.query_params.get("business")
        if business_id:
            qs = qs.filter(business_id=business_id)
        return qs.distinct()

    def create(self, request, *args, **kwargs):
        serializer = ReportCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        report = ReportGeneratorService.generate_report(
            business=data["business"],
            run=data.get("run"),
            title=data["title"],
            report_type=data["report_type"],
            user=request.user,
        )
        record_audit_event(
            organization=data["business"].organization,
            actor=request.user,
            action="report.generated",
            resource_type="report",
            resource_id=str(report.id),
            metadata={"title": report.title},
        )
        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="export-csv")
    def export_csv(self, request, pk=None):
        """Export persisted report snapshot (assumptions, metrics, strategies, decisions) as CSV."""
        report = self.get_object()
        content = report.content or {}
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            ["Section", "Key / Item", "Label / Name", "Value / Status", "Unit / Detail"]
        )
        biz = content.get("business", {})
        writer.writerow(
            ["Business", "name", biz.get("name", ""), biz.get("stage", ""), biz.get("currency", "")]
        )

        run_data = content.get("run") or {}
        for a in run_data.get("assumptions_used", []):
            writer.writerow(
                [
                    "Assumption",
                    a.get("key", ""),
                    a.get("source_type", ""),
                    a.get("value", ""),
                    a.get("unit", ""),
                ]
            )
        for m in run_data.get("baseline_metrics", []):
            writer.writerow(
                [
                    "Baseline Metric",
                    m.get("metric_key", ""),
                    m.get("label", ""),
                    m.get("value", ""),
                    m.get("unit", ""),
                ]
            )
        for m in run_data.get("scenario_metrics", []):
            writer.writerow(
                [
                    "Scenario Metric",
                    m.get("metric_key", ""),
                    m.get("label", ""),
                    m.get("value", ""),
                    m.get("unit", ""),
                ]
            )
        for s in run_data.get("strategy_comparison", []):
            for sm in s.get("metrics", []):
                writer.writerow(
                    [
                        f"Strategy #{s.get('rank', '')} ({s.get('strategy_name', '')})",
                        sm.get("metric_key", ""),
                        sm.get("label", ""),
                        sm.get("value_numeric", ""),
                        sm.get("unit", ""),
                    ]
                )
        for d in content.get("decisions", []):
            writer.writerow(
                [
                    "Decision",
                    d.get("selected_strategy_key", ""),
                    d.get("title", ""),
                    d.get("status", ""),
                    d.get("rationale", ""),
                ]
            )

        response = HttpResponse(buf.getvalue(), content_type="text/csv; charset=utf-8")
        safe_title = "".join(c if c.isalnum() or c in "-_" else "_" for c in report.title)[:48]
        response["Content-Disposition"] = f'attachment; filename="{safe_title or "report"}.csv"'
        return response

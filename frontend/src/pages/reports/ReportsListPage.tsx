import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText } from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  SectionHeader,
} from "../../components/ui";
import type { PaginatedResponse, Report } from "../../types/api";

export function ReportsListPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await apiClient.get<PaginatedResponse<Report>>("/reports/");
      setReports(resp.data.results || []);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  if (loading) return <LoadingState label="Loading compiled reports..." />;

  return (
    <div className="space-y-6">
      <SectionHeader
        tag="Audit-Grade Briefs (FR-019)"
        title="Executive Simulation Reports"
        subtitle="Compiled strictly from persisted run snapshots, AI evidence summaries, and human decisions without recalculation."
      />

      {error && (
        <Alert variant="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {reports.length === 0 ? (
        <EmptyState
          title="No reports generated yet"
          description="Open any completed simulation run and click 'Report' to compile a full executive brief."
          icon={<FileText className="h-5 w-5" />}
          action={
            <Link to="/app/dashboard">
              <Button size="sm">Go to Dashboard</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((rep) => (
            <Card key={rep.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-brand-400 shrink-0" />
                  <h2 className="text-sm font-semibold text-white truncate">{rep.title}</h2>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-mono text-surface-400">
                  <span>{rep.business_name}</span>
                  <Badge variant="neutral">{rep.report_type}</Badge>
                  <span>{new Date(rep.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <Link to={`/app/reports/${rep.id}`}>
                <Button size="xs" variant="outline">
                  View <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

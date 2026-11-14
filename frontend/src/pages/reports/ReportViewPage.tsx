import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bot, CheckSquare, Download, FileText, Printer } from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import { Alert, Badge, Button, Card, CardHeader, LoadingState } from "../../components/ui";
import type { Report } from "../../types/api";
import { formatValue, sourceTypeBadge } from "../../utils/formatters";

export function ReportViewPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    try {
      const resp = await apiClient.get<Report>(`/reports/${reportId}/`);
      setReport(resp.data);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const handleExportCsv = async () => {
    if (!report) return;
    setExportingCsv(true);
    try {
      const resp = await apiClient.get<Blob>(`/reports/${report.id}/export-csv/`, {
        responseType: "blob",
      });
      const blob = new Blob([resp.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setExportingCsv(false);
    }
  };

  if (loading) return <LoadingState label="Compiling persisted report..." />;
  if (error) return <Alert variant="error">{error}</Alert>;
  if (!report) return <Alert variant="warning">Report not found.</Alert>;

  const c = report.content;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <Link
          to="/app/reports"
          className="inline-flex items-center gap-1.5 text-xs text-surface-400 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Reports
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv} loading={exportingCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> Print / Save PDF
          </Button>
        </div>
      </div>

      <Card className="p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-brand-400" />
              <Badge variant="brand">{report.report_type}</Badge>
            </div>
            <h1 className="mt-2 text-xl font-semibold text-white">{report.title}</h1>
            <p className="mt-1 text-xs font-mono text-surface-400">
              {c.business.name} · {c.business.stage} · {c.business.industry} · {c.business.currency}
            </p>
          </div>
          <div className="text-right text-[11px] font-mono text-surface-500">
            <p>Generated {new Date(c.generated_at).toLocaleString()}</p>
            {c.business.is_demo && <Badge variant="warning" className="mt-1">Illustrative Demo Data</Badge>}
          </div>
        </div>

        <Alert variant="warning" title="Model Disclaimer">{c.disclaimer}</Alert>

        {c.run && (
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Simulation Summary — {c.run.scenario_name}</h2>
              <p className="text-[11px] font-mono text-surface-500 mt-0.5">
                Engine: {c.run.engine_key} v{c.run.engine_version} · Run ID: {c.run.id}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {c.run.scenario_metrics.map((m) => (
                  <div key={m.metric_key} className="rounded border border-surface-800 bg-surface-950/60 p-3">
                    <p className="text-[11px] text-surface-400">{m.label}</p>
                    <p className="mt-1 font-mono text-base font-semibold text-white">
                      {formatValue(m.value, m.unit)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="section-heading mb-2">Assumptions Snapshot</h3>
              <div className="flex flex-wrap gap-2">
                {c.run.assumptions_used.map((a) => {
                  const badge = sourceTypeBadge(a.source_type);
                  return (
                    <span key={a.key} className={`chip border text-[11px] ${badge.className}`}>
                      <span className="font-mono">{a.key}</span>:{" "}
                      <strong className="font-mono">{formatValue(a.value, a.unit)}</strong> ({badge.label})
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {c.ai_analysis && (
          <Card>
            <CardHeader
              title="AI Decision Analyst Summary"
              subtitle={`${c.ai_analysis.provider} (${c.ai_analysis.model_name}) · Prompt ${c.ai_analysis.prompt_version}`}
              icon={<Bot className="h-3.5 w-3.5" />}
            />
            <div className="space-y-3 p-4 text-xs text-surface-200">
              <p className="leading-relaxed">{c.ai_analysis.structured_output.executive_summary}</p>
              <ul className="list-disc pl-5 space-y-1 text-surface-400">
                {c.ai_analysis.structured_output.key_findings.map((f, idx) => (
                  <li key={idx}>{f}</li>
                ))}
              </ul>
            </div>
          </Card>
        )}

        {c.decisions.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
              <CheckSquare className="h-4 w-4 text-brand-400" /> Recorded Decisions & Action Items
            </h2>
            <div className="space-y-2.5">
              {c.decisions.map((d) => (
                <div key={d.id} className="rounded border border-surface-800 bg-surface-950/60 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-white">{d.title}</p>
                    <Badge variant={d.status === "approved" ? "success" : "neutral"}>{d.status}</Badge>
                  </div>
                  {d.rationale && <p className="mt-1 text-xs text-surface-400">{d.rationale}</p>}
                  {d.actions.length > 0 && (
                    <ul className="mt-2 space-y-1 font-mono text-[11px] text-surface-400">
                      {d.actions.map((a, idx) => (
                        <li key={idx}>· [{a.status}] {a.title} ({a.owner_name || "Unassigned"})</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

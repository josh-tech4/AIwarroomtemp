import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  HelpCircle,
  MessageSquare,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  LoadingState,
  SectionHeader,
} from "../../components/ui";
import type { AIAnalysis, AIFollowUp, PaginatedResponse } from "../../types/api";

export function AIAnalystPanel() {
  const { runId } = useParams<{ runId: string }>();
  const [analyses, setAnalyses] = useState<AIAnalysis[]>([]);
  const [followUps, setFollowUps] = useState<AIFollowUp[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalyses = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    setError(null);
    try {
      const [aResp, qResp] = await Promise.all([
        apiClient.get<PaginatedResponse<AIAnalysis>>("/ai-analyst/analyses/", {
          params: { run: runId },
        }),
        apiClient.get<AIFollowUp[]>(`/simulation-runs/${runId}/questions/`).catch(() => null),
      ]);
      setAnalyses(aResp.data.results || []);
      setFollowUps(qResp?.data || []);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void loadAnalyses();
  }, [loadAnalyses]);

  const handleRequestAnalysis = async () => {
    if (!runId) return;
    setAnalyzing(true);
    setError(null);
    try {
      await apiClient.post<AIAnalysis>("/ai-analyst/analyze/", { run_id: runId });
      await loadAnalyses();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAskFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runId || question.trim().length < 3) return;
    setAsking(true);
    setError(null);
    try {
      const resp = await apiClient.post<AIFollowUp>(`/simulation-runs/${runId}/ask/`, {
        question: question.trim(),
      });
      setFollowUps((prev) => [...prev, resp.data]);
      setQuestion("");
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setAsking(false);
    }
  };

  if (loading) return <LoadingState label="Loading grounded AI decision analysis..." />;

  const latest = analyses[0];
  const output = latest?.structured_output;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/app/simulation/runs/${runId}`}
          className="inline-flex items-center gap-1.5 text-xs text-surface-400 hover:text-white mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Simulation Results
        </Link>
        <SectionHeader
          tag="Evidence-Linked Reasoning"
          title="AI Decision Analyst"
          subtitle="Interprets persisted simulation metrics only — cites metric keys, discloses uncertainty, and cannot execute changes."
          action={
            <Button size="sm" onClick={handleRequestAnalysis} loading={analyzing}>
              <Sparkles className="h-3.5 w-3.5" />
              {analyzing ? "Analyzing..." : latest ? "Regenerate Analysis" : "Generate AI Analysis"}
            </Button>
          }
        />
      </div>

      {error && (
        <Alert variant="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!latest && !analyzing && (
        <EmptyState
          title="No AI analysis generated for this run yet"
          description="Generate a structured, schema-validated analysis citing exact metric keys from your simulation snapshot."
          icon={<Bot className="h-5 w-5 text-brand-400" />}
          action={
            <Button size="sm" onClick={handleRequestAnalysis}>
              <Sparkles className="h-3.5 w-3.5" /> Run AI Decision Analyst
            </Button>
          }
        />
      )}

      {latest && latest.status === "failed" && (
        <Alert variant="error" title="AI Analysis Failed">
          {latest.error_message || "The provider failed to return a schema-valid analysis."}
        </Alert>
      )}

      {latest && latest.status === "completed" && output && (
        <div className="space-y-5">
          {/* Provenance & Validation Status */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-surface-400 font-mono">
            <Badge variant="brand">PROVIDER: {latest.provider}</Badge>
            <Badge variant="neutral">MODEL: {latest.model_name}</Badge>
            <Badge variant="neutral">PROMPT: {latest.prompt_version}</Badge>
            <span className="ml-auto text-[11px]">
              Generated {new Date(latest.created_at).toLocaleString()}
            </span>
          </div>

          {latest.validation_warnings.length > 0 && (
            <Alert variant="warning" title="Evidence Validation Notes">
              <ul className="list-disc pl-4 space-y-0.5">
                {latest.validation_warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}

          {/* Executive Summary */}
          <Card>
            <CardHeader title="Executive Summary" icon={<Zap className="h-3.5 w-3.5" />} />
            <div className="p-4 text-sm leading-relaxed text-surface-200">{output.executive_summary}</div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Key Findings" />
              <ul className="space-y-2.5 p-4 text-xs text-surface-200">
                {output.key_findings.map((f, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <CardHeader title="Strategy Trade-offs" />
              <ul className="space-y-2 p-4 text-xs text-surface-200">
                {output.strategy_comparison.map((s, idx) => (
                  <li key={idx} className="rounded border border-surface-800 bg-surface-950/60 px-3 py-2">
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Recommendations & Cited Evidence */}
          <Card>
            <CardHeader
              title="Advisory Recommendations & Metric Evidence"
              subtitle="AI recommends only — human owners review evidence and explicitly approve decisions"
            />
            <div className="divide-y divide-surface-800">
              {output.recommendations.map((rec, idx) => (
                <div key={idx} className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">{rec.title}</h3>
                    <Badge variant={rec.confidence === "high" ? "success" : rec.confidence === "medium" ? "warning" : "danger"}>
                      Confidence: {rec.confidence}
                    </Badge>
                  </div>
                  <p className="text-xs text-surface-200">
                    <span className="text-brand-400 font-semibold">Suggested Action: </span>
                    {rec.action}
                  </p>
                  <p className="text-xs text-surface-400">{rec.rationale}</p>

                  <div className="space-y-1.5">
                    <p className="section-heading">Supporting Metric Citations</p>
                    {rec.supporting_evidence.map((ev, eIdx) => (
                      <div
                        key={eIdx}
                        className="flex flex-wrap items-center gap-2 rounded border border-brand-500/25 bg-brand-950/20 px-3 py-2 text-xs"
                      >
                        <span className="rounded bg-surface-900 border border-brand-500/35 px-2 py-0.5 font-mono text-[11px] font-semibold text-brand-300">
                          {ev.metric_key}
                        </span>
                        <span className="text-surface-200 flex-1">{ev.interpretation}</span>
                      </div>
                    ))}
                  </div>

                  {rec.risks.length > 0 && (
                    <div className="rounded border border-warning-500/30 bg-warning-500/10 p-3 text-xs">
                      <p className="font-semibold text-warning-400 flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> Risks & Caveats
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5 text-surface-300">
                        {rec.risks.map((r, rIdx) => (
                          <li key={rIdx}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Missing Information & Model Limitations" />
              <div className="space-y-4 p-4 text-xs">
                <div>
                  <p className="section-heading mb-2">Missing Information</p>
                  <ul className="space-y-1.5 text-surface-300">
                    {output.missing_information.map((m, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-surface-500" />
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border-t border-surface-800 pt-3">
                  <p className="section-heading mb-2">Declared Limitations</p>
                  <ul className="list-disc pl-4 space-y-1 text-surface-400">
                    {output.limitations.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Suggested Follow-Up Scenarios" />
              <ul className="space-y-2 p-4 text-xs text-surface-300">
                {output.suggested_next_scenarios.map((s, i) => (
                  <li key={i} className="rounded border border-surface-800 bg-surface-950/60 px-3 py-2">
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}

      {/* Grounded Follow-Up Q&A Panel (§13.1 / §16.1) */}
      <Card>
        <CardHeader
          title="Ask Follow-Up Question (§13.1)"
          subtitle="Answers are bounded strictly to persisted results & assumptions for this run"
          icon={<MessageSquare className="h-3.5 w-3.5" />}
        />
        <div className="p-4 space-y-4">
          {followUps.length > 0 && (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {followUps.map((fq) => (
                <div key={fq.id} className="rounded-md border border-surface-800 bg-surface-950 p-3.5 space-y-2 text-xs">
                  <p className="font-semibold text-white">Q: {fq.question}</p>
                  {fq.status === "failed" ? (
                    <p className="text-danger-400">{fq.error_message || "Could not validate follow-up response."}</p>
                  ) : (
                    <>
                      <p className="text-surface-200 leading-relaxed">{fq.answer}</p>
                      {fq.cited_metrics.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {fq.cited_metrics.map((cm, idx) => (
                            <span key={idx} className="rounded bg-surface-900 border border-brand-500/30 px-2 py-0.5 font-mono text-[10px] text-brand-300">
                              [{cm.metric_key}]
                            </span>
                          ))}
                        </div>
                      )}
                      {fq.limitations.length > 0 && (
                        <p className="text-[11px] text-surface-500 italic">
                          Limitation: {fq.limitations.join(" ")}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAskFollowUp} className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about strategy cost trade-offs, cash burn, or unrecovered orders..."
              className="field text-xs flex-1"
            />
            <Button type="submit" size="sm" loading={asking} disabled={question.trim().length < 3}>
              <Send className="h-3.5 w-3.5" /> Ask AI
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}

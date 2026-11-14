import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckSquare, Plus } from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import { Alert, Badge, Button, Card, CardHeader, LoadingState, SectionHeader } from "../../components/ui";
import type { ActionItem, Decision } from "../../types/api";

export function DecisionDetailPage() {
  const { decisionId } = useParams<{ decisionId: string }>();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [title, setTitle] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDecision = useCallback(async () => {
    if (!decisionId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await apiClient.get<Decision>(`/decisions/${decisionId}/`);
      setDecision(resp.data);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [decisionId]);

  useEffect(() => {
    void loadDecision();
  }, [loadDecision]);

  const handleAddAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionId) return;
    setError(null);
    try {
      await apiClient.post(`/decisions/${decisionId}/actions/`, {
        title,
        owner_name: ownerName,
        due_date: dueDate || null,
      });
      setTitle("");
      setOwnerName("");
      setDueDate("");
      await loadDecision();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleToggleStatus = async (item: ActionItem, nextStatus: ActionItem["status"]) => {
    if (!decisionId) return;
    try {
      await apiClient.patch(`/decisions/${decisionId}/actions/${item.id}/`, { status: nextStatus });
      await loadDecision();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  if (loading) return <LoadingState label="Loading decision detail..." />;
  if (!decision) return <Alert variant="error">Decision not found.</Alert>;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link
          to="/app/decisions"
          className="inline-flex items-center gap-1.5 text-xs text-surface-400 hover:text-white mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Decisions
        </Link>
        <SectionHeader
          tag={decision.business_name}
          title={decision.title}
          subtitle={decision.rationale}
          action={
            <Badge variant={decision.status === "approved" ? "success" : decision.status === "rejected" ? "danger" : "warning"} dot>
              {decision.status}
            </Badge>
          }
        />
      </div>

      {error && (
        <Alert variant="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <CardHeader title="Assign Action Item (FR-018)" icon={<Plus className="h-3.5 w-3.5" />} />
        <form onSubmit={handleAddAction} className="grid gap-3 p-4 sm:grid-cols-4">
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Action item description"
            className="sm:col-span-2 field text-xs"
          />
          <input
            type="text"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Owner (e.g. Ops Lead)"
            className="field text-xs"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="field text-xs"
          />
          <div className="sm:col-span-4 flex justify-end">
            <Button type="submit" size="sm">
              <Plus className="h-3.5 w-3.5" /> Add Action Item
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title={`Action Items (${decision.actions.length})`} icon={<CheckSquare className="h-3.5 w-3.5" />} />
        <div className="divide-y divide-surface-800">
          {decision.actions.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-xs font-medium text-surface-100">{item.title}</p>
                <p className="text-[11px] font-mono text-surface-500 mt-0.5">
                  Owner: {item.owner_name || "Unassigned"}
                  {item.due_date ? ` · Due ${item.due_date}` : ""}
                </p>
              </div>
              <select
                aria-label={`Status for ${item.title}`}
                value={item.status}
                onChange={(e) => void handleToggleStatus(item, e.target.value as ActionItem["status"])}
                className="field !w-auto !py-1 text-xs"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          ))}
          {decision.actions.length === 0 && (
            <p className="p-6 text-center text-xs text-surface-500">No action items assigned yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, Check, Layers, Sparkles } from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import { Alert, Badge, Button, Card, CardHeader, SectionHeader } from "../../components/ui";
import { useAuthStore } from "../../stores/authStore";
import type { BusinessDraftExtraction, BusinessStage } from "../../types/api";

export function CreateBusinessWizard() {
  const { organizations, activeOrgId } = useAuthStore();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [organization, setOrganization] = useState(activeOrgId || organizations[0]?.id || "");
  const [name, setName] = useState("");
  const [stage, setStage] = useState<BusinessStage>("idea");
  const [industry, setIndustry] = useState("online_grocery");
  const [location, setLocation] = useState("Bengaluru, India");
  const [currency, setCurrency] = useState("INR");
  const [baselineDate, setBaselineDate] = useState(new Date().toISOString().slice(0, 10));
  const [dataQuality, setDataQuality] = useState<"draft" | "reviewed" | "verified_subset">("draft");
  const [description, setDescription] = useState("");

  // Plain-language AI Draft Extractor (§5.2 Step 2)
  const [ideaPrompt, setIdeaPrompt] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [draftExtracted, setDraftExtracted] = useState<BusinessDraftExtraction | null>(null);

  const [ordersPerMonth, setOrdersPerMonth] = useState("1000");
  const [avgOrderValue, setAvgOrderValue] = useState("550");
  const [varCost, setVarCost] = useState("410");
  const [fixedCosts, setFixedCosts] = useState("150000");
  const [marketingSpend, setMarketingSpend] = useState("50000");
  const [initialCapital, setInitialCapital] = useState("1000000");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleExtractDraft = async () => {
    if (ideaPrompt.trim().length < 10) {
      setError("Describe your business idea in at least 10 characters first.");
      return;
    }
    setExtracting(true);
    setError(null);
    try {
      const resp = await apiClient.post<BusinessDraftExtraction>("/businesses/extract-draft/", {
        description: ideaPrompt.trim(),
        currency,
      });
      const d = resp.data;
      setDraftExtracted(d);
      setName(d.name);
      setStage((d.stage as BusinessStage) || "idea");
      setIndustry(d.industry || "online_grocery");
      setLocation(d.location || "Bengaluru, India");
      setCurrency(d.currency || "INR");
      setDescription(d.description);

      const getSugg = (k: string) => d.suggested_assumptions.find((a) => a.key === k)?.value_numeric;
      if (getSugg("orders_per_month")) setOrdersPerMonth(getSugg("orders_per_month")!);
      if (getSugg("avg_order_value")) setAvgOrderValue(getSugg("avg_order_value")!);
      if (getSugg("variable_cost_per_order")) setVarCost(getSugg("variable_cost_per_order")!);
      if (getSugg("fixed_monthly_costs")) setFixedCosts(getSugg("fixed_monthly_costs")!);
      if (getSugg("marketing_spend")) setMarketingSpend(getSugg("marketing_spend")!);
      if (getSugg("initial_capital")) setInitialCapital(getSugg("initial_capital")!);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const bizResp = await apiClient.post<{ id: string }>("/businesses/", {
        organization,
        name,
        stage,
        industry,
        location,
        currency: currency.toUpperCase(),
        baseline_date: baselineDate || null,
        data_quality: dataQuality,
        description,
      });
      const bizId = bizResp.data.id;

      const starterAssumptions = [
        { key: "orders_per_month", label: "Expected Monthly Orders", val: ordersPerMonth, unit: "orders/month", type: "demand" },
        { key: "daily_orders", label: "Average Daily Orders", val: String(Math.round(Number(ordersPerMonth || "0") / 30)), unit: "orders/day", type: "demand" },
        { key: "avg_order_value", label: "Average Order Value", val: avgOrderValue, unit: `${currency}/order`, type: "pricing" },
        { key: "variable_cost_per_order", label: "Variable Cost per Order", val: varCost, unit: `${currency}/order`, type: "cost" },
        { key: "fixed_monthly_costs", label: "Fixed Monthly Costs", val: fixedCosts, unit: `${currency}/month`, type: "cost" },
        { key: "marketing_spend", label: "Monthly Marketing Spend", val: marketingSpend, unit: `${currency}/month`, type: "cost" },
        { key: "initial_capital", label: "Initial Capital", val: initialCapital, unit: currency, type: "capital" },
      ];

      await Promise.all(
        starterAssumptions
          .filter((a) => a.val !== "")
          .map((a) => {
            const matchDraft = draftExtracted?.suggested_assumptions.find((d) => d.key === a.key);
            return apiClient.post(`/businesses/${bizId}/assumptions/`, {
              key: a.key,
              label: a.label,
              value_numeric: a.val,
              unit: a.unit,
              assumption_type: a.type,
              source_type: draftExtracted ? (matchDraft?.source_type || "illustrative") : "user_input",
              confidence: draftExtracted ? (matchDraft?.confidence || "low") : "medium",
              notes: draftExtracted ? "Extracted draft — review confirmed by founder." : "",
            });
          })
      );

      navigate(`/app/businesses/${bizId}`);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const STEPS = [
    { num: 1, label: "Identity & Stage" },
    { num: 2, label: "Context & Metadata" },
    { num: 3, label: "Starter Assumptions" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionHeader
        tag="Model Initialization"
        title="Create Business Profile"
        subtitle="Shared domain model powering both Business Idea validation and Operational Resilience simulations."
      />

      {/* AI Plain-Language Draft Assistant (Spec §5.2 Step 2) */}
      <Card>
        <CardHeader
          title="Optional: AI Draft Structure Extractor (§5.2)"
          subtitle="Describe your business idea in plain language to pre-fill a reviewable draft — AI never commits data automatically"
          icon={<Sparkles className="h-4 w-4" />}
        />
        <div className="p-4 space-y-3">
          <textarea
            rows={2}
            value={ideaPrompt}
            onChange={(e) => setIdeaPrompt(e.target.value)}
            placeholder="e.g. Launching a neighborhood online grocery delivery store in Bengaluru targeting 3000 orders per month at ₹550 AOV with 15 lakh initial capital."
            className="field resize-none text-xs"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {draftExtracted ? (
              <Badge variant="warning" dot>
                Draft extracted — verify & adjust values across Steps 1–3 before saving
              </Badge>
            ) : (
              <span className="text-[11px] text-surface-500">
                Or skip directly and configure fields manually below.
              </span>
            )}
            <Button type="button" size="sm" variant="outline" onClick={handleExtractDraft} loading={extracting}>
              <Sparkles className="h-3.5 w-3.5" /> Extract Draft Structure
            </Button>
          </div>
          {draftExtracted && draftExtracted.warnings.length > 0 && (
            <Alert variant="warning">
              {draftExtracted.warnings.join(" ")}
            </Alert>
          )}
        </div>
      </Card>

      {/* Stepper */}
      <div className="grid grid-cols-3 gap-2">
        {STEPS.map((s) => (
          <button
            key={s.num}
            type="button"
            onClick={() => setStep(s.num as 1 | 2 | 3)}
            className={`flex items-center justify-center gap-2 rounded-md py-2 px-3 text-xs font-medium border transition-colors ${
              step === s.num
                ? "bg-brand-600/15 text-brand-300 border-brand-500/40"
                : step > s.num
                  ? "bg-success-500/10 text-success-400 border-success-500/30"
                  : "bg-surface-900 text-surface-400 border-surface-700"
            }`}
          >
            {step > s.num ? <Check className="h-3.5 w-3.5" /> : <span className="font-mono">{s.num}.</span>}
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title={`Step ${step}: ${STEPS[step - 1].label}`} icon={<Layers className="h-4 w-4" />} />
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error && <Alert variant="error">{error}</Alert>}

          {step === 1 && (
            <>
              <div>
                <label htmlFor="org" className="field-label">Workspace Organization</label>
                <select id="org" value={organization} onChange={(e) => setOrganization(e.target.value)} className="field">
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="bizName" className="field-label">Business Name *</label>
                <input
                  id="bizName"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. FreshCart Express"
                  className="field"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="stage" className="field-label">Lifecycle Stage</label>
                  <select id="stage" value={stage} onChange={(e) => setStage(e.target.value as BusinessStage)} className="field">
                    <option value="idea">Idea (Pre-launch)</option>
                    <option value="planning">Planning</option>
                    <option value="pilot">Pilot</option>
                    <option value="operating">Operating (Live business)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="industry" className="field-label">Industry</label>
                  <select id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} className="field">
                    <option value="online_grocery">Online Grocery</option>
                    <option value="e_commerce">E-Commerce</option>
                    <option value="food_beverage">Food & Beverage</option>
                    <option value="retail">Retail</option>
                    <option value="saas">SaaS</option>
                    <option value="services">Services</option>
                    <option value="logistics">Logistics</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end pt-2 border-t border-surface-800">
                <Button type="button" onClick={() => setStep(2)} disabled={!name.trim()}>
                  Next: Context & Metadata <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="location" className="field-label">Location</label>
                  <input id="location" type="text" value={location} onChange={(e) => setLocation(e.target.value)} className="field" />
                </div>
                <div>
                  <label htmlFor="currency" className="field-label">Currency (ISO Code)</label>
                  <input id="currency" type="text" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="field font-mono" />
                </div>
                <div>
                  <label htmlFor="baselineDate" className="field-label">Baseline Date (§10.1)</label>
                  <input id="baselineDate" type="date" value={baselineDate} onChange={(e) => setBaselineDate(e.target.value)} className="field" />
                </div>
                <div>
                  <label htmlFor="dataQuality" className="field-label">Initial Data Quality</label>
                  <select
                    id="dataQuality"
                    value={dataQuality}
                    onChange={(e) => setDataQuality(e.target.value as "draft" | "reviewed" | "verified_subset")}
                    className="field"
                  >
                    <option value="draft">Draft</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="verified_subset">Verified Subset</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="description" className="field-label">Business Description</label>
                <textarea
                  id="description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe products, target customers, and operational dependencies..."
                  className="field resize-none"
                />
              </div>
              <div className="flex justify-between pt-2 border-t border-surface-800">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
                <Button type="button" onClick={() => setStep(3)}>
                  Next: Starter Assumptions <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <Alert variant={draftExtracted ? "warning" : "info"}>
                {draftExtracted
                  ? "Confirm your extracted draft values below before saving. Unspecified benchmarks will carry Illustrative Estimate provenance."
                  : "All manually entered starter values are tagged with User Input provenance and can be modified without altering past runs."}
              </Alert>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: "Expected Monthly Orders (orders/month)", val: ordersPerMonth, set: setOrdersPerMonth },
                  { label: `Average Order Value (${currency}/order)`, val: avgOrderValue, set: setAvgOrderValue },
                  { label: `Variable Cost per Order (${currency}/order)`, val: varCost, set: setVarCost },
                  { label: `Fixed Monthly Costs (${currency}/month)`, val: fixedCosts, set: setFixedCosts },
                  { label: `Marketing Spend (${currency}/month)`, val: marketingSpend, set: setMarketingSpend },
                  { label: `Initial Capital (${currency})`, val: initialCapital, set: setInitialCapital },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="field-label">{f.label}</label>
                    <input type="number" min="0" value={f.val} onChange={(e) => f.set(e.target.value)} className="field font-mono" />
                  </div>
                ))}
              </div>
              <div className="flex justify-between pt-2 border-t border-surface-800">
                <Button type="button" variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
                <Button type="submit" loading={submitting}>
                  <Building2 className="h-3.5 w-3.5" /> Confirm & Create Business
                </Button>
              </div>
            </>
          )}
        </form>
      </Card>
    </div>
  );
}

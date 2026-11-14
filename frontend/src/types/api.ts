export interface User {
  id: string;
  email: string;
  full_name: string;
  email_verified: boolean;
  date_joined: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string;
  member_count: number;
  current_user_role: string | null;
  created_at: string;
  updated_at: string;
}

export type BusinessStage = "idea" | "planning" | "pilot" | "operating";
export type SourceType = "user_input" | "imported" | "derived" | "illustrative";
export type ConfidenceLevel = "low" | "medium" | "high";

export interface BusinessProfile {
  id: string;
  organization: string;
  organization_name: string;
  name: string;
  stage: BusinessStage;
  industry: string;
  custom_industry: string;
  location: string;
  currency: string;
  description: string;
  baseline_date: string | null;
  data_quality: "draft" | "reviewed" | "verified_subset";
  status: "active" | "archived";
  is_demo: boolean;
  assumptions_count: number;
  components_count: number;
  created_at: string;
  updated_at: string;
}

export interface BusinessReadiness {
  business_id: string;
  completeness_pct: number;
  idea_ready: boolean;
  resilience_ready: boolean;
  missing_idea_keys: string[];
  missing_resilience_keys: string[];
  warnings: string[];
  assumptions_count: number;
  illustrative_count: number;
  components_count: number;
  dependencies_count: number;
}

export interface BusinessDraftExtraction {
  name: string;
  stage: BusinessStage;
  industry: string;
  location: string;
  currency: string;
  description: string;
  suggested_assumptions: Array<{
    key: string;
    label: string;
    value_numeric: string;
    unit: string;
    assumption_type: string;
    source_type: SourceType;
    confidence: ConfidenceLevel;
    notes: string;
  }>;
  warnings: string[];
}

export interface BusinessAssumption {
  id: string;
  business: string;
  key: string;
  label: string;
  value_numeric: string;
  unit: string;
  assumption_type: string;
  source_type: SourceType;
  source_reference: string;
  confidence: ConfidenceLevel;
  notes: string;
  valid_from: string;
}

export interface BusinessMetric {
  id: string;
  business: string;
  key: string;
  label: string;
  value_numeric: string | null;
  value_text: string;
  unit: string;
  category: string;
  source_type: SourceType;
  source_reference: string;
  confidence: ConfidenceLevel;
  notes: string;
}

export interface BusinessComponent {
  id: string;
  business: string;
  name: string;
  component_type: string;
  criticality: "critical" | "high" | "medium" | "low";
  description: string;
}

export interface Dependency {
  id: string;
  business: string;
  source_component: string;
  source_component_name: string;
  target_component: string;
  target_component_name: string;
  relationship_type: string;
  criticality: string;
  fallback_info: string;
}

export interface ScenarioTemplate {
  id: string;
  key: string;
  module: "idea" | "resilience";
  name: string;
  description: string;
  engine_key: string;
  version: string;
  parameter_schema: Record<
    string,
    {
      label: string;
      type: string;
      unit: string;
      default: number | null;
      min?: number;
      max?: number;
    }
  >;
  default_strategies: Array<{
    key: string;
    name: string;
    description: string;
  }>;
}

export interface ScenarioParameter {
  id: string;
  scenario: string;
  key: string;
  value_numeric: string | null;
  value_text: string;
  unit: string;
  override_type: "percentage" | "absolute" | "setting";
  notes: string;
}

export interface ScenarioStrategySummary {
  id: string;
  key: string;
  name: string;
  description: string;
  parameter_overrides: Record<string, unknown>;
}

export interface Scenario {
  id: string;
  business: string;
  business_name: string;
  template: string | null;
  template_key: string | null;
  template_name: string | null;
  engine_key: string | null;
  module: "idea" | "resilience";
  name: string;
  description: string;
  status: string;
  parameters: ScenarioParameter[];
  strategies?: ScenarioStrategySummary[];
  created_at: string;
}

export interface SimulationResultRow {
  id: string;
  is_baseline: boolean;
  metric_key: string;
  label: string;
  value_numeric: string;
  unit: string;
  category: string;
  formula_note: string;
}

export interface SimulationRun {
  id: string;
  business: string;
  business_name: string;
  scenario: string;
  scenario_name: string;
  module: "idea" | "resilience";
  engine_key: string;
  engine_version: string;
  currency: string;
  status: "pending" | "running" | "completed" | "failed";
  input_snapshot: {
    business?: {
      name?: string;
      stage?: string;
      currency?: string;
    };
    scenario?: {
      parameters?: Record<string, string>;
    };
  };
  assumptions_used: Array<{
    key: string;
    value: string;
    unit: string;
    source_type: SourceType;
    confidence: ConfidenceLevel;
  }>;
  warnings: string[];
  limitations: string[];
  error_message: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  results: SimulationResultRow[];
}

export interface StrategyComparisonItem {
  strategy_id: string;
  strategy_key: string;
  strategy_name: string;
  description: string;
  rank: number;
  warnings: string[];
  metrics: Array<{
    metric_key: string;
    label: string;
    value_numeric: string;
    unit: string;
    category: string;
    formula_note: string;
  }>;
}

export interface StrategyComparisonResponse {
  mode?: "strategies" | "runs";
  run_id: string;
  scenario_id: string;
  scenario_name: string;
  module: "idea" | "resilience";
  currency: string;
  engine_key: string;
  engine_version: string;
  strategies: StrategyComparisonItem[];
}

export interface RunComparisonResponse {
  mode: "runs";
  run_a: { id: string; scenario_name: string; engine_version: string; created_at: string };
  run_b: { id: string; scenario_name: string; engine_version: string; created_at: string };
  metric_diffs: Array<{
    metric_key: string;
    label: string;
    is_baseline: boolean;
    unit: string;
    run_a_value: string | null;
    run_b_value: string | null;
    delta: string | null;
    pct_change: string | null;
  }>;
  assumption_diffs: Array<{
    key: string;
    unit: string;
    run_a_value: string | null;
    run_b_value: string | null;
  }>;
  strategies: StrategyComparisonItem[];
}

export interface AIFollowUp {
  id: string;
  run: string;
  question: string;
  answer: string;
  cited_metrics: Array<{ metric_key: string; interpretation: string }>;
  limitations: string[];
  validation_warnings: string[];
  provider: string;
  model_name: string;
  prompt_version: string;
  status: "pending" | "completed" | "failed";
  error_message: string;
  created_at: string;
}

export interface AIAnalysis {
  id: string;
  run: string;
  business_id: string;
  scenario_name: string;
  provider: string;
  model_name: string;
  prompt_version: string;
  status: "pending" | "completed" | "failed";
  structured_output: {
    executive_summary: string;
    key_findings: string[];
    strategy_comparison: string[];
    recommendations: Array<{
      title: string;
      action: string;
      rationale: string;
      supporting_evidence: Array<{
        metric_key: string;
        interpretation: string;
      }>;
      risks: string[];
      confidence: ConfidenceLevel;
    }>;
    missing_information: string[];
    limitations: string[];
    suggested_next_scenarios: string[];
  };
  validation_warnings: string[];
  error_message: string;
  created_at: string;
}

export interface ActionItem {
  id: string;
  decision: string;
  title: string;
  description: string;
  owner_name: string;
  due_date: string | null;
  status: "todo" | "in_progress" | "done" | "cancelled";
  created_at: string;
}

export interface Decision {
  id: string;
  business: string;
  business_name: string;
  run: string | null;
  title: string;
  description: string;
  selected_strategy_key: string;
  rationale: string;
  status: "draft" | "approved" | "rejected";
  approved_at: string | null;
  actions: ActionItem[];
  created_at: string;
}

export interface Report {
  id: string;
  business: string;
  business_name: string;
  run: string | null;
  title: string;
  report_type: string;
  content: {
    generated_at: string;
    disclaimer: string;
    business: {
      name: string;
      stage: string;
      industry: string;
      location: string;
      currency: string;
      data_quality: string;
      is_demo: boolean;
    };
    run: {
      id: string;
      scenario_name: string;
      module: string;
      engine_key: string;
      engine_version: string;
      currency: string;
      completed_at: string | null;
      assumptions_used: SimulationRun["assumptions_used"];
      baseline_metrics: Array<{ metric_key: string; label: string; value: string; unit: string }>;
      scenario_metrics: Array<{ metric_key: string; label: string; value: string; unit: string }>;
      strategy_comparison: StrategyComparisonItem[];
      warnings: string[];
      limitations: string[];
    } | null;
    ai_analysis: {
      provider: string;
      model_name: string;
      prompt_version: string;
      structured_output: AIAnalysis["structured_output"];
      validation_warnings: string[];
    } | null;
    decisions: Array<{
      id: string;
      title: string;
      selected_strategy_key: string;
      rationale: string;
      status: string;
      actions: Array<{ title: string; owner_name: string; due_date: string | null; status: string }>;
    }>;
  };
  created_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}


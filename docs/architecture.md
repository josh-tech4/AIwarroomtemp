# AI WarRoom — Architecture Overview

## Logical Architecture

```
[ React + TypeScript SPA (Vite) ]
              |
              | HTTPS / JSON (JWT Bearer)
              v
[ Django REST Framework API (/api/v1/) ]
              |
     +--------+---------------------------------+
     | Authentication & Org-Scoped Permissions  |
     | Business Model & Dependency Services     |
     | Scenario & Simulation Orchestrator       |
     +--------+---------------------------------+
              |
              v
     [ Pure Python Simulation Engines ]
     ├── business_idea_financial_v1
     └── resilience_payment_gateway_outage_v1
              |
     +--------+---------------------------------+
     | Strategy Comparison & Persistence        |
     | AI Decision Analyst                      |
     |   ├── Context Builder (allowlist only)   |
     |   ├── LLM Provider Adapter (Gemini/Mock) |
     |   └── Pydantic Output & Evidence Check   |
     | Decisions, Action Items, Reports, Audit  |
     +--------+---------------------------------+
              |
     [ PostgreSQL ]   [ Redis + Celery (ready) ]
```

## Django Modular Apps

| App | Responsibility |
|---|---|
| `accounts` | Email-based custom `User` model, JWT auth, profile |
| `organizations` | Tenant boundary (`Organization`, `OrganizationMember`, RBAC permissions) |
| `businesses` | `BusinessProfile`, `BusinessMetric`, `BusinessAssumption`, `BusinessComponent`, `Dependency` |
| `scenarios` | Versioned `ScenarioTemplate`, `Scenario`, `ScenarioParameter` |
| `simulation` | Pure engines, `SimulationOrchestrator`, `SimulationRun` snapshots, `SimulationResult`, `Strategy`, `StrategyResult` |
| `ai_analyst` | Provider abstraction (`GeminiProvider`, `MockProvider`), context allowlist, versioned prompts, Pydantic validation |
| `decisions` | Human-owned `Decision` records & `ActionItem` tracking |
| `reports` | Snapshot-grounded `Report` generation |
| `audit` | Append-only `AuditEvent` & request ID middleware |

## Key Design Rules

1. **Tenant Isolation**: Every domain model links to an `Organization` (directly or via `BusinessProfile`). Every ViewSet filters by `organization__members__user=request.user`.
2. **Pure Simulation Engines**: Engines accept typed inputs/snapshots and return typed outputs (`Decimal` for all currency). Zero dependency on Django ORM or HTTP request objects.
3. **Immutable Run Snapshots**: `SimulationRun.input_snapshot` freezes all business assumptions and scenario parameters at run time. Later edits never mutate past runs.
4. **Grounded AI Analyst**: Passes only allowlisted fields, enforces strict prompt boundaries against prompt injection, validates output via Pydantic, and rejects unknown metric keys.


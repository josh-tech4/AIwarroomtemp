# AI WarRoom — Known Limitations & Future Roadmap

## MVP Known Limitations (R1)
1. **Single Financial Model**: Only covers monthly unit economics for an e-commerce / online grocery model.
2. **Single Disruption Scenario**: Only models payment gateway outages using a uniform 24-hour order distribution approximation.
3. **Currency**: Defaults to INR without automated multi-currency FX conversion.
4. **Synchronous Execution**: Runs execute synchronously in MVP (<2s target); Celery + Redis worker plumbing is wired for future long-running jobs.
5. **On-Screen Reports**: Generates structured JSON/on-screen reports; PDF/CSV file exports are planned for R2.
6. **Advisory AI Only**: AI explains simulation results and suggests next scenarios; all decisions require human creation and approval.

## Future Roadmap
- **R2 (Expansion)**: Multi-industry financial templates (SaaS, B2B services, retail), warehouse/supplier outage templates, one-variable sensitivity sweeps, PDF/CSV report export, scenario duplication UI.
- **R3 (Advanced Simulation)**: Monte Carlo probabilistic distributions with seeded reproducibility, peak-hour non-uniform demand curves, multi-hop component dependency cascade propagation.
- **R4 (Intelligence & Integrations)**: Verified external market benchmarks with licensing metadata, payment gateway/ERP monitoring integrations, scheduled recurring resilience drills.
- **R5 (Enterprise Governance)**: SSO (SAML/OIDC), multi-stage approval policies, immutable audit exports, custom deployment & billing controls.




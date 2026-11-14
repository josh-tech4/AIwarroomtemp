# AI WarRoom — Simulation Formulas & Assumptions

All monetary arithmetic uses Python `Decimal` (rounded to 2 decimal places for currency display). All projections are illustrative model estimates based on user-declared assumptions, not guaranteed forecasts.

---

## 1. Business Idea Financial Model (`business_idea_financial_v1`)

### Core Inputs
- `orders_per_month` (orders/month)
- `avg_order_value` (INR/order)
- `variable_cost_per_order` (INR/order)
- `fixed_monthly_costs` (INR/month)
- `marketing_spend` (INR/month)
- `initial_capital` (INR, optional — required for runway)
- `capacity_limit` (orders/month, optional)

### Formulas
```text
effective_orders   = min(orders_per_month, capacity_limit) if capacity_limit else orders_per_month
gross_sales        = effective_orders * avg_order_value
variable_costs     = effective_orders * variable_cost_per_order
contribution       = gross_sales - variable_costs
operating_result   = contribution - fixed_monthly_costs - marketing_spend
monthly_burn       = max(0, -operating_result)
runway_months      = initial_capital / monthly_burn   (only if monthly_burn > 0 and initial_capital given)
```

### Scenario Overrides
Percentage deltas (`demand_change_pct`, `price_change_pct`, `variable_cost_change_pct`, `fixed_cost_change_pct`, `marketing_change_pct`) adjust baseline inputs prior to computing scenario metrics. Both baseline and scenario metrics are returned side-by-side.

---

## 2. Payment Gateway Outage (`resilience_payment_gateway_outage_v1`)

### Core Inputs
- `daily_orders` (orders/day)
- `avg_order_value` (INR/order)
- `primary_gateway_share` (0.0 to 1.0)
- `outage_duration_hours` (hours)
- `backup_gateway_capacity` (orders/hour)
- `failover_success_rate` (0.0 to 1.0)
- `retry_success_rate` (0.0 to 1.0)
- `recapture_rate_after_recovery` (0.0 to 1.0)
- `failover_incremental_fee_per_order` (INR/order, optional)
- `retry_cost_per_order` (INR/order, optional)

### Uniform Hourly Order Approximation
```text
orders_per_hour = daily_orders / 24
affected_orders = orders_per_hour * outage_duration_hours * primary_gateway_share
affected_transaction_value = affected_orders * avg_order_value
```
> **Important Distinction**: `affected_transaction_value` is NOT automatically lost revenue. Recovery depends on the chosen response strategy.

### Strategies
1. **Wait for Recovery (`wait`)**:
   `recovered_orders = affected_orders * recapture_rate_after_recovery`
2. **Fail Over to Backup (`failover`)**:
   `max_backup_orders = backup_gateway_capacity * outage_duration_hours`
   `redirected_orders = min(affected_orders, max_backup_orders)`
   `recovered_orders = redirected_orders * failover_success_rate`
   `incremental_cost = redirected_orders * failover_incremental_fee_per_order`
3. **Queue and Retry (`queue_retry`)**:
   `recovered_orders = affected_orders * retry_success_rate`
   `incremental_cost = affected_orders * retry_cost_per_order`

For every strategy:
```text
recovered_orders <= affected_orders
unrecovered_orders = affected_orders - recovered_orders
recovered_transaction_value = recovered_orders * avg_order_value
estimated_unrecovered_transaction_value = unrecovered_orders * avg_order_value
```


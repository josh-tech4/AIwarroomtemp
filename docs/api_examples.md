# AI WarRoom — Sample API Requests

Base URL: `http://localhost:8000/api/v1/`

## 1. Health Check
```http
GET /health/
```

## 2. Register & Authenticate
```http
POST /api/v1/auth/register/
Content-Type: application/json

{
  "email": "founder@freshcart.in",
  "full_name": "Aarav Mehta",
  "password": "StrongPassword123!",
  "password_confirm": "StrongPassword123!"
}
```

## 3. Create Organization Workspace
```http
POST /api/v1/organizations/
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "FreshCart Grocery Labs",
  "description": "Online grocery e-commerce workspace"
}
```

## 4. Create Business Profile
```http
POST /api/v1/businesses/
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "organization": "<org_uuid>",
  "name": "FreshCart Express",
  "stage": "idea",
  "industry": "e_commerce",
  "location": "Bengaluru, India",
  "currency": "INR",
  "description": "30-minute neighborhood online grocery delivery."
}
```

## 5. Run Simulation
```http
POST /api/v1/simulation/runs/
Authorization: Bearer <access_token>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "scenario_id": "<scenario_uuid>",
  "strategy_keys": ["wait", "failover", "queue_retry"]
}
```

## 6. Request AI Analysis
```http
POST /api/v1/ai-analyst/analyze/
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "run_id": "<run_uuid>"
}
```


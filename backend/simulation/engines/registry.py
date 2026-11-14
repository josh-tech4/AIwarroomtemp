"""Registry mapping engine_key strings to deterministic SimulationEngine instances."""

from __future__ import annotations

from simulation.engines.base import SimulationEngine
from simulation.engines.business_idea.financial_model import BusinessIdeaFinancialEngine
from simulation.engines.resilience.payment_gateway_outage import PaymentGatewayOutageEngine

_ENGINES: dict[str, SimulationEngine] = {
    BusinessIdeaFinancialEngine.engine_key: BusinessIdeaFinancialEngine(),
    PaymentGatewayOutageEngine.engine_key: PaymentGatewayOutageEngine(),
}


def get_engine(engine_key: str) -> SimulationEngine:
    """Resolve a registered simulation engine by key."""
    engine = _ENGINES.get(engine_key)
    if engine is None:
        raise ValueError(f"Unsupported simulation engine key: '{engine_key}'.")
    return engine


def list_registered_engines() -> list[str]:
    """Return all registered engine keys."""
    return list(_ENGINES.keys())

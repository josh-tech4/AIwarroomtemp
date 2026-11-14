"""Service layer for business profiles, assumptions, and dependencies."""

from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction

from businesses.models import (
    BusinessAssumption,
    BusinessComponent,
    BusinessMetric,
    BusinessProfile,
    Dependency,
)


@transaction.atomic
def duplicate_business(business: BusinessProfile, user) -> BusinessProfile:
    """Clone a business profile with its assumptions, metrics, and topology."""
    cloned = BusinessProfile.objects.create(
        organization=business.organization,
        name=f"{business.name} (Copy)",
        stage=business.stage,
        industry=business.industry,
        description=business.description,
        location=business.location,
        currency=business.currency,
        data_quality=business.data_quality,
        is_demo=False,
        created_by=user,
    )
    for a in business.assumptions.all():
        BusinessAssumption.objects.create(
            business=cloned,
            key=a.key,
            label=a.label,
            assumption_type=a.assumption_type,
            value_numeric=a.value_numeric,
            unit=a.unit,
            source_type=a.source_type,
            source_reference=a.source_reference,
            confidence=a.confidence,
            notes=a.notes,
        )
    for m in business.metrics.all():
        BusinessMetric.objects.create(
            business=cloned,
            key=m.key,
            label=m.label,
            category=m.category,
            value_numeric=m.value_numeric,
            value_text=m.value_text,
            unit=m.unit,
            source_type=m.source_type,
            source_reference=m.source_reference,
            notes=m.notes,
        )
    comp_map: dict = {}
    for c in business.components.all():
        new_c = BusinessComponent.objects.create(
            business=cloned,
            name=c.name,
            component_type=c.component_type,
            criticality=c.criticality,
            description=c.description,
            configuration=c.configuration,
        )
        comp_map[c.id] = new_c
    for d in business.dependencies.all():
        if d.source_component_id in comp_map and d.target_component_id in comp_map:
            Dependency.objects.create(
                business=cloned,
                source_component=comp_map[d.source_component_id],
                target_component=comp_map[d.target_component_id],
                relationship_type=d.relationship_type,
                criticality=d.criticality,
                fallback_info=d.fallback_info,
            )
    return cloned


def archive_business(business: BusinessProfile) -> BusinessProfile:
    """Soft-archive a business profile so historical simulation runs remain intact."""
    business.status = BusinessProfile.Status.ARCHIVED
    business.save(update_fields=["status", "updated_at"])
    return business


def restore_business(business: BusinessProfile) -> BusinessProfile:
    """Restore an archived business profile."""
    business.status = BusinessProfile.Status.ACTIVE
    business.save(update_fields=["status", "updated_at"])
    return business


def validate_dependency(
    business: BusinessProfile,
    source_component: BusinessComponent,
    target_component: BusinessComponent,
) -> None:
    """Validate cross-business boundaries and self-loops for dependencies."""
    if source_component.business_id != business.id:
        raise ValidationError("Source component does not belong to this business.")
    if target_component.business_id != business.id:
        raise ValidationError("Target component does not belong to this business.")
    if source_component.id == target_component.id:
        raise ValidationError("A component cannot depend on itself.")


def has_dependency_cycle(
    business: BusinessProfile,
    source_id,
    target_id,
) -> bool:
    """Check whether adding source_id -> target_id creates a directed cycle."""
    visited = set()
    stack = [target_id]
    adjacency: dict = {}
    for dep in Dependency.objects.filter(business=business).values_list(
        "source_component_id", "target_component_id"
    ):
        adjacency.setdefault(dep[0], []).append(dep[1])

    while stack:
        current = stack.pop()
        if current == source_id:
            return True
        if current in visited:
            continue
        visited.add(current)
        stack.extend(adjacency.get(current, []))
    return False


def compute_business_readiness(business: BusinessProfile) -> dict:
    """Validate units, required keys, and suspicious inputs (Spec §5.2 Step 4)."""
    assumptions = {a.key: a for a in business.assumptions.all()}
    components = list(business.components.all())
    dependencies = list(business.dependencies.all())

    idea_required = [
        "orders_per_month",
        "avg_order_value",
        "variable_cost_per_order",
        "fixed_monthly_costs",
        "marketing_spend",
    ]
    resilience_required = ["daily_orders", "avg_order_value"]

    missing_idea = [k for k in idea_required if k not in assumptions]
    missing_resilience = [
        k
        for k in resilience_required
        if k not in assumptions and not (k == "daily_orders" and "orders_per_month" in assumptions)
    ]

    warnings: list[str] = []
    if "avg_order_value" in assumptions and "variable_cost_per_order" in assumptions:
        aov = assumptions["avg_order_value"].value_numeric
        var_c = assumptions["variable_cost_per_order"].value_numeric
        if var_c >= aov:
            warnings.append(
                f"Suspicious unit economics: variable_cost_per_order ({var_c}) >= "
                f"avg_order_value ({aov}) produces negative contribution margin."
            )
    if "avg_order_value" in assumptions and assumptions["avg_order_value"].value_numeric <= 0:
        warnings.append("avg_order_value should be greater than zero.")
    if "initial_capital" not in assumptions:
        warnings.append(
            "initial_capital is not set; simplified cash runway will be omitted if unprofitable."
        )

    illustrative_count = sum(1 for a in assumptions.values() if a.source_type == "illustrative")
    if assumptions and illustrative_count == len(assumptions):
        warnings.append(
            "All declared assumptions are marked 'illustrative'. Replace key items with measured "
            "or user-verified inputs."
        )

    has_pg = any(
        c.component_type == BusinessComponent.ComponentType.PAYMENT_GATEWAY for c in components
    )
    if not components:
        warnings.append("No operational components registered yet for Resilience mapping.")
    elif has_pg and not any(
        d.relationship_type == Dependency.RelationshipType.BACKUP_FOR for d in dependencies
    ):
        warnings.append("No 'backup_for' fallback dependency linked to a Payment Gateway.")

    total_checks = len(idea_required) + 2  # + daily_orders/resilience + components
    passed = (
        (len(idea_required) - len(missing_idea))
        + (1 if not missing_resilience else 0)
        + (1 if components else 0)
    )
    completeness_pct = int(round((passed / total_checks) * 100)) if total_checks else 100

    return {
        "business_id": str(business.id),
        "completeness_pct": completeness_pct,
        "idea_ready": len(missing_idea) == 0,
        "resilience_ready": len(missing_resilience) == 0,
        "missing_idea_keys": missing_idea,
        "missing_resilience_keys": missing_resilience,
        "warnings": warnings,
        "assumptions_count": len(assumptions),
        "illustrative_count": illustrative_count,
        "components_count": len(components),
        "dependencies_count": len(dependencies),
    }

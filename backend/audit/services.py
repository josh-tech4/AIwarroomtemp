"""Audit helper services."""

from __future__ import annotations

from typing import Any

from .models import AuditEvent


def record_audit_event(
    *,
    organization,
    actor,
    action: str,
    resource_type: str,
    resource_id: str,
    metadata: dict[str, Any] | None = None,
) -> AuditEvent:
    """Create an append-only audit event without logging secrets or PII."""
    return AuditEvent.objects.create(
        organization=organization,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        metadata=metadata or {},
    )

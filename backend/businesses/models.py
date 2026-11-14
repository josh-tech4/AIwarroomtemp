"""Business domain models shared by Business Idea and Resilience modules."""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class BusinessProfile(models.Model):
    """Shared profile representing either a proposed or existing business."""

    class Stage(models.TextChoices):
        IDEA = "idea", "Idea"
        PLANNING = "planning", "Planning"
        PILOT = "pilot", "Pilot"
        OPERATING = "operating", "Operating"

    class Industry(models.TextChoices):
        E_COMMERCE = "e_commerce", "E-Commerce"
        ONLINE_GROCERY = "online_grocery", "Online Grocery"
        FOOD_BEVERAGE = "food_beverage", "Food & Beverage"
        SAAS = "saas", "SaaS"
        RETAIL = "retail", "Retail"
        SERVICES = "services", "Services"
        LOGISTICS = "logistics", "Logistics"
        OTHER = "other", "Other"

    class DataQuality(models.TextChoices):
        DRAFT = "draft", "Draft"
        REVIEWED = "reviewed", "Reviewed"
        VERIFIED_SUBSET = "verified_subset", "Verified Subset"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="businesses",
    )
    name = models.CharField(max_length=255)
    stage = models.CharField(max_length=20, choices=Stage.choices, default=Stage.IDEA)
    industry = models.CharField(
        max_length=40, choices=Industry.choices, default=Industry.E_COMMERCE
    )
    custom_industry = models.CharField(max_length=100, blank=True)
    location = models.CharField(max_length=255, blank=True)
    currency = models.CharField(max_length=3, default="INR")
    description = models.TextField(blank=True)
    baseline_date = models.DateField(null=True, blank=True)
    data_quality = models.CharField(
        max_length=25, choices=DataQuality.choices, default=DataQuality.DRAFT
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    is_demo = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_businesses",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "businesses_profile"
        ordering = ["-updated_at", "name"]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["stage"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.stage})"


class SourceType(models.TextChoices):
    USER_INPUT = "user_input", "User Input"
    IMPORTED = "imported", "Imported"
    DERIVED = "derived", "Derived"
    ILLUSTRATIVE = "illustrative", "Illustrative Estimate"


class ConfidenceLevel(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"


class BusinessMetric(models.Model):
    """Structured operational or financial metric with unit and provenance."""

    class Category(models.TextChoices):
        FINANCIAL = "financial", "Financial"
        CUSTOMER = "customer", "Customer"
        OPERATIONAL = "operational", "Operational"
        RESOURCE = "resource", "Resource"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(
        BusinessProfile,
        on_delete=models.CASCADE,
        related_name="metrics",
    )
    key = models.SlugField(max_length=100)
    label = models.CharField(max_length=255, blank=True)
    value_numeric = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    value_text = models.CharField(max_length=255, blank=True)
    unit = models.CharField(max_length=64)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.FINANCIAL)
    source_type = models.CharField(
        max_length=20, choices=SourceType.choices, default=SourceType.USER_INPUT
    )
    source_reference = models.CharField(max_length=255, blank=True)
    confidence = models.CharField(
        max_length=10, choices=ConfidenceLevel.choices, default=ConfidenceLevel.MEDIUM
    )
    notes = models.TextField(blank=True)
    valid_from = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "businesses_metric"
        ordering = ["category", "key"]
        constraints = [
            models.UniqueConstraint(
                fields=["business", "key"],
                name="unique_business_metric_key",
            )
        ]
        indexes = [
            models.Index(fields=["business", "key"]),
        ]

    def __str__(self) -> str:
        val = self.value_numeric if self.value_numeric is not None else self.value_text
        return f"{self.key}={val} {self.unit}"


class BusinessAssumption(models.Model):
    """Declared modeling assumption with explicit unit, provenance, and confidence."""

    class AssumptionType(models.TextChoices):
        DEMAND = "demand", "Demand"
        PRICING = "pricing", "Pricing"
        COST = "cost", "Cost"
        CAPITAL = "capital", "Capital"
        CAPACITY = "capacity", "Capacity"
        RESILIENCE = "resilience", "Resilience"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(
        BusinessProfile,
        on_delete=models.CASCADE,
        related_name="assumptions",
    )
    key = models.SlugField(max_length=100)
    label = models.CharField(max_length=255, blank=True)
    value_numeric = models.DecimalField(max_digits=18, decimal_places=4)
    unit = models.CharField(max_length=64)
    assumption_type = models.CharField(
        max_length=20, choices=AssumptionType.choices, default=AssumptionType.OTHER
    )
    source_type = models.CharField(
        max_length=20, choices=SourceType.choices, default=SourceType.USER_INPUT
    )
    source_reference = models.CharField(max_length=255, blank=True)
    confidence = models.CharField(
        max_length=10, choices=ConfidenceLevel.choices, default=ConfidenceLevel.MEDIUM
    )
    notes = models.TextField(blank=True)
    valid_from = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "businesses_assumption"
        ordering = ["assumption_type", "key"]
        constraints = [
            models.UniqueConstraint(
                fields=["business", "key"],
                name="unique_business_assumption_key",
            )
        ]
        indexes = [
            models.Index(fields=["business", "key"]),
        ]

    def __str__(self) -> str:
        return f"{self.key}={self.value_numeric} {self.unit} ({self.source_type})"


class BusinessComponent(models.Model):
    """Operational component (payment gateway, website, warehouse, supplier, etc.)."""

    class ComponentType(models.TextChoices):
        PAYMENT_GATEWAY = "payment_gateway", "Payment Gateway"
        WEBSITE = "website", "Website / Checkout"
        WAREHOUSE = "warehouse", "Warehouse"
        SUPPLIER = "supplier", "Supplier"
        DELIVERY_PARTNER = "delivery_partner", "Delivery Partner"
        TEAM = "team", "Team"
        PROCESS = "process", "Process"
        OTHER = "other", "Other"

    class Criticality(models.TextChoices):
        CRITICAL = "critical", "Critical"
        HIGH = "high", "High"
        MEDIUM = "medium", "Medium"
        LOW = "low", "Low"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(
        BusinessProfile,
        on_delete=models.CASCADE,
        related_name="components",
    )
    name = models.CharField(max_length=255)
    component_type = models.CharField(
        max_length=30, choices=ComponentType.choices, default=ComponentType.OTHER
    )
    criticality = models.CharField(
        max_length=15, choices=Criticality.choices, default=Criticality.MEDIUM
    )
    description = models.TextField(blank=True)
    configuration = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "businesses_component"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["business", "name"],
                name="unique_business_component_name",
            )
        ]
        indexes = [
            models.Index(fields=["business", "component_type"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.component_type})"


class Dependency(models.Model):
    """Directed relationship between two BusinessComponents in the same business."""

    class RelationshipType(models.TextChoices):
        DEPENDS_ON = "depends_on", "Depends On"
        PROCESSES_FOR = "processes_for", "Processes For"
        SUPPLIES = "supplies", "Supplies"
        FULFILLS = "fulfills", "Fulfills"
        BACKUP_FOR = "backup_for", "Backup For"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(
        BusinessProfile,
        on_delete=models.CASCADE,
        related_name="dependencies",
    )
    source_component = models.ForeignKey(
        BusinessComponent,
        on_delete=models.CASCADE,
        related_name="outgoing_dependencies",
    )
    target_component = models.ForeignKey(
        BusinessComponent,
        on_delete=models.CASCADE,
        related_name="incoming_dependencies",
    )
    relationship_type = models.CharField(
        max_length=25,
        choices=RelationshipType.choices,
        default=RelationshipType.DEPENDS_ON,
    )
    criticality = models.CharField(
        max_length=15,
        choices=BusinessComponent.Criticality.choices,
        default=BusinessComponent.Criticality.HIGH,
    )
    fallback_info = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "businesses_dependency"
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                condition=~Q(source_component=F("target_component")),
                name="dependency_no_self_loop",
            ),
            models.UniqueConstraint(
                fields=["business", "source_component", "target_component", "relationship_type"],
                name="unique_business_dependency",
            ),
        ]
        indexes = [
            models.Index(fields=["business"]),
        ]

    def __str__(self) -> str:
        return (
            f"{self.source_component.name} -[{self.relationship_type}]-> "
            f"{self.target_component.name}"
        )

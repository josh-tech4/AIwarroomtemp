"""Idempotent seed command creating a clearly labeled illustrative demo workspace."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from ai_analyst.models import AIAnalysis
from ai_analyst.services import AIAnalystService
from businesses.models import (
    BusinessAssumption,
    BusinessComponent,
    BusinessMetric,
    BusinessProfile,
    ConfidenceLevel,
    Dependency,
    SourceType,
)
from decisions.models import ActionItem, Decision
from organizations.models import Organization, OrganizationMember
from scenarios.models import Scenario, ScenarioParameter
from scenarios.template_seed import ensure_default_templates
from simulation.models import SimulationRun
from simulation.orchestrator import SimulationOrchestrator

User = get_user_model()


class Command(BaseCommand):
    help = "Seed illustrative demo workspace (FreshCart Online Grocery) and scenario templates."

    @transaction.atomic
    def handle(self, *args, **options):
        templates = ensure_default_templates()
        idea_tpl = next(t for t in templates if t.key == "business_idea_stress_test")
        res_tpl = next(t for t in templates if t.key == "payment_gateway_outage")

        demo_user, created = User.objects.get_or_create(
            email="demo@aiwarroom.local",
            defaults={"full_name": "Demo Founder"},
        )
        if created:
            demo_user.set_password("DemoPass123!")
            demo_user.save()

        org, _ = Organization.objects.get_or_create(
            slug="freshcart-demo-workspace",
            defaults={
                "name": "FreshCart Demo Workspace (Illustrative)",
                "description": "Pre-seeded illustrative workspace for exploring AI WarRoom.",
                "created_by": demo_user,
            },
        )
        OrganizationMember.objects.get_or_create(
            organization=org,
            user=demo_user,
            defaults={"role": OrganizationMember.Role.OWNER},
        )

        business, _ = BusinessProfile.objects.get_or_create(
            organization=org,
            name="FreshCart Express [Illustrative Demo]",
            defaults={
                "stage": BusinessProfile.Stage.PILOT,
                "industry": BusinessProfile.Industry.ONLINE_GROCERY,
                "location": "Bengaluru, India",
                "currency": "INR",
                "baseline_date": date(2026, 11, 1),
                "description": (
                    "Illustrative neighborhood online grocery delivery service modeled with "
                    "sample assumptions for testing unit economics and payment outage resilience."
                ),
                "data_quality": BusinessProfile.DataQuality.REVIEWED,
                "is_demo": True,
                "created_by": demo_user,
            },
        )

        assumptions = [
            ("orders_per_month", "Expected Orders per Month", "3000", "orders/month", "demand"),
            ("daily_orders", "Average Daily Orders", "100", "orders/day", "demand"),
            ("avg_order_value", "Average Order Value", "550", "INR/order", "pricing"),
            ("variable_cost_per_order", "Variable Cost per Order", "410", "INR/order", "cost"),
            ("fixed_monthly_costs", "Fixed Monthly Operating Costs", "250000", "INR/month", "cost"),
            ("marketing_spend", "Monthly Marketing Spend", "120000", "INR/month", "cost"),
            ("initial_capital", "Initial Capital Reserve", "1500000", "INR", "capital"),
            (
                "capacity_limit",
                "Dark Store Monthly Order Capacity",
                "4000",
                "orders/month",
                "capacity",
            ),
        ]
        for key, label, val, unit, atype in assumptions:
            BusinessAssumption.objects.update_or_create(
                business=business,
                key=key,
                defaults={
                    "label": label,
                    "value_numeric": Decimal(val),
                    "unit": unit,
                    "assumption_type": atype,
                    "source_type": SourceType.ILLUSTRATIVE,
                    "confidence": ConfidenceLevel.MEDIUM,
                    "notes": "Illustrative demo seed assumption.",
                },
            )

        BusinessMetric.objects.get_or_create(
            business=business,
            key="observed_repeat_rate",
            defaults={
                "label": "30-Day Repeat Customer Rate",
                "value_numeric": Decimal("0.4200"),
                "unit": "ratio",
                "category": BusinessMetric.Category.CUSTOMER,
                "source_type": SourceType.ILLUSTRATIVE,
                "confidence": ConfidenceLevel.MEDIUM,
                "notes": "Illustrative pilot cohort measurement.",
            },
        )

        # Multi-tier operational topology for the 3D Spatial Twin & Flow Studio
        mobile_app, _ = BusinessComponent.objects.get_or_create(
            business=business,
            name="Mobile App (iOS/Android)",
            defaults={
                "component_type": BusinessComponent.ComponentType.WEBSITE,
                "criticality": BusinessComponent.Criticality.HIGH,
                "description": "Consumer ordering app driving 65% of daily checkout sessions.",
            },
        )
        checkout, _ = BusinessComponent.objects.get_or_create(
            business=business,
            name="Storefront Checkout App",
            defaults={
                "component_type": BusinessComponent.ComponentType.WEBSITE,
                "criticality": BusinessComponent.Criticality.CRITICAL,
                "description": "Primary web cart & checkout orchestration endpoint.",
            },
        )
        order_engine, _ = BusinessComponent.objects.get_or_create(
            business=business,
            name="Order & Routing Engine",
            defaults={
                "component_type": BusinessComponent.ComponentType.PROCESS,
                "criticality": BusinessComponent.Criticality.CRITICAL,
                "description": (
                    "Validates inventory holds, payment capture, and dark store routing."
                ),
            },
        )
        primary_pg, _ = BusinessComponent.objects.get_or_create(
            business=business,
            name="Primary Payment Gateway",
            defaults={
                "component_type": BusinessComponent.ComponentType.PAYMENT_GATEWAY,
                "criticality": BusinessComponent.Criticality.CRITICAL,
                "description": "Processes ~85% of prepaid UPI and card checkouts.",
            },
        )
        backup_pg, _ = BusinessComponent.objects.get_or_create(
            business=business,
            name="Backup Payment Gateway",
            defaults={
                "component_type": BusinessComponent.ComponentType.PAYMENT_GATEWAY,
                "criticality": BusinessComponent.Criticality.HIGH,
                "description": "Secondary failover processor capped at configured burst capacity.",
            },
        )
        warehouse, _ = BusinessComponent.objects.get_or_create(
            business=business,
            name="Bengaluru Dark Store",
            defaults={
                "component_type": BusinessComponent.ComponentType.WAREHOUSE,
                "criticality": BusinessComponent.Criticality.HIGH,
                "description": "Automated micro-fulfillment zone with 4,000 orders/month cap.",
            },
        )
        supplier, _ = BusinessComponent.objects.get_or_create(
            business=business,
            name="Fresh Produce Supplier",
            defaults={
                "component_type": BusinessComponent.ComponentType.SUPPLIER,
                "criticality": BusinessComponent.Criticality.MEDIUM,
                "description": "Morning cold-chain produce vendor replenishing dark store SKUs.",
            },
        )
        delivery, _ = BusinessComponent.objects.get_or_create(
            business=business,
            name="Last-Mile Fleet Dispatch",
            defaults={
                "component_type": BusinessComponent.ComponentType.DELIVERY_PARTNER,
                "criticality": BusinessComponent.Criticality.HIGH,
                "description": "Electric 2-wheeler hyperlocal dispatch riders.",
            },
        )

        deps_spec = [
            (
                mobile_app,
                checkout,
                Dependency.RelationshipType.DEPENDS_ON,
                BusinessComponent.Criticality.HIGH,
                "",
            ),
            (
                checkout,
                order_engine,
                Dependency.RelationshipType.PROCESSES_FOR,
                BusinessComponent.Criticality.CRITICAL,
                "",
            ),
            (
                checkout,
                primary_pg,
                Dependency.RelationshipType.DEPENDS_ON,
                BusinessComponent.Criticality.CRITICAL,
                "Failover to Backup Payment Gateway up to configured capacity.",
            ),
            (
                backup_pg,
                primary_pg,
                Dependency.RelationshipType.BACKUP_FOR,
                BusinessComponent.Criticality.HIGH,
                "Hot standby processor",
            ),
            (
                order_engine,
                warehouse,
                Dependency.RelationshipType.FULFILLS,
                BusinessComponent.Criticality.HIGH,
                "",
            ),
            (
                supplier,
                warehouse,
                Dependency.RelationshipType.SUPPLIES,
                BusinessComponent.Criticality.MEDIUM,
                "",
            ),
            (
                warehouse,
                delivery,
                Dependency.RelationshipType.FULFILLS,
                BusinessComponent.Criticality.HIGH,
                "",
            ),
        ]
        for src, tgt, rel, crit, fb in deps_spec:
            Dependency.objects.get_or_create(
                business=business,
                source_component=src,
                target_component=tgt,
                relationship_type=rel,
                defaults={"criticality": crit, "fallback_info": fb},
            )

        idea_scen, _ = Scenario.objects.get_or_create(
            business=business,
            name="Launch Demand -30% Stress Test",
            defaults={
                "template": idea_tpl,
                "module": "idea",
                "description": "What if initial order demand is 30% lower than modeled?",
                "created_by": demo_user,
            },
        )
        ScenarioParameter.objects.get_or_create(
            scenario=idea_scen,
            key="demand_change_pct",
            defaults={
                "value_numeric": Decimal("-30"),
                "unit": "%",
                "override_type": ScenarioParameter.OverrideType.PERCENTAGE,
            },
        )

        res_scen, _ = Scenario.objects.get_or_create(
            business=business,
            name="2-Hour Primary Payment Gateway Outage",
            defaults={
                "template": res_tpl,
                "module": "resilience",
                "description": "Compare Wait, Failover, and Queue & Retry during a 2-hour outage.",
                "created_by": demo_user,
            },
        )
        ScenarioParameter.objects.get_or_create(
            scenario=res_scen,
            key="outage_duration_hours",
            defaults={
                "value_numeric": Decimal("2"),
                "unit": "hours",
                "override_type": ScenarioParameter.OverrideType.ABSOLUTE,
            },
        )

        # Ensure starter immutable runs + AI analysis exist once so dashboard & reports aren't bare
        if not SimulationRun.objects.filter(business=business).exists():
            SimulationOrchestrator.execute_run(
                scenario=idea_scen, user=demo_user, idempotency_key="demo-seed-idea-v1"
            )
            SimulationOrchestrator.execute_run(
                scenario=res_scen, user=demo_user, idempotency_key="demo-seed-res-v1"
            )

        for r in SimulationRun.objects.filter(
            business=business, status=SimulationRun.Status.COMPLETED
        ):
            if not AIAnalysis.objects.filter(run=r).exists():
                AIAnalystService.analyze_run(run=r, user=demo_user)

        res_run = SimulationRun.objects.filter(
            business=business, scenario=res_scen, status=SimulationRun.Status.COMPLETED
        ).first()
        if res_run and not Decision.objects.filter(business=business).exists():
            dec = Decision.objects.create(
                business=business,
                run=res_run,
                title="Enable automatic failover routing to Backup Payment Gateway",
                selected_strategy_key="failover",
                rationale=(
                    "Sample illustrative decision: failover recovers the highest transaction "
                    "share compared with passive waiting at modest incremental gateway fee."
                ),
                status=Decision.Status.DRAFT,
                created_by=demo_user,
            )
            ActionItem.objects.create(
                decision=dec,
                title="Validate secondary gateway burst capacity & webhook retry SLA",
                owner_name="Payments Lead",
                status=ActionItem.Status.TODO,
            )

        self.stdout.write(
            self.style.SUCCESS(
                "Seeded demo workspace: demo@aiwarroom.local / DemoPass123! "
                "(FreshCart Express [Illustrative Demo])"
            )
        )

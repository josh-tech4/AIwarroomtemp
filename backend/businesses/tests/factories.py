"""Test factories for businesses app."""

from decimal import Decimal

import factory

from accounts.tests.factories import UserFactory
from businesses.models import (
    BusinessAssumption,
    BusinessComponent,
    BusinessMetric,
    BusinessProfile,
    Dependency,
)
from organizations.tests.factories import OrganizationFactory


class BusinessProfileFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = BusinessProfile

    organization = factory.SubFactory(OrganizationFactory)
    name = factory.Sequence(lambda n: f"Grocery Store {n}")
    stage = BusinessProfile.Stage.IDEA
    industry = BusinessProfile.Industry.ONLINE_GROCERY
    location = "Bengaluru, India"
    currency = "INR"
    description = "Online grocery delivery pilot."
    created_by = factory.SubFactory(UserFactory)


class BusinessMetricFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = BusinessMetric

    business = factory.SubFactory(BusinessProfileFactory)
    key = factory.Sequence(lambda n: f"metric_{n}")
    value_numeric = Decimal("100.00")
    unit = "INR"
    category = BusinessMetric.Category.FINANCIAL


class BusinessAssumptionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = BusinessAssumption

    business = factory.SubFactory(BusinessProfileFactory)
    key = factory.Sequence(lambda n: f"assumption_{n}")
    value_numeric = Decimal("500.00")
    unit = "INR/order"
    assumption_type = BusinessAssumption.AssumptionType.PRICING


class BusinessComponentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = BusinessComponent

    business = factory.SubFactory(BusinessProfileFactory)
    name = factory.Sequence(lambda n: f"Component {n}")
    component_type = BusinessComponent.ComponentType.PAYMENT_GATEWAY
    criticality = BusinessComponent.Criticality.CRITICAL


class DependencyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Dependency

    business = factory.SubFactory(BusinessProfileFactory)
    source_component = factory.SubFactory(BusinessComponentFactory)
    target_component = factory.SubFactory(BusinessComponentFactory)
    relationship_type = Dependency.RelationshipType.DEPENDS_ON

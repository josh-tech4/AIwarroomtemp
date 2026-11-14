"""Test factories for organizations app."""

import factory
from django.utils.text import slugify

from accounts.tests.factories import UserFactory
from organizations.models import Organization, OrganizationMember


class OrganizationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Organization

    name = factory.Sequence(lambda n: f"Test Org {n}")
    slug = factory.LazyAttribute(lambda o: slugify(o.name))
    created_by = factory.SubFactory(UserFactory)


class OrganizationMemberFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = OrganizationMember

    organization = factory.SubFactory(OrganizationFactory)
    user = factory.SubFactory(UserFactory)
    role = OrganizationMember.Role.ANALYST

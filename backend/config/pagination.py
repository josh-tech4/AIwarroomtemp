"""Standard pagination for AI WarRoom API."""

from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """Consistent paginated response wrapper."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

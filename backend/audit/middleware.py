"""Audit middleware — attaches request_id and logs basic security context."""

import uuid


class AuditMiddleware:
    """Attach a unique request ID to every HTTP request and response."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = str(uuid.uuid4())
        response = self.get_response(request)
        response["X-Request-ID"] = request.request_id
        return response

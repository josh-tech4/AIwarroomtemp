"""Health check endpoint."""

from django.db import connection
from django.http import JsonResponse
from django.urls import path


def health_check(request):
    """Return service health status."""
    db_status = "ok"
    try:
        connection.ensure_connection()
    except Exception:
        db_status = "error"

    status_code = 200 if db_status == "ok" else 503
    return JsonResponse(
        {
            "status": "ok" if db_status == "ok" else "degraded",
            "components": {
                "database": db_status,
                "api": "ok",
            },
            "version": "1.0.0",
        },
        status=status_code,
    )


urlpatterns = [
    path("", health_check, name="health-check"),
]

"""Custom DRF exception handler for consistent error responses."""

import logging

from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Return consistent error response format:
    {
        "error": {
            "code": "...",
            "message": "...",
            "details": {...}
        }
    }
    """
    response = exception_handler(exc, context)

    if response is not None:
        details = (
            response.data
            if isinstance(response.data, dict)
            else {"non_field_errors": response.data}
        )
        error_data = {
            "error": {
                "code": _get_error_code(response.status_code),
                "message": _extract_message(response.data),
                "details": details,
            }
        }
        response.data = error_data
    else:
        logger.exception("Unhandled exception in view: %s", context.get("view"))

    return response


def _get_error_code(status_code: int) -> str:
    codes = {
        400: "validation_error",
        401: "authentication_required",
        403: "permission_denied",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
        429: "rate_limit_exceeded",
        500: "internal_server_error",
    }
    return codes.get(status_code, "error")


def _extract_message(data) -> str:
    if isinstance(data, dict):
        if "detail" in data:
            return str(data["detail"])
        return "Validation failed. See details."
    if isinstance(data, list) and data:
        return str(data[0])
    return str(data)

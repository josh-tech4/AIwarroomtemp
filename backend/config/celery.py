"""Celery configuration for AI WarRoom.

Celery is architecture-ready but optional for the MVP.
Fast deterministic simulations run synchronously.
Background tasks (AI analysis, PDF export) can use this when added.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

app = Celery("aiwarroom")

# Load config from Django settings using CELERY_ namespace
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks in all installed apps
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Debug task for verifying Celery worker connectivity."""
    print(f"Request: {self.request!r}")  # noqa: T201

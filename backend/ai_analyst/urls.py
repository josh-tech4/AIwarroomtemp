"""URL patterns for ai_analyst app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"analyses", views.AIAnalysisViewSet, basename="ai-analysis")
router.register(r"questions", views.AIFollowUpViewSet, basename="ai-followup")

urlpatterns = [
    path("analyze/", views.AnalyzeSimulationRunView.as_view(), name="ai-analyze"),
    path("ask/", views.AskFollowUpView.as_view(), name="ai-ask"),
    path("", include(router.urls)),
]

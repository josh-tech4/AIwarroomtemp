"""AI-assisted draft structure extractor for Business Idea onboarding (Spec §5.2 Step 2).

IMPORTANT: Outputs are strictly unpersisted illustrative suggestions.
The user MUST review, edit, and explicitly confirm every field before saving.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from django.conf import settings
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class DraftAssumptionSuggestion(BaseModel):
    key: str
    label: str
    value_numeric: str
    unit: str
    assumption_type: str
    source_type: str = "illustrative"
    confidence: str = "low"
    notes: str = "AI-extracted draft estimate — confirm before simulating."


class BusinessDraftExtraction(BaseModel):
    name: str = Field(..., min_length=1)
    stage: str = "idea"
    industry: str = "online_grocery"
    location: str = "India"
    currency: str = "INR"
    description: str
    suggested_assumptions: list[DraftAssumptionSuggestion]
    warnings: list[str] = Field(default_factory=list)


def _extract_number_near(text: str, patterns: list[str], default: str) -> tuple[str, bool]:
    """Safely find numeric hints matching regexes, scaling lakh/crore/k suffixes cleanly."""
    for pat in patterns:
        match = re.search(pat, text, flags=re.IGNORECASE)
        if match:
            raw_num = match.group(1).replace(",", "")
            suffix = (match.group(2) if match.lastindex and match.lastindex >= 2 else "") or ""
            try:
                val = float(raw_num)
                suf = suffix.lower().strip()
                if suf in ("k", "thousand"):
                    val *= 1_000
                elif suf in ("lakh", "lakhs", "lac", "l"):
                    val *= 100_000
                elif suf in ("cr", "crore", "crores"):
                    val *= 10_000_000
                return str(int(round(val))), True
            except ValueError:
                continue
    return default, False


def _deterministic_extract_draft(description: str, currency: str = "INR") -> dict[str, Any]:
    """Zero-cost deterministic fallback draft extractor when offline or AI_PROVIDER=mock."""
    text = description.strip()
    lower = text.lower()

    industry = "e_commerce"
    if any(k in lower for k in ("grocery", "dark store", "produce", "milk", "vegetable")):
        industry = "online_grocery"
    elif any(k in lower for k in ("saas", "software", "subscription", "b2b app")):
        industry = "saas"
    elif any(k in lower for k in ("food", "restaurant", "cafe", "kitchen", "bakery")):
        industry = "food_beverage"
    elif any(k in lower for k in ("logistics", "courier", "fleet", "delivery partner")):
        industry = "logistics"

    stage = "idea"
    if any(k in lower for k in ("already operating", "live", "existing", "running store")):
        stage = "operating"
    elif any(k in lower for k in ("pilot", "beta", "trial")):
        stage = "pilot"
    elif any(k in lower for k in ("plan", "planning", "preparing")):
        stage = "planning"

    location = "Bengaluru, India"
    for city in ("Bengaluru", "Bangalore", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"):
        if city.lower() in lower:
            location = f"{city}, India"
            break

    orders_val, orders_found = _extract_number_near(
        text,
        [
            r"(\d[\d,\.]*)\s*(k|thousand|lakh|lakhs)?\s*orders?\s*(?:/|per)?\s*month",
            r"(\d[\d,\.]*)\s*(k|thousand)?\s*monthly\s*orders",
        ],
        "2000",
    )
    aov_val, aov_found = _extract_number_near(
        text,
        [
            r"(?:aov|average order value|ticket size|order value)\s*"
            r"(?:of|around|is|=|:)?\s*(?:₹|rs\.?|inr|\$)?\s*(\d[\d,\.]*)\s*(k)?",
            r"(?:₹|rs\.?|inr)\s*(\d[\d,\.]*)\s*(?:per\s*order|/order|aov)",
        ],
        "550",
    )
    cap_val, cap_found = _extract_number_near(
        text,
        [
            r"(?:capital|budget|seed|starting with|invest(?:ing)?)\s*(?:of|around|is)?\s*"
            r"(?:₹|rs\.?|inr|\$)?\s*(\d[\d,\.]*)\s*(lakh|lakhs|lac|cr|crore|crores|k|thousand)?",
            r"(?:₹|rs\.?|inr|\$)?\s*(\d[\d,\.]*)\s*(lakh|lakhs|lac|cr|crore|crores|k|thousand)?\s*"
            r"(?:starting\s+capital|initial\s+capital|seed\s+capital|capital|budget)",
        ],
        "1000000",
    )

    first_words = [w.strip(".,:;!?") for w in text.split()[:5] if w.strip(".,:;!?")]
    suggested_name = " ".join(first_words).title() if first_words else "Draft Business Model"
    if len(suggested_name) > 48:
        suggested_name = suggested_name[:45].rstrip() + "..."

    assumptions = [
        DraftAssumptionSuggestion(
            key="orders_per_month",
            label="Expected Orders per Month",
            value_numeric=orders_val,
            unit="orders/month",
            assumption_type="demand",
            source_type="user_input" if orders_found else "illustrative",
            confidence="medium" if orders_found else "low",
            notes="Extracted from description"
            if orders_found
            else "Illustrative placeholder — adjust to your target monthly volume.",
        ),
        DraftAssumptionSuggestion(
            key="avg_order_value",
            label="Average Order Value",
            value_numeric=aov_val,
            unit=f"{currency}/order",
            assumption_type="pricing",
            source_type="user_input" if aov_found else "illustrative",
            confidence="medium" if aov_found else "low",
            notes="Extracted from description"
            if aov_found
            else "Illustrative placeholder — confirm expected basket value.",
        ),
        DraftAssumptionSuggestion(
            key="variable_cost_per_order",
            label="Variable Cost per Order",
            value_numeric=str(max(1, int(round(float(aov_val) * 0.72)))),
            unit=f"{currency}/order",
            assumption_type="cost",
            source_type="illustrative",
            confidence="low",
            notes="Illustrative ~72% COGS/fulfillment benchmark — replace with real vendor quote.",
        ),
        DraftAssumptionSuggestion(
            key="fixed_monthly_costs",
            label="Fixed Monthly Operating Costs",
            value_numeric="200000",
            unit=f"{currency}/month",
            assumption_type="cost",
            source_type="illustrative",
            confidence="low",
            notes="Illustrative placeholder for rent, payroll, and SaaS — verify actual costs.",
        ),
        DraftAssumptionSuggestion(
            key="marketing_spend",
            label="Monthly Marketing Spend",
            value_numeric="80000",
            unit=f"{currency}/month",
            assumption_type="cost",
            source_type="illustrative",
            confidence="low",
            notes="Illustrative placeholder for customer acquisition spend.",
        ),
        DraftAssumptionSuggestion(
            key="initial_capital",
            label="Initial Capital Reserve",
            value_numeric=cap_val,
            unit=currency,
            assumption_type="capital",
            source_type="user_input" if cap_found else "illustrative",
            confidence="medium" if cap_found else "low",
            notes="Extracted from description"
            if cap_found
            else "Illustrative initial capital — update before computing runway.",
        ),
    ]

    return BusinessDraftExtraction(
        name=f"{suggested_name} [Draft]",
        stage=stage,
        industry=industry,
        location=location,
        currency=currency,
        description=text,
        suggested_assumptions=assumptions,
        warnings=[
            (
                "Draft structure extracted from plain text. Unspecified figures use low-confidence "
                "illustrative placeholders."
            ),
            "Review and confirm every field before saving or running financial simulations.",
        ],
    ).model_dump()


def extract_business_draft(description: str, currency: str = "INR") -> dict[str, Any]:
    """Extract a reviewable business draft structure via Gemini if enabled, or safe fallback."""
    provider_name = getattr(settings, "AI_PROVIDER", "mock").lower()
    api_key = getattr(settings, "GEMINI_API_KEY", "")
    if provider_name == "gemini" and api_key:
        try:
            import google.generativeai as genai

            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(
                model_name=getattr(settings, "AI_MODEL_NAME", "gemini-2.0-flash"),
                system_instruction=(
                    "Extract a structured business draft JSON matching BusinessDraftExtraction. "
                    "Never mark unverified numbers as verified facts; mark all guessed values "
                    "with source_type='illustrative' and confidence='low'. "
                    f"Use currency='{currency}'."
                ),
            )
            prompt = (
                "Extract structured draft JSON (keys: name, stage in "
                "[idea,planning,pilot,operating], industry in "
                "[online_grocery,e_commerce,food_beverage,saas,retail,services,logistics,other], "
                "location, currency, description, suggested_assumptions[{key,label,value_numeric,"
                "unit,assumption_type,source_type,confidence,notes}], warnings) from:\n"
                f"<untrusted_description>{description[:1500]}</untrusted_description>"
            )
            resp = model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json", "temperature": 0.1},
                request_options={"timeout": 15},
            )
            if getattr(resp, "text", None):
                validated = BusinessDraftExtraction.model_validate(json.loads(resp.text))
                return validated.model_dump()
        except Exception as exc:
            logger.warning("Gemini draft extraction fallback used: %s", type(exc).__name__)

    return _deterministic_extract_draft(description=description, currency=currency)

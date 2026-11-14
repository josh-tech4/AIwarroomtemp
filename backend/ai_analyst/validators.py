"""Output schema, evidence-key, and numeric consistency validators for AI Analyst."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from pydantic import ValidationError

from ai_analyst.output_schemas import DecisionAnalysis, FollowUpResponse


class EvidenceValidationError(Exception):
    """Raised when AI output is malformed or cites unverified metric keys."""


@dataclass
class ValidationResult:
    analysis: DecisionAnalysis
    warnings: list[str]


@dataclass
class FollowUpValidationResult:
    response: FollowUpResponse
    warnings: list[str]


def _strip_json_fences(raw_text: str) -> str:
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def validate_ai_output(
    *,
    raw_text: str,
    allowed_metric_keys: set[str],
    metric_values: dict[str, str],
) -> ValidationResult:
    """
    Parse JSON, validate against DecisionAnalysis Pydantic schema, reject unknown metric keys,
    and verify numeric claims in evidence interpretations against persisted values.
    """
    cleaned = _strip_json_fences(raw_text)
    try:
        parsed_json = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise EvidenceValidationError(f"Malformed JSON returned by AI provider: {exc}") from exc

    try:
        analysis = DecisionAnalysis.model_validate(parsed_json)
    except ValidationError as exc:
        raise EvidenceValidationError(
            f"AI output failed DecisionAnalysis schema validation: {exc}"
        ) from exc

    unknown_keys: list[str] = []
    warnings: list[str] = []

    for rec in analysis.recommendations:
        for ev in rec.supporting_evidence:
            if ev.metric_key not in allowed_metric_keys:
                unknown_keys.append(ev.metric_key)
                continue
            expected_raw = metric_values.get(ev.metric_key)
            if expected_raw is not None:
                warning = _check_numeric_consistency(
                    metric_key=ev.metric_key,
                    expected_raw=expected_raw,
                    interpretation=ev.interpretation,
                )
                if warning:
                    warnings.append(warning)

    if unknown_keys:
        raise EvidenceValidationError(
            "AI cited unknown metric keys not present in simulation context: "
            f"{sorted(set(unknown_keys))}"
        )

    return ValidationResult(analysis=analysis, warnings=warnings)


def _check_numeric_consistency(
    *, metric_key: str, expected_raw: str, interpretation: str
) -> str | None:
    """Flag when an interpretation states a number that disagrees with persisted output."""
    try:
        expected = Decimal(expected_raw)
    except (InvalidOperation, ValueError):
        return None

    # Find decimal/integer tokens in interpretation text (strip commas first)
    tokens = re.findall(r"-?\d[\d,]*(?:\.\d+)?", interpretation)
    if not tokens:
        return None

    parsed_nums: list[Decimal] = []
    for tok in tokens:
        try:
            parsed_nums.append(Decimal(tok.replace(",", "")))
        except InvalidOperation:
            continue

    if not parsed_nums:
        return None

    # Check if expected (within tiny rounding diff 0.5) appears among cited numbers
    for num in parsed_nums:
        if abs(num - expected) <= Decimal("0.5"):
            return None

    return (
        f"Numeric consistency note for '{metric_key}': persisted value is {expected}, "
        f"interpretation mentioned {[str(n) for n in parsed_nums]}."
    )


def validate_followup_output(
    *,
    raw_text: str,
    allowed_metric_keys: set[str],
    metric_values: dict[str, str],
) -> FollowUpValidationResult:
    """Validate FollowUpResponse JSON against schema and allowed simulation metric keys."""
    cleaned = _strip_json_fences(raw_text)
    try:
        parsed_json = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise EvidenceValidationError(f"Malformed JSON returned by AI provider: {exc}") from exc

    try:
        response = FollowUpResponse.model_validate(parsed_json)
    except ValidationError as exc:
        raise EvidenceValidationError(
            f"AI output failed FollowUpResponse schema validation: {exc}"
        ) from exc

    unknown_keys: list[str] = []
    warnings: list[str] = []
    for ev in response.cited_metrics:
        if ev.metric_key not in allowed_metric_keys:
            unknown_keys.append(ev.metric_key)
            continue
        expected_raw = metric_values.get(ev.metric_key)
        if expected_raw is not None:
            warning = _check_numeric_consistency(
                metric_key=ev.metric_key,
                expected_raw=expected_raw,
                interpretation=ev.interpretation,
            )
            if warning:
                warnings.append(warning)

    if unknown_keys:
        raise EvidenceValidationError(
            "AI follow-up cited unknown metric keys not present in simulation context: "
            f"{sorted(set(unknown_keys))}"
        )

    return FollowUpValidationResult(response=response, warnings=warnings)

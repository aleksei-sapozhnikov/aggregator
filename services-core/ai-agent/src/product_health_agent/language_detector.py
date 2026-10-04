"""Request-language detection for agent presentation text."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from lingua import Language, LanguageDetector, LanguageDetectorBuilder

ENGLISH_FALLBACK_CODE = "en"
ENGLISH_FALLBACK_NAME = "English"
MINIMUM_RELATIVE_DISTANCE = 0.05


@dataclass(frozen=True)
class DetectedLanguage:
    code: str
    name: str
    confidence: float | None = None
    is_fallback: bool = False


def detect_response_language(text: str) -> DetectedLanguage:
    normalized = text.strip()
    if not normalized:
        return _english_fallback()

    try:
        detector = _detector()
        language = detector.detect_language_of(normalized)
    except (RuntimeError, ValueError):
        return _english_fallback()

    if language is None:
        return _english_fallback()

    return DetectedLanguage(
        code=_language_code(language),
        name=_language_name(language),
        confidence=_confidence_for_language(detector, normalized, language),
    )


@lru_cache(maxsize=1)
def _detector() -> LanguageDetector:
    return (
        LanguageDetectorBuilder.from_all_spoken_languages()
        .with_minimum_relative_distance(MINIMUM_RELATIVE_DISTANCE)
        .build()
    )


def _english_fallback() -> DetectedLanguage:
    return DetectedLanguage(
        code=ENGLISH_FALLBACK_CODE,
        name=ENGLISH_FALLBACK_NAME,
        confidence=None,
        is_fallback=True,
    )


def _language_code(language: Language) -> str:
    return language.iso_code_639_1.name.lower()


def _language_name(language: Language) -> str:
    return language.name.replace("_", " ").title()


def _confidence_for_language(
    detector: LanguageDetector,
    text: str,
    language: Language,
) -> float | None:
    for confidence in detector.compute_language_confidence_values(text):
        if confidence.language == language:
            return confidence.value
    return None

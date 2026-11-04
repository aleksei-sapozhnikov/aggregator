from product_health_agent.language_detector import detect_response_language


def test_detects_english_question() -> None:
    language = detect_response_language("What is broken now?")

    assert language.code == "en"
    assert language.name == "English"
    assert language.is_fallback is False


def test_detects_russian_question() -> None:
    language = detect_response_language("Что сейчас сломано?")

    assert language.code == "ru"
    assert language.name == "Russian"
    assert language.is_fallback is False


def test_detects_german_question() -> None:
    language = detect_response_language("Was ist jetzt kaputt?")

    assert language.code == "de"
    assert language.name == "German"
    assert language.is_fallback is False


def test_detects_spanish_question() -> None:
    language = detect_response_language("¿Qué está roto ahora?")

    assert language.code == "es"
    assert language.name == "Spanish"
    assert language.is_fallback is False


def test_detects_japanese_question() -> None:
    language = detect_response_language("今何が壊れていますか？")

    assert language.code == "ja"
    assert language.name == "Japanese"
    assert language.is_fallback is False


def test_uncertain_detection_falls_back_to_english() -> None:
    language = detect_response_language("ok")

    assert language.code == "en"
    assert language.name == "English"
    assert language.is_fallback is True

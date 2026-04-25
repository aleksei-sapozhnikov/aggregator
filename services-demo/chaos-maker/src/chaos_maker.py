#
# Demo-only chaos maker.
#
# Periodically forces random demo services into a DOWN state for a short window,
# then restores them back to UP.
#
# Targets are discovered from catalog signals API payload, by deriving
# control URLs from signal URLs.
#
# Configuration is controlled via environment variables:
#   - CHAOS_ENABLED:           "true" / "false" (default: false)
#   - CHAOS_MIN_INTERVAL:      e.g. 30s, 5m (default: 30s)
#   - CHAOS_MAX_INTERVAL:      e.g. 90s, 10m (default: 90s)
#   - CHAOS_MIN_DURATION:      e.g. 20s (default: 20s)
#   - CHAOS_MAX_DURATION:      e.g. 45s (default: 45s)
#   - CHAOS_MAX_CONCURRENT:    integer (default: 2)
#   - CHAOS_ALWAYS_BROKEN:     "true" / "false" (default: false)
#   - CATALOG_SIGNALS_URL:     URL to catalog signals API
#
# Intended for demo and testing only.
#

import logging
import os
import random
import time
from dataclasses import dataclass
from typing import Dict, Iterable, List, Set
from urllib.parse import urlsplit

import requests
import yaml

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
logger = logging.getLogger("chaos-maker")


@dataclass(frozen=True)
class ChaosConfig:
    enabled: bool
    min_interval: float
    max_interval: float
    min_duration: float
    max_duration: float
    max_concurrent: int
    signals_source: str
    always_broken: bool


@dataclass(frozen=True)
class ChaosTarget:
    control_url: str
    health_url: str


def parse_duration(value: str | None) -> float:
    """
    Parse durations like "250ms", "10s", "5m", "1h".
    Falls back to float seconds for plain numeric strings.
    """
    if value is None:
        return 0.0

    text = value.strip().lower()
    if not text:
        return 0.0

    if text.endswith("ms"):
        return float(text[:-2]) / 1000.0
    if text.endswith("s"):
        return float(text[:-1])
    if text.endswith("m"):
        return float(text[:-1]) * 60.0
    if text.endswith("h"):
        return float(text[:-1]) * 3600.0

    return float(text)


def load_config() -> ChaosConfig:
    return ChaosConfig(
        enabled=os.getenv("CHAOS_ENABLED", "false").strip().lower() == "true",
        min_interval=parse_duration(os.getenv("CHAOS_MIN_INTERVAL", "30s")),
        max_interval=parse_duration(os.getenv("CHAOS_MAX_INTERVAL", "90s")),
        min_duration=parse_duration(os.getenv("CHAOS_MIN_DURATION", "20s")),
        max_duration=parse_duration(os.getenv("CHAOS_MAX_DURATION", "45s")),
        max_concurrent=int(os.getenv("CHAOS_MAX_CONCURRENT", "2")),
        signals_source=os.getenv(
            "CATALOG_SIGNALS_URL",
            "http://catalog:8080/api/signals/http-poll",
        ),
        always_broken=os.getenv("CHAOS_ALWAYS_BROKEN", "false").strip().lower() == "true",
    )


def jitter(min_value: float, max_value: float) -> float:
    if min_value > max_value:
        min_value, max_value = max_value, min_value
    if min_value == max_value:
        return min_value
    return random.uniform(min_value, max_value)


def to_control_url(url: str) -> str:
    """
    Convert a check URL into a control URL that supports /set-health/<state>.

    Examples:
      - http://svc:8080/health        -> http://svc:8080/set-health
      - http://svc:8080/health/2      -> http://svc:8080/set-health/2
      - http://svc:8080/api/health    -> http://svc:8080/api/set-health
    """
    parsed = urlsplit(url)
    segments = [segment for segment in (parsed.path or "").split("/") if segment]

    for index in range(len(segments) - 1, -1, -1):
        if segments[index] == "health":
            segments[index] = "set-health"
            path = "/" + "/".join(segments)
            return f"{parsed.scheme}://{parsed.netloc}{path}"

    # Fallback for non-standard paths: append /set-health after trimming a trailing slash.
    path = (parsed.path or "").rstrip("/")
    return f"{parsed.scheme}://{parsed.netloc}{path}/set-health"


def load_signals_payload(signals_source: str) -> dict:
    if signals_source.startswith("http://") or signals_source.startswith("https://"):
        response = requests.get(signals_source, timeout=10)
        response.raise_for_status()
        payload = yaml.safe_load(response.text) or {}
    else:
        with open(signals_source, "r", encoding="utf-8") as handle:
            payload = yaml.safe_load(handle) or {}
    if isinstance(payload, dict):
        return payload
    return {}


def extract_targets(signals_source: str) -> List[ChaosTarget]:
    payload = load_signals_payload(signals_source)

    signals = payload.get("signals", [])
    targets: Dict[str, ChaosTarget] = {}

    for signal in signals:
        url = signal.get("url")
        if not url:
            continue
        control_url = to_control_url(url)
        if control_url not in targets:
            targets[control_url] = ChaosTarget(control_url=control_url, health_url=url)

    return [targets[key] for key in sorted(targets.keys())]


def choose_available(
    targets: Iterable[ChaosTarget], active: Set[str], statuses: Dict[str, bool]
) -> List[ChaosTarget]:
    return [t for t in targets if t.control_url not in active and statuses.get(t.control_url, False)]


def set_health(control_url: str, state: str) -> None:
    """
    The dummy services accept lowercase "up"/"down" in the URL and normalize internally.
    """
    url = f"{control_url}/{state}"
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        logger.info("Set %s -> %s", control_url, state.upper())
    except requests.RequestException as exc:
        logger.warning("Failed to set %s -> %s: %s", control_url, state.upper(), exc)


def parse_health_status(response: requests.Response) -> str | None:
    try:
        payload = response.json()
        if isinstance(payload, dict):
            status = payload.get("status")
            if isinstance(status, str):
                return status.strip().upper()
    except ValueError:
        pass

    text = response.text.strip()
    if not text:
        return None
    upper = text.upper()
    if "UP" in upper:
        return "UP"
    if "DOWN" in upper:
        return "DOWN"
    return None


def fetch_health_statuses(targets: Iterable[ChaosTarget]) -> Dict[str, bool]:
    statuses: Dict[str, bool] = {}
    for target in targets:
        try:
            response = requests.get(target.health_url, timeout=5)
            if response.ok:
                status = parse_health_status(response)
            else:
                status = None
                logger.warning(
                    "Health check failed for %s: HTTP %s",
                    target.health_url,
                    response.status_code,
                )
        except requests.RequestException as exc:
            status = None
            logger.warning("Health check failed for %s: %s", target.health_url, exc)

        statuses[target.control_url] = status == "UP"

    return statuses


def reconcile_active(active: Dict[str, float], statuses: Dict[str, bool]) -> None:
    for control_url in list(active.keys()):
        if statuses.get(control_url, False):
            logger.info("Target %s recovered early; clearing scheduled restore", control_url)
            del active[control_url]


def schedule_restores_for_down_targets(
    config: ChaosConfig,
    targets: Iterable[ChaosTarget],
    statuses: Dict[str, bool],
    active: Dict[str, float],
) -> None:
    now = time.time()
    for target in targets:
        if statuses.get(target.control_url, False):
            continue
        if target.control_url in active:
            continue
        duration = jitter(config.min_duration, config.max_duration)
        active[target.control_url] = now + duration
        logger.info("Detected %s DOWN; scheduling restore in %.1fs", target.control_url, duration)


def restore_due_targets(active: Dict[str, float]) -> List[str]:
    now = time.time()
    due = [control_url for control_url, restore_at in active.items() if now >= restore_at]
    for control_url in due:
        set_health(control_url, "up")
        del active[control_url]
    return due


def has_any_down(statuses: Dict[str, bool]) -> bool:
    return any(not is_up for is_up in statuses.values())


def force_break_random(
    config: ChaosConfig,
    targets: List[ChaosTarget],
    statuses: Dict[str, bool],
    active: Dict[str, float],
) -> None:
    if len(active) >= config.max_concurrent:
        logger.info("Chaos limit reached; skipping forced break")
        return
    available = choose_available(targets, set(active.keys()), statuses)
    if not available:
        logger.info("No healthy targets available for forced break")
        return
    target = random.choice(available)
    duration = jitter(config.min_duration, config.max_duration)
    active[target.control_url] = time.time() + duration
    set_health(target.control_url, "down")
    statuses[target.control_url] = False


def _try_inject_once(
    config: ChaosConfig,
    targets: List[ChaosTarget],
    statuses: Dict[str, bool],
    active: Dict[str, float],
) -> None:
    try:
        targets = targets or extract_targets(config.signals_source)
    except FileNotFoundError:
        logger.error("Signals source not found at %s", config.signals_source)
        return
    except requests.RequestException as exc:
        logger.error("Failed to fetch signals from %s: %s", config.signals_source, exc)
        return
    except yaml.YAMLError as exc:
        logger.error("Failed to parse signals payload from %s: %s", config.signals_source, exc)
        return

    if not targets:
        logger.warning("No chaos targets found in %s", config.signals_source)
        return

    if len(active) >= config.max_concurrent:
        return
    available = choose_available(targets, set(active.keys()), statuses)
    if not available:
        return
    target = random.choice(available)
    duration = jitter(config.min_duration, config.max_duration)
    active[target.control_url] = time.time() + duration

    set_health(target.control_url, "down")


def run() -> None:
    active_targets: Dict[str, float] = {}

    logger.info("Chaos maker started")
    while True:
        config = load_config()

        if not config.enabled:
            time.sleep(5)
            continue

        try:
            targets = extract_targets(config.signals_source)
        except FileNotFoundError:
            logger.error("Signals source not found at %s", config.signals_source)
            time.sleep(5)
            continue
        except requests.RequestException as exc:
            logger.error("Failed to fetch signals from %s: %s", config.signals_source, exc)
            time.sleep(5)
            continue
        except yaml.YAMLError as exc:
            logger.error("Failed to parse signals payload from %s: %s", config.signals_source, exc)
            time.sleep(5)
            continue

        if not targets:
            logger.warning("No chaos targets found in %s", config.signals_source)
            time.sleep(5)
            continue

        statuses = fetch_health_statuses(targets)
        reconcile_active(active_targets, statuses)
        schedule_restores_for_down_targets(config, targets, statuses, active_targets)
        restored = restore_due_targets(active_targets)
        if restored:
            statuses = fetch_health_statuses(targets)
            if config.always_broken and not has_any_down(statuses):
                force_break_random(config, targets, statuses, active_targets)

        _try_inject_once(config, targets, statuses, active_targets)

        interval = jitter(config.min_interval, config.max_interval)
        time.sleep(interval)


if __name__ == "__main__":
    run()

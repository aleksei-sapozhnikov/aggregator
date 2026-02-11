#
# Demo-only chaos maker.
#
# Periodically forces random demo services into a DOWN state for a short window,
# then restores them back to UP.
#
# Targets are discovered from a health checks YAML file (same format as the
# aggregator uses), by extracting base URLs from check URLs.
#
# Configuration is controlled via environment variables:
#   - CHAOS_ENABLED:           "true" / "false" (default: false)
#   - CHAOS_MIN_INTERVAL:      e.g. 30s, 5m (default: 30s)
#   - CHAOS_MAX_INTERVAL:      e.g. 90s, 10m (default: 90s)
#   - CHAOS_MIN_DURATION:      e.g. 20s (default: 20s)
#   - CHAOS_MAX_DURATION:      e.g. 45s (default: 45s)
#   - CHAOS_MAX_CONCURRENT:    integer (default: 2)
#
# Intended for demo and testing only.
#

import logging
import os
import random
import requests
import threading
import time
import yaml
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Set
from urllib.parse import urlsplit

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
    checks_path: str


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
    script_dir = Path(__file__).resolve().parent
    return ChaosConfig(
        enabled=os.getenv("CHAOS_ENABLED", "false").strip().lower() == "true",
        min_interval=parse_duration(os.getenv("CHAOS_MIN_INTERVAL", "30s")),
        max_interval=parse_duration(os.getenv("CHAOS_MAX_INTERVAL", "90s")),
        min_duration=parse_duration(os.getenv("CHAOS_MIN_DURATION", "20s")),
        max_duration=parse_duration(os.getenv("CHAOS_MAX_DURATION", "45s")),
        max_concurrent=int(os.getenv("CHAOS_MAX_CONCURRENT", "2")),
        checks_path=str(script_dir / "health-checks.yaml"),
    )


def jitter(min_value: float, max_value: float) -> float:
    if min_value > max_value:
        min_value, max_value = max_value, min_value
    if min_value == max_value:
        return min_value
    return random.uniform(min_value, max_value)


def to_base_url(url: str) -> str:
    """
    Convert a check URL into a base URL that supports /set-health/<state>.

    Examples:
      - http://svc:8080/health        -> http://svc:8080
      - http://svc:8080/api/health    -> http://svc:8080/api
    """
    parsed = urlsplit(url)
    path = parsed.path or ""

    if path.endswith("/health"):
        path = path[: -len("/health")]
    if path.endswith("/"):
        path = path[:-1]

    return f"{parsed.scheme}://{parsed.netloc}{path}"


def extract_targets(checks_path: str) -> List[str]:
    with open(checks_path, "r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle) or {}

    checks = payload.get("checks", [])
    targets: Set[str] = set()

    for check in checks:
        url = check.get("url")
        if not url:
            continue
        targets.add(to_base_url(url))

    return sorted(targets)


def choose_available(targets: Iterable[str], active: Set[str]) -> List[str]:
    return [t for t in targets if t not in active]


def set_health(base_url: str, state: str) -> None:
    """
    The dummy services accept lowercase "up"/"down" in the URL, and normalize internally.
    """
    url = f"{base_url}/set-health/{state}"
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        logger.info("Set %s -> %s", base_url, state.upper())
    except requests.RequestException as exc:
        logger.warning("Failed to set %s -> %s: %s", base_url, state.upper(), exc)


def _restore_after(base_url: str, duration: float, active: Set[str], lock: threading.Lock) -> None:
    time.sleep(duration)
    set_health(base_url, "up")
    with lock:
        active.discard(base_url)


def _try_inject_once(config: ChaosConfig, active: Set[str], lock: threading.Lock) -> None:
    try:
        targets = extract_targets(config.checks_path)
    except FileNotFoundError:
        logger.error("Checks file not found at %s", config.checks_path)
        return
    except yaml.YAMLError as exc:
        logger.error("Failed to parse checks file at %s: %s", config.checks_path, exc)
        return

    if not targets:
        logger.warning("No chaos targets found in %s", config.checks_path)
        return

    with lock:
        if len(active) >= config.max_concurrent:
            return
        available = choose_available(targets, active)
        if not available:
            return
        target = random.choice(available)
        active.add(target)

    duration = jitter(config.min_duration, config.max_duration)
    set_health(target, "down")

    threading.Thread(
        target=_restore_after,
        args=(target, duration, active, lock),
        daemon=True,
    ).start()


def run() -> None:
    active_targets: Set[str] = set()
    lock = threading.Lock()

    logger.info("Chaos maker started")
    while True:
        config = load_config()

        if not config.enabled:
            time.sleep(5)
            continue

        _try_inject_once(config, active_targets, lock)

        interval = jitter(config.min_interval, config.max_interval)
        time.sleep(interval)


if __name__ == "__main__":
    run()

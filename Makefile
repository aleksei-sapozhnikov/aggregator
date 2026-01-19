# Environment: local | dev | qa | prod
ENV ?= local

# Compose command (override if needed: make up COMPOSE="docker compose")
COMPOSE ?=

# Compose files
BASE_COMPOSE_FILE := compose.yaml
OVERRIDE_FILE :=
COMPOSE_FILES :=

# ---- Runtime detection (docker/podman) ----
ifeq ($(OS),Windows_NT)
DOCKER := $(shell powershell -NoProfile -Command "Get-Command docker -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source")
PODMAN := $(shell powershell -NoProfile -Command "Get-Command podman -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source")
else
DOCKER := $(shell command -v docker 2>/dev/null)
PODMAN := $(shell command -v podman 2>/dev/null)
endif

ifeq ($(COMPOSE),)
ifeq ($(DOCKER),)
ifeq ($(PODMAN),)
$(error Neither docker nor podman is installed. Please install one of them.)
else
COMPOSE := podman compose
endif
else
COMPOSE := docker compose
endif
endif

# ---- ENV -> optional override file ----
ifeq ($(ENV),local)
OVERRIDE_FILE := compose.local.yaml
else ifeq ($(ENV),dev)
OVERRIDE_FILE := compose.dev.yaml
else ifeq ($(ENV),qa)
OVERRIDE_FILE := compose.qa.yaml
else ifeq ($(ENV),prod)
OVERRIDE_FILE := compose.prod.yaml
else
$(error Unknown ENV '$(ENV)'. Use one of: local, dev, qa, prod)
endif

# Build compose file list (include override only if it exists)
OVERRIDE_EXISTS := $(wildcard $(OVERRIDE_FILE))
COMPOSE_FILES := -f $(BASE_COMPOSE_FILE) $(if $(OVERRIDE_EXISTS),-f $(OVERRIDE_FILE),)

# Prometheus data storage
PROMETHEUS_DATA_DIR := ./.temp/prometheus/data

# Grafana data storage
GRAFANA_DATA_DIR := ./.temp/grafana/data

.PHONY: info prepare-dirs build up down clean restart
.NOTPARALLEL: restart

info:
	@echo "ENV=$(ENV)"
	@echo "Using container command: $(COMPOSE)"
	@echo "Compose files: $(COMPOSE_FILES)"

prepare-dirs:
ifeq ($(OS),Windows_NT)
	@powershell -NoProfile -Command "New-Item -ItemType Directory -Force -Path '$(PROMETHEUS_DATA_DIR)' | Out-Null"
	@powershell -NoProfile -Command "New-Item -ItemType Directory -Force -Path '$(GRAFANA_DATA_DIR)' | Out-Null"
else
	@mkdir -p $(PROMETHEUS_DATA_DIR)
	@mkdir -p $(GRAFANA_DATA_DIR)
endif

build: info prepare-dirs
	$(COMPOSE) $(COMPOSE_FILES) build

up: info prepare-dirs
	$(COMPOSE) $(COMPOSE_FILES) up --detach

down: info
	$(COMPOSE) $(COMPOSE_FILES) down

clean: info
	$(COMPOSE) $(COMPOSE_FILES) down --remove-orphans --volumes

restart: down build up

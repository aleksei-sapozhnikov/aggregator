# ---- Compose files ----
BASE := -f compose.yaml
LOCAL := -f compose.local.yaml
LOCAL_DEMO := -f compose.local-demo.yaml
DEMO := -f compose.demo.yaml
LOCAL_PORTS := -f compose.overlay.local-ports.yaml
DEMO_SERVICES := -f compose.overlay.demo-services.yaml
DEMO_SERVICES_PORTS := -f compose.overlay.demo-services-local-ports.yaml

LOCAL_STACK := $(BASE) $(LOCAL) $(LOCAL_PORTS)
LOCAL_DEMO_STACK := $(BASE) $(LOCAL_DEMO) $(DEMO_SERVICES) $(LOCAL_PORTS) $(DEMO_SERVICES_PORTS)
DEMO_STACK := $(BASE) $(DEMO) $(DEMO_SERVICES)

# ---- Project names (separate stacks to avoid cross-orphan cleanup) ----
LOCAL_PROJECT := --project-name aggregator-local
LOCAL_DEMO_PROJECT := --project-name aggregator-local-demo
DEMO_PROJECT := --project-name aggregator-demo

# ---- Compose command (docker/podman autodetect; override via COMPOSE=...) ----
COMPOSE ?=
ifeq ($(OS),Windows_NT)
DOCKER := $(shell powershell -NoProfile -Command "Get-Command docker -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source")
PODMAN := $(shell powershell -NoProfile -Command "Get-Command podman -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source")
else
DOCKER := $(shell command -v docker 2>/dev/null)
PODMAN := $(shell command -v podman 2>/dev/null)
endif

ifeq ($(COMPOSE),)
  ifneq ($(DOCKER),)
    COMPOSE := docker compose
  else ifneq ($(PODMAN),)
    COMPOSE := podman compose
  else
    $(error Neither docker nor podman is installed. Please install one of them.)
  endif
endif

# ---- Local-only data dirs (needed by compose.local.yaml bind mounts) ----
LOCAL_PROMETHEUS_DATA_DIR := ./.temp/prometheus/data
LOCAL_GRAFANA_DATA_DIR := ./.temp/grafana/data

.PHONY: help info prepare-dirs \
        up down clean redeploy \
        local-up local-down local-clean local-redeploy \
        local-demo-up local-demo-down local-demo-clean local-demo-redeploy \
        demo-up demo-down demo-clean demo-redeploy

help:
	@echo "Targets:"
	@echo "  make up                  Up local dev stack (ports exposed)"
	@echo "  make down                Down local dev stack (remove orphans)"
	@echo "  make clean               Down local dev stack + remove volumes"
	@echo "  make redeploy            Up local dev stack (rebuild)"
	@echo ""
	@echo "  make local-up            Up local dev stack (ports exposed)"
	@echo "  make local-down          Down local dev stack (remove orphans)"
	@echo "  make local-clean         Down local dev stack + remove volumes"
	@echo "  make local-redeploy      Up local dev stack (rebuild)"
	@echo ""
	@echo "  make local-demo-up       Up local demo stack (demo profile + dummy + ports)"
	@echo "  make local-demo-down     Down local demo stack (remove orphans)"
	@echo "  make local-demo-clean    Down local demo stack + remove volumes"
	@echo "  make local-demo-redeploy Up local demo stack (rebuild)"
	@echo ""
	@echo "  make demo-up             Up demo stack (dummy enabled, no ports by default)"
	@echo "  make demo-down           Down demo stack (remove orphans)"
	@echo "  make demo-clean          Down demo stack + remove volumes"
	@echo "  make demo-redeploy       Up demo stack (rebuild)"
	@echo ""
	@echo "Variables:"
	@echo "  COMPOSE=\"docker compose\"  Override compose command"

info:
	@echo "Using compose command: $(COMPOSE)"

prepare-dirs:
ifeq ($(OS),Windows_NT)
	@powershell -NoProfile -Command "New-Item -ItemType Directory -Force -Path '$(LOCAL_PROMETHEUS_DATA_DIR)' | Out-Null"
	@powershell -NoProfile -Command "New-Item -ItemType Directory -Force -Path '$(LOCAL_GRAFANA_DATA_DIR)' | Out-Null"
else
	@mkdir -p $(LOCAL_PROMETHEUS_DATA_DIR)
	@mkdir -p $(LOCAL_GRAFANA_DATA_DIR)
endif

# ---- local ----
up: local-demo-up
down: local-demo-down
clean: local-demo-clean
redeploy: local-demo-redeploy

local-up: info prepare-dirs
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) up --detach --remove-orphans

local-redeploy: info prepare-dirs
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) up --detach --build --remove-orphans

local-down: info
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) down --remove-orphans

local-clean: info
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) down --remove-orphans --volumes

# ---- local-demo ----
local-demo-up: info prepare-dirs
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) up --detach --remove-orphans

local-demo-redeploy: info prepare-dirs
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) up --detach --build --remove-orphans

local-demo-down: info
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) down --remove-orphans

local-demo-clean: info
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) down --remove-orphans --volumes

# ---- demo ----
demo-up: info
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) up --detach --remove-orphans

demo-redeploy: info
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) up --detach --build --remove-orphans

demo-down: info
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) down --remove-orphans

demo-clean: info
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) down --remove-orphans --volumes

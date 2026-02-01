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
        up down restart recreate rebuild rebuild-recreate clean \
        local-up local-down local-restart local-recreate local-rebuild local-rebuild-recreate local-clean \
        local-demo-up local-demo-down local-demo-restart local-demo-recreate local-demo-rebuild local-demo-rebuild-recreate local-demo-clean \
        demo-up demo-down demo-restart demo-recreate demo-rebuild demo-rebuild-recreate demo-clean \
        local-up-svc local-stop-svc local-restart-svc local-recreate-svc local-rebuild-svc local-rebuild-recreate-svc \
        local-demo-up-svc local-demo-stop-svc local-demo-restart-svc local-demo-recreate-svc local-demo-rebuild-svc local-demo-rebuild-recreate-svc \
        demo-up-svc demo-stop-svc demo-restart-svc demo-recreate-svc demo-rebuild-svc demo-rebuild-recreate-svc

help:
	@echo "Conventions:"
	@echo "  up               -> start/update containers (no build)"
	@echo "  down             -> stop/remove containers + network (keep volumes)"
	@echo "  restart          -> restart existing containers (no recreate)"
	@echo "  recreate         -> force re-create containers (keep volumes)"
	@echo "  rebuild          -> build images + start/update (keep volumes)"
	@echo "  rebuild-recreate -> build images + force re-create containers (keep volumes)"
	@echo "  clean            -> down + remove volumes (DATA LOSS)"
	@echo ""
	@echo "Default (alias -> local-demo):"
	@echo "  make up | down | restart | recreate | rebuild | rebuild-recreate | clean"
	@echo ""
	@echo "Service-scoped commands (*-svc):"
	@echo "  Affect only one or more explicitly specified services."
	@echo "  Other running containers in the stack are not touched."
	@echo ""
	@echo "  Examples:"
	@echo "    make demo-restart-svc caddy grafana"
	@echo "    make demo-rebuild-recreate-svc caddy"
	@echo "    make local-demo-recreate-svc aggregator prometheus"
	@echo ""
	@echo "Local:"
	@echo "  make local-up | local-down | local-restart | local-recreate | local-rebuild | local-rebuild-recreate | local-clean"
	@echo "  make local-*-svc <svc...>"
	@echo ""
	@echo "Local demo:"
	@echo "  make local-demo-up | local-demo-down | local-demo-restart | local-demo-recreate | local-demo-rebuild | local-demo-rebuild-recreate | local-demo-clean"
	@echo "  make local-demo-*-svc <svc...>"
	@echo ""
	@echo "Demo (AWS / public):"
	@echo "  make demo-up | demo-down | demo-restart | demo-recreate | demo-rebuild | demo-rebuild-recreate | demo-clean"
	@echo "  make demo-*-svc <svc...>"
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

# ---- default aliases ----
# Keep existing behavior: default targets operate on local-demo.
up: local-demo-up
down: local-demo-down
restart: local-demo-restart
recreate: local-demo-recreate
rebuild: local-demo-rebuild
rebuild-recreate: local-demo-rebuild-recreate
clean: local-demo-clean

# ---- local ----
local-up: info prepare-dirs
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) up --detach --remove-orphans

local-down: info
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) down --remove-orphans

local-restart: info
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) restart

local-recreate: info
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) up --detach --force-recreate --remove-orphans

local-rebuild: info prepare-dirs
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) up --detach --build --remove-orphans

local-rebuild-recreate: info prepare-dirs
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) up --detach --build --force-recreate --remove-orphans

local-clean: info
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) down --remove-orphans --volumes

# ---- local-demo ----
local-demo-up: info prepare-dirs
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) up --detach --remove-orphans

local-demo-down: info
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) down --remove-orphans

local-demo-restart: info
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) restart

local-demo-recreate: info
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) up --detach --force-recreate --remove-orphans

local-demo-rebuild: info prepare-dirs
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) up --detach --build --remove-orphans

local-demo-rebuild-recreate: info prepare-dirs
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) up --detach --build --force-recreate --remove-orphans

local-demo-clean: info
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) down --remove-orphans --volumes

# ---- demo ----
demo-up: info
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) up --detach --remove-orphans

demo-down: info
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) down --remove-orphans

demo-restart: info
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) restart

demo-recreate: info
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) up --detach --force-recreate --remove-orphans

demo-rebuild: info
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) up --detach --build --remove-orphans

demo-rebuild-recreate: info
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) up --detach --build --force-recreate --remove-orphans

demo-clean: info
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) down --remove-orphans --volumes

# ---- service-scoped commands (positional service args) ----
# Usage examples:
#   make demo-restart-svc caddy grafana
#   make local-demo-recreate-svc aggregator prometheus
#
SERVICE_TARGETS := \
  local-up-svc local-stop-svc local-restart-svc local-recreate-svc local-rebuild-svc local-rebuild-recreate-svc \
  local-demo-up-svc local-demo-stop-svc local-demo-restart-svc local-demo-recreate-svc local-demo-rebuild-svc local-demo-rebuild-recreate-svc \
  demo-up-svc demo-stop-svc demo-restart-svc demo-recreate-svc demo-rebuild-svc demo-rebuild-recreate-svc

ifneq ($(filter $(SERVICE_TARGETS),$(MAKECMDGOALS)),)
SERVICES := $(filter-out $(SERVICE_TARGETS),$(MAKECMDGOALS))
$(SERVICES):
	@:
endif

define require_services
	@if [ -z "$(SERVICES)" ]; then \
	  echo "ERROR: No services specified. Example: make $(1) caddy grafana"; \
	  exit 1; \
	fi
endef

# local services
local-up-svc: info prepare-dirs
	$(call require_services,local-up-svc)
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) up --detach --remove-orphans $(SERVICES)

local-stop-svc: info
	$(call require_services,local-stop-svc)
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) stop $(SERVICES)

local-restart-svc: info
	$(call require_services,local-restart-svc)
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) restart $(SERVICES)

local-recreate-svc: info
	$(call require_services,local-recreate-svc)
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) up --detach --force-recreate $(SERVICES)

local-rebuild-svc: info prepare-dirs
	$(call require_services,local-rebuild-svc)
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) up --detach --build $(SERVICES)

local-rebuild-recreate-svc: info prepare-dirs
	$(call require_services,local-rebuild-recreate-svc)
	$(COMPOSE) $(LOCAL_PROJECT) $(LOCAL_STACK) up --detach --build --force-recreate $(SERVICES)

# local-demo services
local-demo-up-svc: info prepare-dirs
	$(call require_services,local-demo-up-svc)
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) up --detach --remove-orphans $(SERVICES)

local-demo-stop-svc: info
	$(call require_services,local-demo-stop-svc)
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) stop $(SERVICES)

local-demo-restart-svc: info
	$(call require_services,local-demo-restart-svc)
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) restart $(SERVICES)

local-demo-recreate-svc: info
	$(call require_services,local-demo-recreate-svc)
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) up --detach --force-recreate $(SERVICES)

local-demo-rebuild-svc: info prepare-dirs
	$(call require_services,local-demo-rebuild-svc)
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) up --detach --build $(SERVICES)

local-demo-rebuild-recreate-svc: info prepare-dirs
	$(call require_services,local-demo-rebuild-recreate-svc)
	$(COMPOSE) $(LOCAL_DEMO_PROJECT) $(LOCAL_DEMO_STACK) up --detach --build --force-recreate $(SERVICES)

# demo services
demo-up-svc: info
	$(call require_services,demo-up-svc)
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) up --detach --remove-orphans $(SERVICES)

demo-stop-svc: info
	$(call require_services,demo-stop-svc)
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) stop $(SERVICES)

demo-restart-svc: info
	$(call require_services,demo-restart-svc)
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) restart $(SERVICES)

demo-recreate-svc: info
	$(call require_services,demo-recreate-svc)
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) up --detach --force-recreate $(SERVICES)

demo-rebuild-svc: info
	$(call require_services,demo-rebuild-svc)
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) up --detach --build $(SERVICES)

demo-rebuild-recreate-svc: info
	$(call require_services,demo-rebuild-recreate-svc)
	$(COMPOSE) $(DEMO_PROJECT) $(DEMO_STACK) up --detach --build --force-recreate $(SERVICES)

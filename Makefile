# ============================================================
# Compose environment selector (single set of targets)
#
# Usage:
#   make up                          # ENV defaults to local-demo
#   make up ENV=local
#   make rebuild-recreate ENV=demo
#
# Service-scoped (positional args):
#   make down-svc caddy grafana
#   make rebuild-svc aggregator
#   make clean-svc ENV=demo caddy
# ============================================================

# ---- Environment selector ----
SUPPORTED_ENVS := local local-demo demo
ENV ?= local-demo
ifeq ($(filter $(ENV),$(SUPPORTED_ENVS)),)
  $(error Invalid ENV='$(ENV)'. Supported: $(SUPPORTED_ENVS))
endif

# ---- Compose files ----
BASE := -f compose.yaml
LOCAL := -f compose.local.yaml
LOCAL_DEMO := -f compose.local-demo.yaml
DEMO := -f compose.demo.yaml
LOCAL_PORTS := -f compose.overlay.local-ports.yaml
DEMO_SERVICES := -f compose.overlay.demo-services.yaml
DEMO_SERVICES_PORTS := -f compose.overlay.demo-services-local-ports.yaml

STACK_local := $(BASE) $(LOCAL) $(LOCAL_PORTS)
STACK_local-demo := $(BASE) $(LOCAL_DEMO) $(DEMO_SERVICES) $(LOCAL_PORTS) $(DEMO_SERVICES_PORTS)
STACK_demo := $(BASE) $(DEMO) $(DEMO_SERVICES)

PROJECT_local := aggregator-local
PROJECT_local-demo := aggregator-local-demo
PROJECT_demo := aggregator-demo

STACK := $(STACK_$(ENV))
PROJECT := $(PROJECT_$(ENV))

CONTAINER_RUNTIME :=
COMPOSE_CMD :=

# ---- Container runtime / compose command autodetect ----
# Override via:
#   make ... CONTAINER_RUNTIME=docker
#   make ... COMPOSE="docker compose"
COMPOSE ?=
ifeq ($(OS),Windows_NT)
DOCKER := $(shell powershell -NoProfile -Command "Get-Command docker -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source")
PODMAN := $(shell powershell -NoProfile -Command "Get-Command podman -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source")
else
DOCKER := $(shell command -v docker 2>/dev/null)
PODMAN := $(shell command -v podman 2>/dev/null)
endif

ifeq ($(CONTAINER_RUNTIME),)
  ifneq ($(DOCKER),)
    CONTAINER_RUNTIME := docker
  else ifneq ($(PODMAN),)
    CONTAINER_RUNTIME := podman
  else
    $(error Neither docker nor podman is installed. Please install one of them.)
  endif
endif

ifeq ($(COMPOSE),)
COMPOSE := $(CONTAINER_RUNTIME) compose
endif

COMPOSE_CMD := $(COMPOSE) --project-name $(PROJECT) $(STACK)

# ---- Chaos-maker last-start control to ensure ----
# ---- it starts when services ready            ----
CHAOS_LAST_ENVS := demo local-demo
CHAOS_SVC := chaos-maker
CHAOS_LAST := $(filter $(ENV),$(CHAOS_LAST_ENVS))

# ---- Local runtime variables ----
ADMIN_USERNAME ?=
ADMIN_PASSWORD ?=
FEEDBACK_STORAGE_CONFIG ?=
export ADMIN_USERNAME
export ADMIN_PASSWORD
export FEEDBACK_STORAGE_CONFIG

.PHONY: help info env \
        up down restart recreate rebuild rebuild-recreate clean \
        up-svc down-svc restart-svc recreate-svc rebuild-svc rebuild-recreate-svc clean-svc \
        code-qa code-format code-lint

help:
	@echo "Usage:"
	@echo "  make <target> [ENV=<env>]"
	@echo ""
	@echo "Supported ENV values: $(SUPPORTED_ENVS)"
	@echo "Default ENV=$(ENV)"
	@echo ""
	@echo "Targets:"
	@echo "  up               -> start/update containers (no build)"
	@echo "  down             -> stop/remove containers + network (keep volumes)"
	@echo "  restart          -> restart existing containers (no recreate)"
	@echo "  recreate         -> force re-create containers (keep volumes)"
	@echo "  rebuild          -> build images + start/update (keep volumes)"
	@echo "  rebuild-recreate -> build images + force re-create containers (keep volumes)"
	@echo "  clean            -> down + remove containers, network, and volumes (DATA LOSS)"
	@echo "  code-qa          -> run format, then secrets scan"
	@echo "  code-format      -> run format flow"
	@echo "  code-lint        -> run lint flow"
	@echo ""
	@echo "Service-scoped (positional args):"
	@echo "  make down-svc caddy grafana"
	@echo "  make clean-svc ENV=demo caddy"
	@echo "  make rebuild-recreate-svc ENV=demo caddy"
	@echo ""
	@echo "Defaults:"
	@echo "  ENV=$(ENV)"

env:
	@echo $(SUPPORTED_ENVS)

info:
	@echo COMPOSE_CMD=$(COMPOSE_CMD)
	@echo

# ---- Common targets ----
up: info
ifneq ($(CHAOS_LAST),)
	$(COMPOSE_CMD) up --detach --wait --remove-orphans --scale $(CHAOS_SVC)=0
	$(COMPOSE_CMD) up --detach --wait --remove-orphans $(CHAOS_SVC)
else
	$(COMPOSE_CMD) up --detach --wait --remove-orphans
endif

down: info
	$(COMPOSE_CMD) down --remove-orphans

restart: info
	$(COMPOSE_CMD) restart

recreate: info
ifneq ($(CHAOS_LAST),)
	$(COMPOSE_CMD) up --detach --wait --force-recreate --remove-orphans --scale $(CHAOS_SVC)=0
	$(COMPOSE_CMD) up --detach --wait --force-recreate --remove-orphans $(CHAOS_SVC)
else
	$(COMPOSE_CMD) up --detach --wait --force-recreate --remove-orphans
endif

rebuild: info
ifneq ($(CHAOS_LAST),)
	$(COMPOSE_CMD) up --detach --wait --build --remove-orphans --scale $(CHAOS_SVC)=0
	$(COMPOSE_CMD) up --detach --wait --build --remove-orphans $(CHAOS_SVC)
else
	$(COMPOSE_CMD) up --detach --wait --build --remove-orphans
endif

rebuild-recreate: info
ifneq ($(CHAOS_LAST),)
	$(COMPOSE_CMD) up --detach --wait --build --force-recreate --remove-orphans --scale $(CHAOS_SVC)=0
	$(COMPOSE_CMD) up --detach --wait --build --force-recreate --remove-orphans $(CHAOS_SVC)
else
	$(COMPOSE_CMD) up --detach --wait --build --force-recreate --remove-orphans
endif

clean: info
	$(COMPOSE_CMD) down --remove-orphans --volumes

# ---- Service-scoped commands (positional service args) ----
# Positional services are passed after the target:
#   make down-svc caddy grafana
SERVICE_TARGETS := up-svc down-svc restart-svc recreate-svc rebuild-svc rebuild-recreate-svc clean-svc

ifneq ($(filter $(SERVICE_TARGETS),$(MAKECMDGOALS)),)
SERVICES := $(filter-out $(SERVICE_TARGETS),$(MAKECMDGOALS))
$(SERVICES):
	@:
endif

define require_services
  $(if $(strip $(SERVICES)),,$(error No services specified. Example: make $(1) caddy grafana))
endef

up-svc: info
	$(call require_services,up-svc)
	$(COMPOSE_CMD) up --detach --wait --remove-orphans $(SERVICES)

down-svc: info
	$(call require_services,down-svc)
	$(COMPOSE_CMD) rm --stop --force $(SERVICES)

restart-svc: info
	$(call require_services,restart-svc)
	$(COMPOSE_CMD) restart $(SERVICES)

recreate-svc: info
	$(call require_services,recreate-svc)
	$(COMPOSE_CMD) up --detach --wait --force-recreate --remove-orphans $(SERVICES)

rebuild-svc: info
	$(call require_services,rebuild-svc)
	$(COMPOSE_CMD) up --detach --wait --build --remove-orphans $(SERVICES)

rebuild-recreate-svc: info
	$(call require_services,rebuild-recreate-svc)
	$(COMPOSE_CMD) up --detach --wait --build --force-recreate --remove-orphans $(SERVICES)

clean-svc: info
	$(call require_services,clean-svc)
	@volume_names="$$(container_ids=`$(COMPOSE_CMD) ps -q $(SERVICES)`; \
		if [ -n "$$container_ids" ]; then \
			$(CONTAINER_RUNTIME) inspect $$container_ids --format '{{range .Mounts}}{{if eq .Type "volume"}}{{println .Name}}{{end}}{{end}}'; \
		fi)"; \
	$(COMPOSE_CMD) rm --stop --force $(SERVICES); \
	if [ -n "$$volume_names" ]; then \
		for volume_name in `printf '%s\n' "$$volume_names" | sort -u`; do \
			$(CONTAINER_RUNTIME) volume rm --force $$volume_name; \
		done; \
	fi

# ---- Code QA commands ----
code-qa:
	python tools/code_qa/main.py qa

code-format:
	python tools/code_qa/main.py format

code-lint:
	python tools/code_qa/main.py lint

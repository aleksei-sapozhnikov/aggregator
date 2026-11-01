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

# Compose configuration and runtime checks are needed only for Compose commands.
# QA and help targets must also run in clean CI checkouts without .env or Docker.
SERVICE_TARGETS := up-svc down-svc restart-svc recreate-svc rebuild-svc rebuild-recreate-svc clean-svc
COMPOSE_TARGETS := info up down restart recreate rebuild rebuild-recreate clean pull deploy $(SERVICE_TARGETS)

# ---- Compose files ----
COMPOSE_DIR := deploy/compose
BASE := -f $(COMPOSE_DIR)/compose.yaml
LOCAL := -f $(COMPOSE_DIR)/compose.local.yaml
LOCAL_DEMO := -f $(COMPOSE_DIR)/compose.local-demo.yaml
DEMO := -f $(COMPOSE_DIR)/compose.demo.yaml
LOCAL_PORTS := -f $(COMPOSE_DIR)/compose.overlay.local-ports.yaml
CORE_BUILD := -f $(COMPOSE_DIR)/compose.build.core.yaml
DEMO_BUILD := -f $(COMPOSE_DIR)/compose.build.demo-services.yaml
DEMO_IMAGES := -f $(COMPOSE_DIR)/compose.images.demo.yaml
DEMO_SERVICES := -f $(COMPOSE_DIR)/compose.overlay.demo-services.yaml
DEMO_SERVICES_PORTS := -f $(COMPOSE_DIR)/compose.overlay.demo-services-local-ports.yaml

STACK_local := $(BASE) $(LOCAL) $(CORE_BUILD) $(LOCAL_PORTS)
STACK_local-demo := $(BASE) $(LOCAL_DEMO) $(DEMO_SERVICES) $(CORE_BUILD) $(DEMO_BUILD) $(LOCAL_PORTS) $(DEMO_SERVICES_PORTS)
STACK_demo := $(BASE) $(DEMO) $(DEMO_SERVICES) $(DEMO_IMAGES)

PROJECT_local := aggregator-local
PROJECT_local-demo := aggregator-local-demo
PROJECT_demo := aggregator-demo

STACK := $(STACK_$(ENV))
PROJECT := $(PROJECT_$(ENV))

CONTAINER_RUNTIME :=
COMPOSE_CMD :=

# ---- Project version (Compose targets only) ----
ifneq ($(filter $(COMPOSE_TARGETS),$(MAKECMDGOALS)),)
PROJECT_ENV_FILE := .env
ifeq ($(wildcard $(PROJECT_ENV_FILE)),)
  $(error Missing $(PROJECT_ENV_FILE))
endif
include $(PROJECT_ENV_FILE)
ifeq ($(PROJECT_VERSION),)
  $(error PROJECT_VERSION is empty. Set it in $(PROJECT_ENV_FILE))
endif
export PROJECT_VERSION

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

COMPOSE_CMD := $(COMPOSE) --project-name $(PROJECT) --project-directory . $(STACK)

endif

# ---- Chaos-maker last-start control to ensure ----
# ---- it starts when services ready            ----
CHAOS_LAST_ENVS := demo local-demo
CHAOS_SVC := chaos-maker
CHAOS_LAST := $(filter $(ENV),$(CHAOS_LAST_ENVS))

# ---- Local runtime variables ----
AGENT_AI_ENABLED ?=
AGENT_AI_CONFIG ?=
export AGENT_AI_ENABLED
export AGENT_AI_CONFIG

.PHONY: help info env \
        up down restart recreate rebuild rebuild-recreate clean pull deploy \
        up-svc down-svc restart-svc recreate-svc rebuild-svc rebuild-recreate-svc clean-svc \
        code-qa code-format code-lint code-secrets test qa qa-format qa-check deps-audit

help:
	@echo "Usage:"
	@echo "  make <target> [ENV=<env>]"
	@echo ""
	@echo "Supported ENV values: $(SUPPORTED_ENVS)"
	@echo "Default ENV=$(ENV)"
	@echo ""
	@echo "Targets:"
	@echo "  up               -> start/update containers (no build)"
	@echo "  pull             -> download published demo images (ENV=demo)"
	@echo "  deploy           -> pull demo images and run without building (ENV=demo)"
	@echo "  down             -> stop/remove containers + network (keep volumes)"
	@echo "  restart          -> restart existing containers (no recreate)"
	@echo "  recreate         -> force re-create containers (keep volumes)"
	@echo "  rebuild          -> build images + start/update (keep volumes)"
	@echo "  rebuild-recreate -> build images + force re-create containers (keep volumes)"
	@echo "  clean            -> down + remove containers, network, and volumes (DATA LOSS)"
	@echo "  code-qa          -> check code and run module tests (no fixes or secrets scan)"
	@echo "  code-format      -> run formatting checks and fixes"
	@echo "  code-lint        -> check code without modifying files (no secrets scan)"
	@echo "  test             -> run all unit tests (or TEST_MODULE=aggregator)"
	@echo "  code-secrets     -> scan secrets with TruffleHog"
	@echo "  qa-format        -> fix/check each module, run its tests, then scan secrets"
	@echo "  qa-check         -> check code, run tests and scan secrets (no changes)"
	@echo "  qa               -> alias for qa-check"
	@echo "  deps-audit       -> check npm dependency advisories and update suggestions"
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
	@echo PROJECT_VERSION=$(PROJECT_VERSION)

# ---- Common targets ----
up: info
ifneq ($(CHAOS_LAST),)
	$(COMPOSE_CMD) up --detach --wait --remove-orphans --scale $(CHAOS_SVC)=0
	$(COMPOSE_CMD) up --detach --wait --remove-orphans $(CHAOS_SVC)
else
	$(COMPOSE_CMD) up --detach --wait --remove-orphans
endif

# Published demo artifacts use immutable per-service Git build-context tags.
pull: info
	$(if $(filter demo,$(ENV)),,$(error pull requires ENV=demo))
	$(COMPOSE_CMD) pull

deploy: info
	$(if $(filter demo,$(ENV)),,$(error deploy requires ENV=demo))
	$(COMPOSE_CMD) pull
	$(COMPOSE_CMD) up --detach --no-build --wait --remove-orphans --scale $(CHAOS_SVC)=0
	$(COMPOSE_CMD) up --detach --no-build --wait --remove-orphans $(CHAOS_SVC)

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
QA_MODULE_ARGS = $(foreach module,$(MODULE),--module $(module))
# CI runs module checks in parallel and scans secrets in a dedicated job.
QA_SCAN_SECRETS ?= true
QA_CHECK_COMMAND = $(if $(filter false,$(QA_SCAN_SECRETS)),code-qa,qa)

code-qa:
	python tools/code_qa/src/main.py code-qa $(QA_MODULE_ARGS)

code-format:
	python tools/code_qa/src/main.py format $(QA_MODULE_ARGS)

code-lint:
	python tools/code_qa/src/main.py lint $(QA_MODULE_ARGS)

test:
	python tools/code_qa/src/main.py test $(foreach module,$(if $(MODULE),$(MODULE),$(TEST_MODULE)),--module $(module))

code-secrets:
	python tools/code_qa/src/main.py secrets

qa-format:
	python tools/code_qa/src/main.py qa-format $(QA_MODULE_ARGS)

qa-check:
	python tools/code_qa/src/main.py $(QA_CHECK_COMMAND) $(QA_MODULE_ARGS)

qa: qa-check

deps-audit:
	python tools/dependency_audit/src/check_npm.py

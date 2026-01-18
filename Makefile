# Environment: local | dev | qa | prod
ENV ?= local

# Detect container runtime
ifeq ($(OS),Windows_NT)
DOCKER := $(shell powershell -NoProfile -Command "Get-Command docker -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source")
PODMAN := $(shell powershell -NoProfile -Command "Get-Command podman -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source")
else
DOCKER := $(shell command -v docker 2>/dev/null)
PODMAN := $(shell command -v podman 2>/dev/null)
endif

# Exit with message if nothing found
ifeq ($(DOCKER)$(PODMAN),)
$(error Neither docker nor podman is installed. Please install one of them.)
endif

# Select compose command (can be overridden: make up COMPOSE="docker compose")
COMPOSE ?= $(if $(DOCKER),docker compose,podman compose)

BASE_COMPOSE_FILES := -f compose.yaml

# Map ENV -> override compose file (optional)
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

# Only include override file if it exists
OVERRIDE_EXISTS := $(wildcard $(OVERRIDE_FILE))
COMPOSE_FILES := $(BASE_COMPOSE_FILES) $(if $(OVERRIDE_EXISTS),-f $(OVERRIDE_FILE),)

.PHONY: info build up down clean restart
.NOTPARALLEL: restart

info:
	@echo "ENV=$(ENV)"
	@echo "Using container command: $(COMPOSE)"
	@echo "Compose files: $(COMPOSE_FILES)"

build: info
	$(COMPOSE) $(COMPOSE_FILES) build

up: info
	$(COMPOSE) $(COMPOSE_FILES) up --detach

down: info
	$(COMPOSE) $(COMPOSE_FILES) down

clean: info
	$(COMPOSE) $(COMPOSE_FILES) down --remove-orphans --volumes

restart: down build up

# TerraLab 3D — tareas de desarrollo. Ejecuta `make help` para ver la lista.
SHELL := /bin/bash
PYTHON ?= python3
API_HOST ?= 127.0.0.1
API_PORT ?= 8000
VENV_BIN := .venv/bin

.DEFAULT_GOAL := help
.PHONY: help install install-frontend install-backend install-browsers dev dev-frontend \
	dev-backend lint lint-frontend lint-backend format typecheck test test-frontend \
	test-backend test-e2e build check clean assets assets-fetch assets-process assets-verify \
	geodata worlddata

help: ## Muestra esta ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: install-frontend install-backend ## Instala dependencias de frontend y backend

install-frontend: ## Instala dependencias del frontend (npm ci)
	cd frontend && npm ci

install-backend: ## Crea backend/.venv e instala el backend con versiones fijadas
	cd backend && { test -d .venv || $(PYTHON) -m venv .venv; }
	cd backend && $(VENV_BIN)/python -m pip install --upgrade pip
	cd backend && $(VENV_BIN)/python -m pip install -c requirements.lock -e ".[dev]"

install-browsers: ## Descarga Chromium para las pruebas de Playwright
	cd frontend && npx playwright install chromium

assets: ## Descarga (~400 MB, verificados) y procesa la biblioteca de assets CC0
	cd frontend && npm run assets

assets-fetch: ## Solo descarga los originales y verifica MD5/SHA-256
	cd frontend && npm run assets:fetch

assets-process: ## Solo procesa, valida y regenera catalog.json y docs/ASSETS.md
	cd frontend && npm run assets:process

assets-verify: ## Comprueba la integridad de la biblioteca procesada
	cd frontend && npm run assets:verify

geodata: ## Descarga GeoNames (≈ 14 MB, CC BY 4.0) y genera el nomenclátor local de búsqueda
	cd backend && $(VENV_BIN)/python -m app.data_sources.geocoding.geonames_build

# Región demostrativa: mismas coordenadas que COCHABAMBA_DEMO_PRESET (frontend/src/geo/presets.ts).
DEMO_REGION_ARGS := --name cochabamba-valle-alto-demo --lat -17.551334 --lon -65.861983

worlddata: ## Prepara relieve (NASADEM), cobertura (WorldCover) y OSM de la región demostrativa
	cd backend && $(VENV_BIN)/python -m app.data_sources.world_build $(DEMO_REGION_ARGS)

dev: ## Levanta API y frontend en paralelo (Ctrl+C detiene ambos)
	$(MAKE) -j2 dev-backend dev-frontend

dev-frontend: ## Servidor de desarrollo de Vite en http://localhost:5173
	cd frontend && npm run dev

dev-backend: ## API con recarga automática en http://127.0.0.1:8000
	cd backend && $(VENV_BIN)/uvicorn app.main:app --reload --host $(API_HOST) --port $(API_PORT)

lint: lint-frontend lint-backend ## Lint y formato (sin modificar archivos)

lint-frontend:
	cd frontend && npm run lint && npm run format:check

lint-backend:
	cd backend && $(VENV_BIN)/ruff check . && $(VENV_BIN)/ruff format --check .

format: ## Aplica formato automático (Prettier y Ruff)
	cd frontend && npm run format
	cd backend && $(VENV_BIN)/ruff format . && $(VENV_BIN)/ruff check --fix .

typecheck: ## Comprobación de tipos (tsc y mypy estricto)
	cd frontend && npm run typecheck
	cd backend && $(VENV_BIN)/mypy

test: test-frontend test-backend ## Pruebas unitarias (Vitest y pytest)

test-frontend:
	cd frontend && npm test

test-backend:
	cd backend && $(VENV_BIN)/pytest

test-e2e: ## Pruebas de navegador (Playwright; levanta API y frontend; requiere make assets)
	cd frontend && npm run test:e2e

build: ## Compilación de producción del frontend
	cd frontend && npm run build

check: lint typecheck test build ## Verificación completa (sin e2e)

clean: ## Elimina artefactos de compilación y de pruebas
	rm -rf frontend/dist frontend/test-results frontend/playwright-report frontend/blob-report

.PHONY: help install build dev clean test lint format deploy watch

# Default vault path - override with make deploy VAULT_PATH=/your/vault/path
VAULT_PATH ?= $(HOME)/Documents/Obsidian/TestVault
PLUGIN_ID ?= "canvas-structured-items"
PLUGIN_DIR = $(VAULT_PATH)/.obsidian/plugins/${PLUGIN_ID}
help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	npm install

build: ## Build the plugin for production
	npm run build

dev: ## Build the plugin in development mode (with source maps)
	npm run dev

watch: ## Watch for changes and rebuild automatically
	npm run dev &

clean: ## Clean build artifacts
	rm -f main.js main.js.map
	rm -rf node_modules

test: ## Run tests
	npm test

test-watch: ## Run tests in watch mode
	npm run test:watch

lint: ## Run linter
	npm run lint

lint-fix: ## Run linter and fix issues
	npm run lint -- --fix

format: ## Format code with prettier
	npm run format

check: lint test ## Run linter and tests

deploy: build ## Deploy to Obsidian vault (set VAULT_PATH env var or pass as argument)
	@echo "Deploying to $(PLUGIN_DIR)..."
	@mkdir -p "$(PLUGIN_DIR)"
	@cp main.js manifest.json styles.css "$(PLUGIN_DIR)/"
	@echo "Deployed successfully!"
	@echo "Note: Reload Obsidian or restart the plugin to see changes"

deploy-dev: ## Deploy in development mode with hot reload setup
	@echo "Setting up development deployment to $(PLUGIN_DIR)..."
	@mkdir -p "$(PLUGIN_DIR)"
	@cp manifest.json "$(PLUGIN_DIR)/"
	@echo "Now run 'make watch' to auto-build on changes"
	@echo "Then manually copy main.js to $(PLUGIN_DIR) or set up a symlink"

link: ## Create symlink from vault to build directory (for hot reload)
	@echo "Creating symlink from $(PLUGIN_DIR) to current directory..."
	@mkdir -p "$(VAULT_PATH)/.obsidian/plugins"
	@ln -sf "$(PWD)" "$(PLUGIN_DIR)"
	@echo "Symlink created. Run 'make watch' to auto-build on changes"

unlink: ## Remove symlink
	@rm -f "$(PLUGIN_DIR)"
	@echo "Symlink removed"

version-patch: ## Bump patch version (0.0.X)
	npm version patch

version-minor: ## Bump minor version (0.X.0)
	npm version minor

version-major: ## Bump major version (X.0.0)
	npm version major

all: install build ## Install dependencies and build

dist: clean install build ## Clean build from scratch


# Canvas Structured Items Plugin - Setup & Build Guide

## Overview

This Obsidian plugin creates structured Task and Accomplishment items on Canvas with Notion sync.

## Prerequisites

- Node.js (v16 or higher)
- npm (comes with Node.js)
- Obsidian (latest version)
- An Obsidian vault for testing

## Quick Setup

### Option 1: Quick Start Script (Recommended)

```bash
./quick-start.sh /path/to/your/vault
```

This will:
1. Install dependencies
2. Build the plugin
3. Deploy to your vault

### Option 2: Manual Setup

```bash
# 1. Install dependencies
make install

# 2. Build plugin
make build

# 3. Deploy to vault
make deploy VAULT_PATH=/path/to/your/vault
```

### Option 3: Development Setup (Hot Reload)

```bash
# 1. Install dependencies
make install

# 2. Create symlink to vault
make link VAULT_PATH=/path/to/your/vault

# 3. Start watch mode
make watch
```

Now the plugin will auto-rebuild on file changes. Reload in Obsidian to see changes.

## Building

### Production Build

```bash
make build
```

Creates optimized `main.js` without source maps.

### Development Build

```bash
make dev
```

Creates `main.js` with inline source maps for debugging.

### Watch Mode

```bash
make watch
```

Automatically rebuilds on file changes.

## Testing

### Run Tests

```bash
# All tests
make test

# Watch mode
make test-watch

# With coverage
npm test -- --coverage
```

### Linting & Formatting

```bash
# Lint
make lint

# Lint and fix
make lint-fix

# Format
make format

# Run all checks
make check
```

## Deployment

### Deploy to Vault

```bash
make deploy VAULT_PATH=/path/to/your/vault
```

Copies `main.js` and `manifest.json` to vault's plugin directory.

### Create Symlink (Development)

```bash
make link VAULT_PATH=/path/to/your/vault
```

Creates a symlink so changes are instantly available. Use with `make watch`.

### Remove Symlink

```bash
make unlink
```

## Directory Structure After Build

```
obsidian_plugin/
├── main.js              # Built plugin (generated)
├── main.js.map          # Source maps (dev mode)
├── manifest.json        # Plugin manifest
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
├── esbuild.config.mjs   # Build config
├── Makefile             # Build automation
├── main.ts              # Source entry point
├── types.ts             # Type definitions
├── settings.ts          # Settings UI
├── ui/                  # UI components
├── util/                # Utilities
├── notion/              # Notion integration
└── tests/               # Test files
```

## Enabling in Obsidian

1. **Open Obsidian**
2. **Settings → Community Plugins**
3. **Disable Safe Mode** (if enabled)
4. **Installed Plugins → Canvas Structured Items**
5. **Enable the plugin**
6. **Configure in plugin settings**

## Configuration

### Basic Setup

1. Open plugin settings
2. Set "Notes base folder" (default: `Projects`)
3. Configure effort avenues
4. Customize templates if needed

### Notion Integration (Optional)

1. Create Notion integration at https://www.notion.so/my-integrations
2. Copy integration token
3. Get parent page ID from Notion URL
4. Enable Notion sync in plugin settings
5. Paste token and page ID
6. Click "Initialize Notion Database"
7. Share parent page with integration in Notion

## Troubleshooting

### Build Fails

```bash
# Clean and rebuild
make clean
make install
make build
```

### Plugin Doesn't Load

- Check `main.js` exists
- Verify `manifest.json` is valid
- Look for errors in console (Ctrl+Shift+I)
- Restart Obsidian

### Tests Fail

```bash
# Clear cache and retry
npx jest --clearCache
make test
```

### Permission Errors

```bash
# Make scripts executable
chmod +x quick-start.sh
```

## Version Management

```bash
# Patch version (1.0.X)
make version-patch

# Minor version (1.X.0)
make version-minor

# Major version (X.0.0)
make version-major
```

This updates `manifest.json` and `versions.json`.

## Common Commands Reference

```bash
make help              # Show all commands
make install           # Install dependencies
make build             # Production build
make dev               # Development build
make watch             # Auto-rebuild on changes
make test              # Run tests
make lint              # Run linter
make format            # Format code
make clean             # Clean build artifacts
make deploy            # Deploy to vault
make link              # Create symlink
make check             # Lint + test
```

## Environment Variables

### VAULT_PATH

Set default vault path:

```bash
export VAULT_PATH=/path/to/your/vault
make deploy
```

Or override per-command:

```bash
make deploy VAULT_PATH=/different/vault
```

## Building for Distribution

```bash
# Clean build from scratch
make dist

# Verify files
ls -la main.js manifest.json

# Create release archive
zip -r canvas-structured-items-v1.0.0.zip main.js manifest.json
```

## Development Workflow

1. **Make changes** to TypeScript files
2. **Build** with `make dev` or `make watch`
3. **Reload plugin** in Obsidian (Ctrl+R with debug mode)
4. **Test** changes
5. **Run tests** with `make test`
6. **Lint** with `make lint`
7. **Commit** when satisfied

## Getting Help

- **README.md**: User documentation
- **DEVELOPMENT.md**: Developer guide
- **make help**: Command reference
- **Logs**: `.obsidian/plugins/canvas-structured-items/plugin.log`

## License

MIT - See LICENSE file


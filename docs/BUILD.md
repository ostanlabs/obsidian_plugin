# Canvas Project Manager - Setup & Build Guide

## Overview

This Obsidian plugin transforms Canvas into a full-featured project management tool with hierarchical entity management (Milestones, Stories, Tasks, Decisions, Documents, Accomplishments) and optional Notion sync.

## Prerequisites

- Node.js (v16 or higher)
- npm (comes with Node.js)
- Obsidian (latest version)
- An Obsidian vault for testing

## Quick Setup

### Build and Deploy

```bash
# 1. Install dependencies
npm install

# 2. Build plugin
npm run build

# 3. Deploy to vault
mkdir -p /path/to/vault/.obsidian/plugins/canvas-project-manager
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/canvas-project-manager/
```

### Development Setup (Hot Reload)

```bash
# 1. Install dependencies
npm install

# 2. Start watch mode
npm run dev
```

Now the plugin will auto-rebuild on file changes. Reload in Obsidian to see changes.

## Building

### Production Build

```bash
npm run build
```

Creates optimized `main.js` without source maps.

### Development Build (Watch Mode)

```bash
npm run dev
```

Automatically rebuilds on file changes with source maps.

## Testing

### Run Tests

```bash
# All tests
npm test

# Watch mode
npm test -- --watch

# With coverage
npm test -- --coverage
```

### Linting

```bash
npm run lint
```

## Directory Structure After Build

```
obsidian_plugin/
├── main.js              # Built plugin (generated)
├── manifest.json        # Plugin manifest
├── styles.css           # Visual styling
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
├── esbuild.config.mjs   # Build config
├── main.ts              # Source entry point
├── types.ts             # Type definitions
├── settings.ts          # Settings UI
├── ui/                  # UI components
├── util/                # Utilities
│   ├── canvas.ts        # Canvas JSON manipulation
│   ├── canvasView.ts    # Canvas DOM manipulation
│   ├── entityNavigator.ts # Entity navigation
│   ├── fileNaming.ts    # File naming utilities
│   ├── frontmatter.ts   # YAML frontmatter
│   ├── idGenerator.ts   # ID generation
│   ├── logger.ts        # Logging
│   └── template.ts      # Template processing
├── notion/              # Notion integration
└── tests/               # Test files
```

## Enabling in Obsidian

1. **Open Obsidian**
2. **Settings → Community Plugins**
3. **Disable Safe Mode** (if enabled)
4. **Installed Plugins → Canvas Project Manager**
5. **Enable the plugin**
6. **Configure in plugin settings**

## Configuration

### Basic Setup

1. Open plugin settings
2. Configure entity types and workstreams
3. Set up archive folder preferences

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
rm -rf node_modules
npm install
npm run build
```

### Plugin Doesn't Load

- Check `main.js` exists in plugin folder
- Check `styles.css` exists in plugin folder
- Verify `manifest.json` is valid
- Look for errors in console (Ctrl+Shift+I)
- Restart Obsidian

### Tests Fail

```bash
# Clear cache and retry
npx jest --clearCache
npm test
```

## Common Commands Reference

```bash
npm install            # Install dependencies
npm run build          # Production build
npm run dev            # Development build with watch
npm test               # Run tests
npm run lint           # Run linter
```

## Building for Distribution

```bash
# Clean build from scratch
rm main.js
npm run build

# Verify files
ls -la main.js manifest.json styles.css

# Create release archive
zip -r canvas-project-manager-v2.0.0.zip main.js manifest.json styles.css
```

## Development Workflow

1. **Make changes** to TypeScript files
2. **Build** with `npm run dev` (watch mode)
3. **Reload plugin** in Obsidian (Ctrl+R with debug mode)
4. **Test** changes
5. **Run tests** with `npm test`
6. **Lint** with `npm run lint`
7. **Commit** when satisfied

## Getting Help

- **README.md**: User documentation
- **docs/ARCHITECTURE.md**: Technical architecture
- **docs/GETTING_STARTED.md**: Quick start guide
- **Logs**: `.obsidian/plugins/canvas-project-manager/plugin.log`

## License

MIT - See LICENSE file

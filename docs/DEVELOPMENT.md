# Canvas Project Manager - Development Guide

## Prerequisites

- Node.js v16 or higher
- npm (comes with Node.js)
- Obsidian (latest version)
- An Obsidian vault for testing

## Quick Start

```bash
# Install dependencies
npm install

# Build plugin
npm run build

# Deploy to your vault
mkdir -p /path/to/vault/.obsidian/plugins/canvas-project-manager
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/canvas-project-manager/
```

Then enable in Obsidian: **Settings → Community Plugins → Canvas Project Manager**

## Development Workflow

```bash
# Start watch mode for auto-rebuild
npm run dev
```

1. Edit source files in `main.ts`, `util/`, `notion/`, etc.
2. Watch mode automatically rebuilds
3. Reload plugin in Obsidian (`Ctrl+R` with debug mode enabled)
4. Test changes

## Commands Reference

```bash
npm install            # Install dependencies
npm run build          # Production build
npm run dev            # Development build with watch
npm test               # Run tests
npm test -- --watch    # Run tests in watch mode
npm run lint           # Run linter
```

## Project Structure

```
├── main.ts              # Plugin entry point
├── types.ts             # TypeScript interfaces
├── settings.ts          # Settings UI
├── styles.css           # Visual styling
├── ui/                  # UI components
│   └── StructuredItemModal.ts
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
│   ├── notionClient.ts  # Notion API wrapper
│   └── contentSync.ts   # Content synchronization
└── tests/               # Test files
```

## Key Concepts

### Canvas Manipulation

Canvas files are JSON with nodes and edges:

```json
{
  "nodes": [
    { "id": "unique-id", "type": "file", "x": 0, "y": 0, "file": "path/to/file.md" }
  ],
  "edges": [
    { "id": "edge-id", "fromNode": "node-id", "toNode": "node-id" }
  ]
}
```

We read/write this JSON directly rather than using Canvas internal APIs.

### Entity Frontmatter

Entities use YAML frontmatter:

```yaml
---
id: M-001
type: milestone
title: "Project Alpha Launch"
status: active
workstream: engineering
parent: null
depends_on: []
---
```

## Adding New Features

### Adding a New Command

```typescript
// In main.ts registerCommands()
this.addCommand({
  id: "your-command-id",
  name: "Your Command Name",
  callback: async () => {
    await this.yourCommandHandler();
  },
});
```

### Adding a New Setting

```typescript
// 1. Add to types.ts interface
export interface CanvasItemFromTemplateSettings {
  yourNewSetting: string;
}

// 2. Add to DEFAULT_SETTINGS in types.ts
export const DEFAULT_SETTINGS = {
  yourNewSetting: "default value",
};

// 3. Add UI in settings.ts display()
new Setting(containerEl)
  .setName("Your Setting")
  .setDesc("Description")
  .addText((text) =>
    text
      .setValue(this.plugin.settings.yourNewSetting)
      .onChange(async (value) => {
        this.plugin.settings.yourNewSetting = value;
        await this.plugin.saveSettings();
      })
  );
```

## Testing

Place tests in `tests/` directory with `.test.ts` extension:

```typescript
describe("YourModule", () => {
  it("should do something", () => {
    const result = yourFunction("input");
    expect(result).toBe("expected");
  });
});
```

## Debugging

### View Logs

```bash
cat .obsidian/plugins/canvas-project-manager/plugin.log
tail -f .obsidian/plugins/canvas-project-manager/plugin.log
```

### Add Debug Logging

```typescript
await this.logger?.debug("Debug message", { data: someData });
await this.logger?.info("Info message");
await this.logger?.error("Error message", error);
```

### Developer Tools

Open with `Ctrl+Shift+I` (or `Cmd+Opt+I` on Mac) to view console errors.

## Troubleshooting

### Build Fails

```bash
rm -rf node_modules
npm install
npm run build
```

### Plugin Not Loading

- Check `main.js` exists in plugin folder
- Verify `manifest.json` is valid JSON
- Check console for errors
- Restart Obsidian

### Tests Failing

```bash
npx jest --clearCache
npm test
```

## Release Process

```bash
# Clean build
rm main.js
npm run build

# Verify files
ls -la main.js manifest.json styles.css

# Create release archive
zip -r canvas-project-manager-vX.X.X.zip main.js manifest.json styles.css
```

### Testing Checklist

- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Manual testing in Obsidian
- [ ] Test entity navigation
- [ ] Test archive functionality
- [ ] Test canvas population

## Resources

- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian API Reference](https://github.com/obsidianmd/obsidian-api)
- [Notion API Documentation](https://developers.notion.com/)
- [Canvas Format Spec](https://jsoncanvas.org/)

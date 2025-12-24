# Canvas Project Manager - Development Guide

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

## Development Workflow

### 1. Setup Development Environment

```bash
# Start watch mode for auto-rebuild
npm run dev
```

### 2. Making Changes

1. Edit source files in `main.ts`, `util/`, `notion/`, etc.
2. Watch mode will automatically rebuild
3. In Obsidian, reload plugin (Ctrl+R with debug mode enabled)
4. Test changes

### 3. Testing

```bash
# Run tests once
npm test

# Run tests in watch mode
npm test -- --watch

# Run linter
npm run lint
```

## Architecture

### Core Components

1. **main.ts**: Plugin entry point, command registration, orchestration (~5900 lines)
2. **settings.ts**: Settings UI and configuration management
3. **types.ts**: TypeScript interfaces and type definitions

### Utility Modules

- **util/canvas.ts**: Canvas JSON manipulation (read/write nodes, edges)
- **util/canvasView.ts**: Canvas DOM manipulation (styling, visibility toggles)
- **util/entityNavigator.ts**: Entity relationship navigation and indexing
- **util/fileNaming.ts**: Title-based file naming with collision detection
- **util/frontmatter.ts**: YAML frontmatter parsing/serialization
- **util/idGenerator.ts**: ID generation and scanning
- **util/logger.ts**: Logging to console and file
- **util/template.ts**: Template processing and placeholders

### UI Components

- **ui/StructuredItemModal.ts**: Modal for creating new items

### Integration

- **notion/notionClient.ts**: Notion API wrapper
- **notion/contentSync.ts**: Content synchronization

## Key Concepts

### Entity Types

The plugin supports 6 entity types with distinct visual styles:

| Type | ID Prefix | Border Style | Use Case |
|------|-----------|--------------|----------|
| Milestone | M-xxx | 3px solid | High-level project goals |
| Story | S-xxx | 2px solid | User stories, features |
| Task | T-xxx | 1px solid | Actionable work items |
| Decision | DEC-xxx | 2px dashed | Architectural decisions |
| Document | DOC-xxx | 1px dotted | Technical specs, designs |
| Accomplishment | A-xxx | 2px solid | Completed achievements |

### Canvas Manipulation

Canvas files are JSON with this structure:

```json
{
  "nodes": [
    {
      "id": "unique-id",
      "type": "text|file|link|group",
      "x": 0,
      "y": 0,
      "width": 250,
      "height": 60,
      "text": "...",
      "file": "path/to/file.md"
    }
  ],
  "edges": [
    {
      "id": "edge-id",
      "fromNode": "node-id",
      "fromSide": "right",
      "toNode": "node-id",
      "toSide": "left"
    }
  ]
}
```

We read/write this JSON directly rather than using Canvas internal APIs.

### Entity Frontmatter

Entities use YAML frontmatter with these key fields:

```yaml
---
id: M-001
type: milestone
title: "Project Alpha Launch"
status: active
workstream: engineering
parent: null           # Parent entity ID
depends_on: []         # Dependency IDs
enables: []            # Entities this enables (for decisions)
archived: false
---
```

### Archive System

Entities with `status: archived` or `archived: true` are:
1. Moved to type-specific archive folders (`archive/milestones/`, etc.)
2. Removed from canvas
3. Excluded from future vault scans

### Entity Navigator

The plugin maintains an in-memory index of all entities for fast navigation:
- Parent/child relationships
- Dependencies (`depends_on`)
- Enabled entities (`enables`)
- Related documents and decisions

### Notion Sync

- Uses official `@notionhq/client` library
- One-way sync: Obsidian → Notion
- Stores Notion page ID in frontmatter
- Creates/updates pages based on presence of page ID

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
  // ... existing settings
  yourNewSetting: string;
}

// 2. Add to DEFAULT_SETTINGS in types.ts
export const DEFAULT_SETTINGS = {
  // ... existing defaults
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

### Adding a New Template Placeholder

```typescript
// In util/template.ts replacePlaceholders()
result = result.replace(/\{\{your_placeholder\}\}/g, frontmatter.yourField);
```

### Adding a New Notion Property

```typescript
// In notion/notionClient.ts createDatabase()
// Add to properties object:
"Your Property": {
  rich_text: {}, // or select, date, etc.
},

// In notion/notionClient.ts buildProperties()
// Add to properties object:
"Your Property": {
  rich_text: [
    {
      text: {
        content: frontmatter.yourField,
      },
    },
  ],
},
```

## Testing Guidelines

### Unit Tests

Place tests in `tests/` directory with `.test.ts` extension.

```typescript
import { yourFunction } from "../util/yourModule";

describe("YourModule", () => {
  describe("yourFunction", () => {
    it("should do something", () => {
      const result = yourFunction("input");
      expect(result).toBe("expected");
    });
  });
});
```

### Mocking Obsidian API

```typescript
const mockApp: any = {
  vault: {
    read: jest.fn(),
    write: jest.fn(),
  },
  // ... other methods
};
```

## Debugging

### Enable Debug Mode

1. Obsidian Settings → Community Plugins → Canvas Project Manager
2. Enable "Show debug info" (if available)
3. Open Developer Tools: Ctrl+Shift+I (Cmd+Opt+I on Mac)

### View Logs

```bash
# In vault
cat .obsidian/plugins/canvas-project-manager/plugin.log

# Or tail in real-time
tail -f .obsidian/plugins/canvas-project-manager/plugin.log
```

### Add Debug Logging

```typescript
await this.logger?.debug("Debug message", { data: someData });
await this.logger?.info("Info message");
await this.logger?.warn("Warning message");
await this.logger?.error("Error message", error);
```

## Performance Considerations

### ID Generation
- Scans all markdown files on each ID generation
- For large vaults (1000+ files), consider caching
- Current implementation is acceptable for most use cases

### Canvas Updates
- Reading/writing JSON is fast
- No performance issues expected

### Notion API
- Rate limited by Notion (3 requests/second)
- Plugin doesn't batch requests in v1
- Future: implement request queue

## Code Style

### TypeScript
- Use strict typing
- Avoid `any` where possible
- Document complex functions

### Formatting
- Tabs for indentation (Obsidian convention)
- Run `npm run lint` before committing

### Naming
- camelCase for functions and variables
- PascalCase for classes and interfaces
- UPPER_SNAKE_CASE for constants

## Release Process

### Build Release

```bash
# Clean build
rm main.js
npm run build

# Verify files
ls -la main.js manifest.json styles.css
```

### Testing Checklist

- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Manual testing in Obsidian
- [ ] Test with fresh vault
- [ ] Test Notion integration
- [ ] Test entity navigation
- [ ] Test archive functionality
- [ ] Test canvas population

## Common Issues

### TypeScript Errors

```bash
# Check types
npx tsc --noEmit

# Fix with linter
npm run lint
```

### Plugin Not Loading

- Check console for errors
- Verify `main.js` is up to date
- Check `manifest.json` is valid JSON
- Restart Obsidian

### Tests Failing

- Clear Jest cache: `npx jest --clearCache`
- Check mock data matches interfaces
- Verify imports are correct

## Resources

- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian API Reference](https://github.com/obsidianmd/obsidian-api)
- [Notion API Documentation](https://developers.notion.com/)
- [Canvas Format Spec](https://jsoncanvas.org/)

## Getting Help

- Check logs: `.obsidian/plugins/canvas-project-manager/plugin.log`
- Console errors: Ctrl+Shift+I → Console tab
- Review test files for usage examples
- Check GitHub issues


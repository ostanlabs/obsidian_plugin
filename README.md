# Canvas Accomplishments

A powerful Obsidian plugin that enables structured accomplishment management directly within Canvas, with optional Notion integration.

## Overview

Canvas Accomplishments transforms Obsidian Canvas into a project management tool by allowing you to create and manage structured accomplishment notes with:

- **Rich metadata** (effort, status, priority, dependencies)
- **Auto-generated IDs** (A001, A002, etc.)
- **Visual organization** (color-coded by effort type)
- **Notion sync** (optional bidirectional sync)
- **Canvas-first workflow** (create, convert, manage directly in canvas)

## Features

### Structured Note Creation
- Create accomplishment notes with structured frontmatter
- Auto-generated sequential IDs with configurable prefixes and padding
- Template-based content generation
- Automatic folder organization

### Canvas Integration
- Create notes directly from canvas via Command Palette
- Convert existing text nodes to structured items (right-click menu)
- Color-coded cards based on effort level
- Preserve connections and positioning during conversions
- Track dependencies between accomplishments via canvas edges

### Notion Sync (Optional)
- Automatically create/update Notion database
- Bidirectional sync on note creation or on-demand
- Track sync status in frontmatter

### Smart File Management
- Auto-delete notes when removed from canvas (plugin-created notes only)
- Confirmation dialogs for safety
- Snake_case filename generation with collision detection

## Installation

### From Community Plugins (Recommended)

1. Open Obsidian Settings → Community Plugins
2. Click "Browse" and search for "Canvas Accomplishments"
3. Click "Install" then "Enable"

### Using BRAT (Beta Testing)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat)
2. Open BRAT settings → "Add Beta Plugin"
3. Enter: `ostanlabs/obsidian_plugin`
4. Enable the plugin

### Manual Installation (Development)

1. Clone the repository:
   ```bash
   git clone https://github.com/ostanlabs/obsidian_plugin.git
   cd obsidian_plugin
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Copy files to your vault:
   ```bash
   mkdir -p /path/to/vault/.obsidian/plugins/canvas-accomplishments
   cp main.js manifest.json /path/to/vault/.obsidian/plugins/canvas-accomplishments/
   ```

4. Reload Obsidian and enable the plugin in Settings → Community Plugins

## Usage

### Creating Accomplishments

1. Open a canvas file
2. Press `Ctrl/Cmd+P` → "Canvas Item: New Item From Template"
3. Enter title and select effort type
4. The accomplishment note appears on canvas with all metadata

### Converting Text Nodes

1. Create a text node on canvas with your content
2. Right-click the node → "Convert to Accomplishment"
3. Select effort type
4. Node converts to a file card with structured metadata

### Syncing Dependencies

Canvas edges between accomplishment nodes are automatically synced to the `depends_on` frontmatter field. Use the command "Canvas Item: Sync Edges to Dependencies" to manually sync.

## Configuration

Open Settings → Canvas Accomplishments:

### File & Folder Settings
- **Notes Base Folder**: Where notes are created (default: `Projects`)
- **Infer Folder from Canvas**: Auto-place notes in same folder as canvas

### ID Generation
- **ID Prefix**: Prefix for IDs (default: `A`)
- **ID Zero Padding**: Number of digits (default: 3) → A001, A002...

### Effort Levels
- **Effort Options**: Comma-separated list (Business, Infra, Engineering, Research)
- **Default Effort**: Pre-selected effort in creation modal

### Color Coding

| Effort | Color |
|--------|-------|
| Business | Purple |
| Infra | Orange |
| Engineering | Blue |
| Research | Green |

### Notion Integration (Optional)

1. Create a Notion integration at https://www.notion.so/my-integrations
2. Copy the integration token
3. Enable Notion sync in plugin settings
4. Paste token and parent page ID
5. Click "Initialize Notion Database"

## Commands

| Command | Description |
|---------|-------------|
| Canvas Item: New Item From Template | Create new accomplishment on active canvas |
| Canvas Item: Sync Current Note to Notion | Sync the current note to Notion |
| Canvas Item: Sync All Notes in Current Canvas to Notion | Sync all accomplishments in canvas |
| Canvas Item: Sync Edges to Dependencies | Sync canvas edges to depends_on fields |

## Development

### Setup

```bash
git clone https://github.com/ostanlabs/obsidian_plugin.git
cd obsidian_plugin
npm install
```

### Build Commands

```bash
npm run build      # Production build
npm run dev        # Development build with watch
npm test           # Run tests
npm run lint       # Lint code
```

### Project Structure

```
├── main.ts              # Plugin entry point
├── types.ts             # TypeScript interfaces
├── settings.ts          # Settings UI
├── ui/                  # Modal components
├── util/                # Utility functions
├── notion/              # Notion API integration
└── tests/               # Test suites
```

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: Report bugs via [GitHub Issues](https://github.com/ostanlabs/obsidian_plugin/issues)
- **Documentation**: See the [docs](docs/) folder for detailed guides

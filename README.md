# Canvas Structured Items Plugin for Obsidian

A powerful Obsidian plugin that enables structured task and accomplishment management directly within Canvas, with seamless Notion integration.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Obsidian](https://img.shields.io/badge/Obsidian-0.15.0+-purple.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## 🎯 Overview

Canvas Structured Items transforms Obsidian Canvas into a powerful project management tool by allowing you to create and manage structured notes (Tasks and Accomplishments) with:
- **Rich metadata** (type, effort, status, priority)
- **Auto-generated IDs** (T001, A001, etc.)
- **Visual organization** (color-coded by effort)
- **Notion sync** (optional bidirectional sync)
- **Canvas-first workflow** (create, convert, manage directly in canvas)

## ✨ Key Features

### 📝 Structured Note Creation
- Create **Tasks** and **Accomplishments** with structured frontmatter
- Auto-generated sequential IDs (T001, T002, A001, etc.)
- Template-based content generation
- Automatic folder organization

### 🎨 Canvas Integration
- Create notes directly from canvas (Command Palette or hotkeys)
- Convert existing text nodes to structured items (right-click menu)
- Color-coded cards based on effort level
- Preserve connections and positioning
- Smooth viewport preservation during conversions

### 🔄 Notion Sync (Optional)
- Create/update Notion database automatically
- Bi-directional sync on note creation or on-demand
- Track sync status in frontmatter
- Configure per-project databases

### 🛡️ Smart File Management
- Auto-delete notes when removed from canvas (plugin-created notes only)
- Confirmation dialogs for safety
- Snake_case filename generation with collision detection
- Frontmatter merging for existing notes

### 🎯 Effort Tracking
- Configurable effort levels (Engineering, Design, Strategy, etc.)
- Visual color coding on canvas
- Default effort preferences

## 📦 Installation

### Prerequisites
- Obsidian v0.15.0 or higher
- Node.js v16+ (for development)
- npm or yarn

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd obsidian_plugin
   ```

2. **Install dependencies**
   ```bash
   make install
   ```

3. **Build the plugin**
   ```bash
   make build
   ```

4. **Deploy to your vault**
   ```bash
   make deploy VAULT_PATH=/path/to/your/vault
   ```

5. **Enable in Obsidian**
   - Open Obsidian Settings → Community Plugins
   - Reload plugins
   - Enable "Canvas Structured Items"

### Alternative: Manual Installation

1. Build the plugin: `npm run build`
2. Copy `main.js`, `manifest.json`, `styles.css` to:
   ```
   <vault>/.obsidian/plugins/canvas-structured-items/
   ```
3. Reload Obsidian
4. Enable the plugin

## 🚀 Usage

### Creating Structured Items

#### Method 1: Command Palette (Recommended)
1. Open a canvas
2. Press `Ctrl/Cmd+P` → "Create Canvas Item"
3. Select Type, Effort, enter Title
4. Note appears on canvas with all metadata

#### Method 2: Hotkeys (Set in Settings)
- Assign custom hotkeys to "Create Canvas Item" command
- Quick creation with keyboard shortcuts

### Converting Existing Notes

#### On Canvas (Right-click)
1. Right-click a text node in canvas
2. Select "Convert to Structured Item"
3. Choose Type, Effort, Parent
4. Node converts to file card with metadata

#### Open Note (Command Palette)
1. Open any note
2. Press `Ctrl/Cmd+P` → "Convert Note to Structured Item"
3. Configure metadata
4. Frontmatter added/merged

### File Deletion Safety

When you delete a node from canvas:
1. Plugin detects if the note was created by this plugin
2. Shows confirmation dialog
3. Deletes the markdown file (if confirmed)
4. Only affects plugin-created notes (safety check)

## ⚙️ Configuration

### Plugin Settings

Navigate to Settings → Canvas Structured Items:

#### File & Folder Settings
- **Notes Base Folder**: Where notes are created (default: `Projects`)
- **Infer Folder from Canvas**: Auto-place notes in same folder as canvas

#### ID Generation
- **Task ID Prefix**: Prefix for task IDs (default: `T`)
- **Accomplishment ID Prefix**: Prefix for accomplishment IDs (default: `A`)
- **ID Zero Padding**: Number of digits (default: 3) → T001, T002...

#### Effort Levels
- **Effort Options**: Comma-separated list (Engineering, Design, Strategy, etc.)
- **Default Effort**: Pre-selected effort in creation modal

#### Templates
- **Use Template Folder**: Enable to select from multiple templates
- **Template Folder Path**: Folder containing template files
- **Task Template Path**: Default task template
- **Accomplishment Template Path**: Default accomplishment template

#### Notion Integration
- **Enable Notion Sync**: Toggle sync on/off
- **Integration Token**: Your Notion API token
- **Parent Page ID**: Notion page containing databases
- **Database Name**: Name for auto-created database
- **Sync on Create**: Auto-sync when creating notes
- **Sync on Demand Only**: Manual sync only

### Template Placeholders

Templates support these placeholders:
- `{{id}}`: Auto-generated ID (T001, A001)
- `{{title}}`: Note title
- `{{type}}`: Note type (task/accomplishment)
- `{{effort}}`: Effort level
- `{{date}}`: Current date
- `{{time}}`: Current time
- `{{parent}}`: Parent note/project

## 🎨 Color Coding

Canvas cards are automatically color-coded by effort:

| Effort | Color |
|--------|-------|
| Engineering | Blue |
| Design | Purple |
| Strategy | Green |
| Research | Yellow |
| Default | Red |

Configure effort options in settings to match your workflow.

## 📊 Notion Integration

### Setup

1. **Create Notion Integration**
   - Visit https://www.notion.so/my-integrations
   - Create new integration
   - Copy "Internal Integration Token"

2. **Configure Plugin**
   - Paste token in settings
   - Set Parent Page ID (from Notion page URL)
   - Set Database Name

3. **Connect Database to Page**
   - In Notion, click "..." on your database
   - "Connections" → Add your integration

### Sync Behavior

**Automatic (if enabled):**
- New notes sync on creation
- Updates tracked in frontmatter

**Manual:**
- Command Palette → "Sync Note to Notion"
- Updates existing Notion pages if `notion_page_id` exists
- Creates new pages if not synced yet

### Database Schema

The plugin auto-creates a Notion database with:
- **Title**: Note title
- **ID**: Unique identifier (T001, A001)
- **Type**: Select (Task/Accomplishment)
- **Status**: Select (Not Started, In Progress, Completed, Blocked)
- **Effort**: Select (Engineering, Design, Strategy, etc.)
- **Priority**: Select (Low, Medium, High, Critical)
- **Parent**: Text (parent project/note)
- **File Path**: Text (Obsidian file path)

## 🧪 Development

### Project Structure

```
obsidian_plugin/
├── main.ts              # Plugin entry point
├── types.ts             # TypeScript interfaces
├── settings.ts          # Settings UI
├── ui/                  # Modal components
│   ├── ItemCreationModal.ts
│   ├── ConvertNoteModal.ts
│   └── DeleteConfirmModal.ts
├── util/                # Utility functions
│   ├── canvas.ts        # Canvas JSON manipulation
│   ├── frontmatter.ts   # YAML frontmatter handling
│   ├── idGenerator.ts   # ID generation
│   ├── logger.ts        # Logging utility
│   ├── template.ts      # Template processing
│   └── fileNaming.ts    # Filename generation
├── notion/              # Notion API integration
│   └── notionClient.ts
└── tests/               # Test suites
```

### Build Commands

```bash
# Install dependencies
make install

# Development build (with watch)
make dev

# Production build
make build

# Run tests
make test

# Lint code
make lint

# Format code
make format

# Deploy to vault
make deploy VAULT_PATH=/path/to/vault

# Clean build artifacts
make clean
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## 🐛 Troubleshooting

### Canvas nodes not movable
- Ensure Obsidian is reloaded after plugin installation
- Check console for errors (Ctrl/Cmd+Shift+I)

### Properties not showing
- Verify frontmatter format in markdown file
- Ensure Obsidian is version 0.15.0+

### Notion sync failing
- Check integration token validity
- Verify database connection in Notion
- Check parent page permissions

### Notes not deleting
- Only plugin-created notes auto-delete
- Check `created_by_plugin: true` in frontmatter

## 📚 Additional Documentation

- [**GETTING_STARTED.md**](GETTING_STARTED.md): Quick start guide
- [**DEVELOPMENT.md**](DEVELOPMENT.md): Developer setup and workflows
- [**ARCHITECTURE.md**](ARCHITECTURE.md): Technical architecture details
- [**NEW_FEATURES.md**](NEW_FEATURES.md): Recent feature additions
- [**CANVAS_NODES.md**](CANVAS_NODES.md): Canvas node behavior details

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run linters: `make lint`
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built for the Obsidian community
- Uses [@notionhq/client](https://github.com/makenotion/notion-sdk-js)
- Inspired by productivity workflows in engineering teams

## 📮 Support

- **Issues**: Report bugs via GitHub Issues
- **Discussions**: Feature requests and questions
- **Documentation**: All docs in this repository

---

**Made with ❤️ for better project management in Obsidian**

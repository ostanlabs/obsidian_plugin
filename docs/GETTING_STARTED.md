# Getting Started with Canvas Project Manager

Welcome! This guide will help you build and start using the Canvas Project Manager plugin for Obsidian.

## Prerequisites

Before you begin, ensure you have:

- ✅ **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- ✅ **Obsidian** (latest version) - [Download here](https://obsidian.md/)
- ✅ An **Obsidian vault** for testing

Check your Node.js version:
```bash
node --version  # Should be v16.x or higher
```

## Quick Start (5 minutes)

### Step 1: Build the Plugin

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Copy to your vault
mkdir -p /path/to/vault/.obsidian/plugins/canvas-project-manager
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/canvas-project-manager/
```

### Step 2: Enable in Obsidian

1. Open Obsidian
2. Go to **Settings → Community Plugins**
3. If needed, click **Turn off Safe Mode**
4. Find **Canvas Project Manager** in the installed plugins list
5. Click the toggle to **enable** it
6. (Optional) Click the gear icon to configure settings

### Step 3: Populate Canvas from Vault

1. Create or open a Canvas file (`.canvas`)
2. Press `Ctrl+P` (or `Cmd+P` on Mac) to open command palette
3. Type "Populate" and select **"Project Canvas: Populate from vault"**
4. The plugin will scan your vault for entity files and add them to the canvas

🎉 **Success!** You should see entity nodes appear on your canvas with hierarchical layout.

## Entity Types

The plugin supports 6 entity types, each with distinct visual styling:

| Type | ID Prefix | Border Style | Use Case |
|------|-----------|--------------|----------|
| **Milestone** | M-xxx | 3px solid | High-level project goals |
| **Story** | S-xxx | 2px solid | User stories, features |
| **Task** | T-xxx | 1px solid | Actionable work items |
| **Decision** | DEC-xxx | 2px dashed | Architectural decisions |
| **Document** | DOC-xxx | 1px dotted | Technical specs, designs |
| **Accomplishment** | A-xxx | 2px solid | Completed achievements |

## Creating Entity Files

Entity files are markdown files with YAML frontmatter:

```yaml
---
id: M-001
type: milestone
title: "Project Alpha Launch"
status: active
workstream: engineering
---

# Project Alpha Launch

Description of the milestone...
```

### Hierarchy with `parent` Field

```yaml
---
id: S-001
type: story
title: "User Authentication"
parent: M-001           # This story belongs to milestone M-001
status: in_progress
---
```

### Dependencies with `depends_on` Field

```yaml
---
id: T-001
type: task
title: "Implement login form"
parent: S-001
depends_on:
  - T-002               # This task depends on T-002
  - T-003
status: active
---
```

### Decisions with `enables` Field

```yaml
---
id: DEC-001
type: decision
title: "Use OAuth2 for authentication"
enables:
  - S-001               # This decision enables/unblocks S-001
  - T-001
status: completed
---
```

## Key Commands

### Canvas Population & Layout

| Command | Description |
|---------|-------------|
| **Project Canvas: Populate from vault** | Scan vault and add entities to canvas |
| **Project Canvas: Reposition nodes (graph layout)** | Apply hierarchical layout |
| **Project Canvas: Remove duplicate nodes** | Clean up duplicate entity nodes |

### Entity Navigation

| Command | Hotkey | Description |
|---------|--------|-------------|
| **Entity Navigator: Go to Parent** | Ctrl+Shift+P | Jump to parent entity |
| **Entity Navigator: Go to Children** | - | Jump to child entities |
| **Entity Navigator: Go to Dependencies** | - | Jump to dependencies |
| **Entity Navigator: Go to Documents** | Ctrl+Shift+D | Jump to related documents |
| **Entity Navigator: Go to Decisions** | Ctrl+Shift+E | Jump to related decisions |

### Notion Sync (Optional)

| Command | Description |
|---------|-------------|
| **Project Canvas: Initialize Notion database** | Create Notion database |
| **Project Canvas: Sync current note to Notion** | Sync active note |
| **Project Canvas: Sync all canvas notes to Notion** | Sync all entities |

## Archive System

Entities with `status: archived` or `archived: true` are automatically:

1. **Moved to archive folders**: `archive/milestones/`, `archive/stories/`, etc.
2. **Removed from canvas**: Archived nodes are cleaned up
3. **Excluded from scans**: Archive folder is skipped in future populates

To archive an entity, simply set its status:

```yaml
---
id: T-001
type: task
title: "Old task"
status: archived        # This will trigger archiving
---
```

## Visibility Toggles

When viewing a canvas, you'll see visibility toggle buttons:

- **M** - Toggle Milestones
- **S** - Toggle Stories
- **T** - Toggle Tasks
- **De** - Toggle Decisions
- **Do** - Toggle Documents

Click to show/hide entity types on the canvas.

## Notion Setup (Optional)

Want to sync your items to Notion? Here's how:

### 1. Create Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click **"+ New integration"**
3. Give it a name (e.g., "Obsidian Canvas")
4. Select the workspace
5. Copy the **Internal Integration Token** (starts with `secret_`)

### 2. Get Parent Page ID

1. In Notion, create or open a page where you want the database
2. Copy the page URL
3. Extract the page ID from the URL:
   ```
   https://www.notion.so/My-Page-a1b2c3d4e5f6...
                                ↑ This is the page ID
   ```

### 3. Configure Plugin

1. In Obsidian: **Settings → Canvas Project Manager**
2. Scroll to **Notion Integration** section
3. Toggle **"Enable Notion sync"** to ON
4. Paste your **Integration Token**
5. Paste your **Parent Page ID**
6. Click **"Initialize Notion Database"**

### 4. Share Page with Integration

**Important**: The integration can't access the page until you share it!

1. Go back to your Notion page
2. Click **"Share"** in the top right
3. Click **"Invite"**
4. Select your integration from the dropdown
5. Click **"Invite"**

## Development Workflow

For active development with hot reload:

```bash
# Start watch mode (auto-rebuild on changes)
npm run dev
```

Now every time you save a TypeScript file, the plugin rebuilds automatically. Reload in Obsidian to see changes (Ctrl+R with debug mode enabled).

## Tips & Tricks

### 1. Use Workstreams for Organization

Group related entities by workstream:

```yaml
---
id: M-001
type: milestone
title: "Backend API"
workstream: engineering    # Groups with other engineering items
---
```

The layout algorithm positions entities by workstream lanes.

### 2. Leverage the Entity Navigator

When viewing an entity file:
- **Ctrl+Shift+P** - Jump to parent
- **Ctrl+Shift+D** - Jump to related documents
- **Ctrl+Shift+E** - Jump to related decisions

Or right-click on a canvas node to see navigation options.

### 3. Archive Completed Work

Set `status: archived` to clean up your canvas:

```yaml
status: archived
```

The next "Populate from vault" will move the file to the archive folder and remove it from the canvas.

### 4. View Logs

Having issues? Check the logs:

```bash
# In your vault
cat .obsidian/plugins/canvas-project-manager/plugin.log
```

Or in Obsidian:
1. Press `Ctrl+Shift+I` (Developer Tools)
2. Go to **Console** tab
3. Look for `[Canvas Plugin]` messages

## Troubleshooting

### "No active canvas found"

**Problem**: Command doesn't work
**Solution**: Make sure you have a `.canvas` file open and focused

### Plugin doesn't appear in settings

**Problem**: Plugin not showing up
**Solution**:
1. Check that `main.js` exists in plugin folder
2. Restart Obsidian
3. Verify you ran `npm run build`

### Entities not appearing on canvas

**Problem**: "Populate from vault" doesn't add entities
**Solutions**:
1. Check entity files have valid frontmatter with `type` field
2. Ensure files are not in the `archive/` folder
3. Check console logs for parsing errors

### Notion sync fails

**Problem**: Error when syncing to Notion
**Solutions**:
1. Verify integration token is correct (starts with `secret_`)
2. Check parent page ID is correct
3. **Ensure page is shared with integration** (common mistake!)
4. Check database was initialized (run "Initialize Notion Database")
5. Look at logs for specific error

### Archive folder creation fails

**Problem**: Error creating archive folders
**Solution**: The plugin is now tolerant of existing folders. If you see errors, check file permissions.

## File Locations

After installation, here's where things are:

```
your-vault/
├── .obsidian/
│   └── plugins/
│       └── canvas-project-manager/
│           ├── main.js              # Built plugin
│           ├── manifest.json        # Plugin info
│           ├── styles.css           # Visual styling
│           └── plugin.log           # Logs
├── archive/                         # Archived entities
│   ├── milestones/
│   ├── stories/
│   ├── tasks/
│   ├── decisions/
│   ├── documents/
│   └── accomplishments/
└── [your entity files]              # Active entities
    ├── M-001_project_alpha.md
    ├── S-001_user_auth.md
    └── T-001_login_form.md
```

## Learn More

- **README.md** - Complete user guide
- **ARCHITECTURE.md** - Technical architecture
- **DEVELOPMENT.md** - Developer documentation

## Get Help

- Check **logs**: `.obsidian/plugins/canvas-project-manager/plugin.log`
- Open **console**: `Ctrl+Shift+I` → Console tab
- Review **README.md** for detailed documentation
- Create an issue on GitHub

## What's Next?

Now that you're set up, try:

1. **Create entity files** with proper frontmatter (type, id, parent, depends_on)
2. **Run "Populate from vault"** to add entities to your canvas
3. **Run "Reposition nodes"** to apply hierarchical layout
4. **Use Entity Navigator** to quickly navigate relationships
5. **Archive completed work** by setting `status: archived`
6. **Set up Notion sync** to track items in a dashboard

Enjoy using Canvas Project Manager! 🚀

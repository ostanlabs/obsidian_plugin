# Getting Started with Canvas Structured Items

Welcome! This guide will help you build and start using the Canvas Structured Items plugin for Obsidian.

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
# Make the quick start script executable (first time only)
chmod +x quick-start.sh

# Run the quick start script
./quick-start.sh /path/to/your/vault
```

The script will:
1. Install dependencies
2. Build the plugin
3. Deploy to your vault

### Step 2: Enable in Obsidian

1. Open Obsidian
2. Go to **Settings → Community Plugins**
3. If needed, click **Turn off Safe Mode**
4. Find **Canvas Structured Items** in the installed plugins list
5. Click the toggle to **enable** it
6. (Optional) Click the gear icon to configure settings

### Step 3: Create Your First Item

1. Create or open a Canvas file (`.canvas`)
2. Press `Ctrl+P` (or `Cmd+P` on Mac) to open command palette
3. Type "Canvas: New Item" and select **"Canvas: New Item From Template (Center Position)"**
4. Fill in the modal:
   - **Type**: Task
   - **Effort**: Engineering
   - **Title**: My First Task
5. Click **Create**

🎉 **Success!** You should see a new note created and linked on your canvas.

## What Just Happened?

The plugin:
1. Generated a unique ID (e.g., `T001`)
2. Created a note from the task template at `Projects/T001-My-First-Task.md`
3. Filled in frontmatter with metadata
4. Added a file node to your canvas linking to the note
5. (If Notion is configured) Synced to Notion database

## Next Steps

### Explore the Note

Open the newly created note to see:
- **Frontmatter** with all metadata (type, effort, ID, status, etc.)
- **Template sections** (Objective, Steps, Notes)
- **Checkboxes** for tracking progress

### Try an Accomplishment

1. Run the command again
2. This time select **Type: Accomplishment**
3. Notice the different template and ID prefix (A001)

### Customize Templates

1. Go to **Settings → Canvas Structured Items → Templates**
2. Note the template paths (e.g., `Templates/canvas-task-template.md`)
3. Open these files in your vault and customize them
4. Your changes will be used for all future items

### Set Up Notion (Optional)

See the [Notion Setup Guide](#notion-setup-optional) below.

## Manual Build (Alternative to Quick Start)

If you prefer step-by-step control:

```bash
# 1. Install dependencies
make install

# 2. Build the plugin
make build

# 3. Deploy to your vault
make deploy VAULT_PATH=/path/to/your/vault
```

## Development Workflow

For active development with hot reload:

```bash
# 1. Create a symlink to your vault (one-time setup)
make link VAULT_PATH=/path/to/your/vault

# 2. Start watch mode (auto-rebuild on changes)
make watch
```

Now every time you save a TypeScript file, the plugin rebuilds automatically. Reload in Obsidian to see changes (Ctrl+R with debug mode enabled).

## Notion Setup (Optional)

Want to sync your items to Notion? Here's how:

### 1. Create Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click **"+ New integration"**
3. Give it a name (e.g., "Obsidian Canvas Items")
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

1. In Obsidian: **Settings → Canvas Structured Items**
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

### 5. Test Sync

1. Create a new item in Obsidian
2. Check Notion - you should see a new database with your item!

## Common Commands

```bash
make help              # Show all available commands
make build             # Build for production
make dev               # Build with source maps
make watch             # Auto-rebuild on changes
make test              # Run tests
make lint              # Check code style
make format            # Format code
make clean             # Clean build artifacts
```

## Keyboard Shortcuts

You can assign keyboard shortcuts to commands:

1. **Settings → Hotkeys**
2. Search for "Canvas"
3. Click the `+` next to a command
4. Press your desired key combination

Suggested shortcuts:
- `Canvas: New Item From Template`: `Ctrl+Shift+N`
- `Canvas Item: Sync Current Note to Notion`: `Ctrl+Shift+S`

## Tips & Tricks

### 1. Customize Effort Avenues

Add your own categories:

1. **Settings → Canvas Structured Items → Effort Avenues**
2. Edit the list (one per line):
   ```
   Business
   Infra
   Engineering
   Research
   Design       # Added!
   Marketing    # Added!
   ```

### 2. Change ID Format

Prefer different IDs?

1. **Settings → Canvas Structured Items → ID Generation**
2. Change prefixes: `T` → `TASK`, `A` → `GOAL`
3. Change padding: `3` → `4` (for `0001` instead of `001`)

### 3. Auto-Create Notes in Canvas Folder

1. **Settings → Canvas Structured Items → General**
2. Enable **"Infer base folder from canvas location"**

Now notes are created in the same folder as your canvas!

### 4. View Logs

Having issues? Check the logs:

```bash
# In your vault
cat .obsidian/plugins/canvas-structured-items/plugin.log
```

Or in Obsidian:
1. Press `Ctrl+Shift+I` (Developer Tools)
2. Go to **Console** tab
3. Look for plugin messages

## Troubleshooting

### "No active canvas found"

**Problem**: Command doesn't work  
**Solution**: Make sure you have a `.canvas` file open and focused

### Plugin doesn't appear in settings

**Problem**: Plugin not showing up  
**Solution**:
1. Check that `main.js` exists in plugin folder
2. Restart Obsidian
3. Verify you ran `make build`

### Notion sync fails

**Problem**: Error when syncing to Notion  
**Solutions**:
1. Verify integration token is correct (starts with `secret_`)
2. Check parent page ID is correct
3. **Ensure page is shared with integration** (common mistake!)
4. Check database was initialized (run "Initialize Notion Database")
5. Look at logs for specific error

### Templates not found

**Problem**: "Template not found" error  
**Solution**:
1. Check template paths in settings
2. Click "Regenerate default templates"
3. Verify `Templates/` folder exists

### Build errors

**Problem**: `make build` fails  
**Solution**:
```bash
# Clean and reinstall
make clean
rm -rf node_modules
make install
make build
```

## File Locations

After installation, here's where things are:

```
your-vault/
├── .obsidian/
│   └── plugins/
│       └── canvas-structured-items/
│           ├── main.js              # Built plugin
│           ├── manifest.json        # Plugin info
│           └── plugin.log           # Logs
├── Templates/
│   ├── canvas-task-template.md         # Task template
│   └── canvas-accomplishment-template.md  # Accomplishment template
└── Projects/                        # Generated notes (default)
    ├── T001-My-First-Task.md
    └── A001-My-First-Accomplishment.md
```

## Learn More

- **README.md** - Complete user guide
- **DEVELOPMENT.md** - Developer documentation
- **BUILD.md** - Detailed build instructions
- **make help** - List all commands

## Get Help

- Check **logs**: `.obsidian/plugins/canvas-structured-items/plugin.log`
- Open **console**: `Ctrl+Shift+I` → Console tab
- Review **README.md** for detailed documentation
- Create an issue on GitHub (if available)

## What's Next?

Now that you're set up, try:

1. **Create multiple tasks** and see IDs increment (T001, T002, T003)
2. **Create an accomplishment** and link tasks to it using the Parent field
3. **Customize templates** to match your workflow
4. **Set up Notion sync** to track items in a dashboard
5. **Explore settings** to configure the plugin to your liking

Enjoy using Canvas Structured Items! 🚀


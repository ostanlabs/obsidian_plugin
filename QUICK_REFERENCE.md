# Canvas Structured Items - Quick Reference

## 🚀 Quick Commands

| Action | Method |
|--------|--------|
| **Create new item** | `Ctrl/Cmd+P` → "Create Canvas Item" |
| **Convert text node** | Right-click node → "Convert to Structured Item" |
| **Convert open note** | `Ctrl/Cmd+P` → "Convert Note to Structured Item" |
| **Sync to Notion** | `Ctrl/Cmd+P` → "Sync Note to Notion" |

## 📁 File Structure

```
Your Vault/
├── Projects/                    # Base folder (configurable)
│   ├── MyProject/
│   │   ├── T001-task.md        # Task files
│   │   ├── A001-accomplishment.md
│   │   └── MyProject.canvas     # Canvas file
└── .obsidian/
    └── plugins/
        └── canvas-structured-items/
```

## 🏷️ Frontmatter Fields

```yaml
---
type: task|accomplishment
title: Note title
id: T001|A001
effort: Engineering|Design|Strategy|etc
status: Not Started|In Progress|Completed|Blocked
priority: Low|Medium|High|Critical
parent: Parent project name
created_by_plugin: true
notion_page_id: (auto-filled if synced)
---
```

## 🎨 Color Coding

| Effort | Canvas Color |
|--------|-------------|
| Engineering | 🔵 Blue |
| Design | 🟣 Purple |
| Strategy | 🟢 Green |
| Research | 🟡 Yellow |
| Other | 🔴 Red |

## 🔧 Build Commands

```bash
make install          # Install dependencies
make build            # Build plugin
make dev              # Watch mode
make test             # Run tests
make deploy           # Deploy to vault
make clean            # Clean build artifacts
```

## ⚙️ Settings Location

`Settings → Community Plugins → Canvas Structured Items`

### Key Settings
- **Notes Base Folder**: Where notes are created
- **ID Prefixes**: T for tasks, A for accomplishments
- **Effort Options**: Customize effort levels
- **Notion Token**: For Notion integration

## 🔗 Template Placeholders

| Placeholder | Replaced With |
|-------------|---------------|
| `{{id}}` | Generated ID (T001, A001) |
| `{{title}}` | Note title |
| `{{type}}` | task or accomplishment |
| `{{effort}}` | Selected effort level |
| `{{date}}` | Current date |
| `{{time}}` | Current time |
| `{{parent}}` | Parent project |

## 🐛 Troubleshooting

### Nodes not movable?
- Reload Obsidian after plugin installation
- Check console for errors (Ctrl/Cmd+Shift+I)

### Properties not showing?
- Verify frontmatter format
- Ensure Obsidian v0.15.0+

### Notion sync failing?
- Check integration token
- Verify database connection
- Check parent page permissions

### Notes not deleting?
- Only plugin-created notes auto-delete
- Check `created_by_plugin: true` in frontmatter

## 📚 Documentation

- **README.md**: Main documentation
- **docs/GETTING_STARTED.md**: Quick start
- **docs/DEVELOPMENT.md**: Developer guide
- **CONTRIBUTING.md**: How to contribute

## 🔐 Notion Setup

1. Create integration at https://www.notion.so/my-integrations
2. Copy "Internal Integration Token"
3. Paste in plugin settings
4. Set Parent Page ID (from Notion URL)
5. Connect database to integration in Notion

## 💡 Tips

- **Hotkeys**: Assign custom hotkeys in Obsidian settings
- **Templates**: Store multiple templates in a folder
- **Folders**: Enable "Infer from Canvas" to auto-organize
- **IDs**: Customize padding for more/fewer digits
- **Sync**: Disable auto-sync for manual control

## 📞 Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Docs**: All in repository

---

**Version**: 1.0.0  
**License**: MIT  
**Repository**: https://github.com/YOUR_USERNAME/obsidian_plugin


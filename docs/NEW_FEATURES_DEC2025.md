# New Features - December 2025

## 1. Convert Existing Notes to Structured Items

You can now convert any regular markdown note into a structured Task or Accomplishment item!

### How to Use

**Method 1: Command Palette (when note is open)**
1. Open any markdown note
2. Press `Ctrl+P` (or `Cmd+P` on Mac)
3. Type "Convert Note to Structured Item"
4. Fill in the modal:
   - **Type**: Task or Accomplishment
   - **Effort**: Select effort level
   - **Parent**: Optional parent item ID
   - **Keep original filename**: Toggle to keep current name or rename to `ID_snake_case.md`

**Method 2: Right-click Context Menu**
1. Right-click anywhere in an open note
2. Select "Convert to Structured Item"
3. Fill in the same modal

### What Happens

- **Frontmatter Added**: The plugin adds structured frontmatter (ID, type, effort, etc.)
- **Existing Frontmatter Preserved**: Any existing frontmatter fields are kept
- **Optional Rename**: If "Keep original filename" is unchecked:
  - File is renamed to `{ID}_{snake_case_title}.md`
  - If a file with that name exists, a number is appended: `T001_my_note_1.md`
- **Notion Sync**: If enabled, the note is automatically synced to Notion

### Example

**Before:**
```markdown
# My Project Notes

Some content here...
```

**After (with rename disabled):**
```markdown
---
type: task
title: My Project Notes
effort: medium
id: T042
parent: 
status: todo
priority: medium
created: 2025-12-06T10:30:00Z
updated: 2025-12-06T10:30:00Z
canvas_source: 
---

# My Project Notes

Some content here...
```

---

## 2. Auto-Delete Notes When Removed from Canvas

Plugin-created notes are now automatically cleaned up when removed from canvases!

### How It Works

- **Canvas Monitoring**: The plugin watches for changes to `.canvas` files
- **Deletion Detection**: When a file node is removed from a canvas
- **Safety Check**: Only notes created by this plugin (with structured frontmatter) are affected
- **Confirmation Dialog**: A modal appears asking you to confirm deletion
- **Immediate Deletion**: The note is removed from **all** canvases, not just the one you're editing

### Safety Features

✅ **Only Plugin-Created Notes**: Regular notes are never auto-deleted  
✅ **Confirmation Required**: You must explicitly confirm the deletion  
✅ **Trash Instead of Permanent Delete**: Notes go to the trash, not deleted permanently  
✅ **Logged**: All deletions are logged for tracking  

### Example Workflow

1. You create a Task note from a canvas
2. Later, you remove that task card from the canvas
3. A dialog appears:
   ```
   Delete Note?
   
   Are you sure you want to delete "T001-My Task"?
   
   This note was created by Canvas Structured Items and will be 
   removed from all canvases.
   
   [Delete]  [Cancel]
   ```
4. Click **Delete** to confirm, or **Cancel** to keep the note

---

## 3. Automatic Canvas Refresh

Canvas views now automatically refresh when you create items!

### What Changed

**Before**: You had to:
1. Create an item
2. Close the canvas tab
3. Reopen the canvas to see the new card

**Now**: When you create an item:
1. The canvas automatically reloads
2. The new card appears immediately
3. The card is fully interactive (movable, connectable)

### Technical Details

- The plugin now calls `reloadCanvasViews()` after adding nodes to the canvas JSON
- All open canvas views for that file are refreshed automatically
- No manual intervention needed!

---

## 4. Snake Case File Naming with Auto-Increment

When converting notes or creating items, filenames now follow best practices!

### Naming Convention

**Pattern**: `{ID}_{snake_case_title}.md`

**Examples**:
- `T001_implement_user_auth.md`
- `A005_completed_project_setup.md`
- `T042_fix_login_bug_3.md` (auto-incremented if name exists)

### Auto-Increment Logic

If a file with the same name already exists:
- `T001_my_task.md` → `T001_my_task_1.md`
- `T001_my_task_1.md` → `T001_my_task_2.md`
- And so on...

This prevents accidental overwrites and ensures unique filenames!

---

## Settings

No new settings required! All features work with your existing configuration.

### Relevant Settings

- **Notes Base Folder**: Where converted/created notes are saved
- **Infer Base Folder from Canvas**: If enabled, notes are saved in the same folder as the canvas
- **Notion Sync**: If enabled, converted notes are automatically synced

---

## Tips & Best Practices

1. **Convert Existing Notes**: Use this to bring your existing project notes into the structured system
2. **Batch Conversion**: You can convert multiple notes one by one to organize your projects
3. **Safe Deletion**: The confirmation dialog prevents accidental deletions
4. **Keep or Rename**: Choose whether to preserve original filenames or use the structured naming
5. **Check Logs**: If something unexpected happens, check `.obsidian/logs/canvas-structured-items/` for details

---

## Known Limitations

- **Canvas Monitoring Delay**: There may be a 1-2 second delay between removing a card and the deletion confirmation appearing
- **Multiple Canvas References**: If a note is in multiple canvases and you remove it from one, it will be deleted from all (by design)
- **Frontmatter Format**: Only notes with the structured frontmatter format are recognized as plugin-created

---

## Troubleshooting

### "Canvas not refreshing automatically"
- Try reloading Obsidian (`Ctrl+R` or `Cmd+R`)
- Check if you have multiple canvas views open

### "Deletion confirmation not appearing"
- Make sure the note has the correct frontmatter structure
- Check the logs for errors

### "File naming conflicts"
- The plugin automatically increments numbers if a file exists
- If you see unexpected names, check if you have existing files with similar names

---

**Version**: 1.0  
**Last Updated**: December 6, 2025


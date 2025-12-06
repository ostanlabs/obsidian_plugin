# Canvas Structured Items - Testing & Verification Checklist

Use this checklist to verify that the plugin is working correctly after building and deploying.

## ✅ Pre-Build Verification

- [ ] Node.js is installed (v16+): `node --version`
- [ ] npm is installed: `npm --version`
- [ ] All source files are present (see file list below)
- [ ] No syntax errors in TypeScript files

## ✅ Build Process

- [ ] Dependencies install successfully: `make install`
- [ ] Build completes without errors: `make build`
- [ ] `main.js` file is generated
- [ ] `main.js` is not empty (check file size > 100KB)
- [ ] No TypeScript compilation errors
- [ ] No ESLint warnings

## ✅ Deployment

- [ ] Plugin files copied to vault: `make deploy VAULT_PATH=/path/to/vault`
- [ ] Files present in `.obsidian/plugins/canvas-structured-items/`:
  - [ ] `main.js`
  - [ ] `manifest.json`
- [ ] manifest.json is valid JSON
- [ ] Plugin version matches expected version (1.0.0)

## ✅ Obsidian Integration

- [ ] Obsidian can be opened without errors
- [ ] Plugin appears in Settings → Community Plugins
- [ ] Plugin can be enabled
- [ ] No console errors when enabling plugin
- [ ] Plugin settings tab appears
- [ ] Settings tab loads without errors

## ✅ Settings Verification

### General Settings
- [ ] "Notes base folder" setting is visible
- [ ] Can change notes base folder
- [ ] "Infer base folder from canvas location" toggle works
- [ ] Settings persist after restart

### Templates
- [ ] "Task template path" is visible
- [ ] "Accomplishment template path" is visible
- [ ] "Regenerate default templates" button works
- [ ] Default templates are created in vault
- [ ] Can open and edit template files

### ID Generation
- [ ] "Task ID prefix" setting works
- [ ] "Accomplishment ID prefix" setting works
- [ ] "ID zero-padding length" accepts numbers
- [ ] Invalid inputs are rejected

### Effort Avenues
- [ ] "Effort options" text area is visible
- [ ] Can add/remove effort options
- [ ] Default effort dropdown updates when options change
- [ ] Changes persist

### Notion Integration
- [ ] "Enable Notion sync" toggle appears
- [ ] When disabled, other Notion settings are hidden
- [ ] When enabled, all Notion settings appear
- [ ] Integration token field is password-masked
- [ ] "Initialize Notion Database" button appears

## ✅ Commands Availability

- [ ] Command palette (Ctrl+P) opens
- [ ] "Canvas: New Item From Template" appears in search
- [ ] "Canvas: Create Item From Template (Selected Node)" appears
- [ ] "Canvas Item: Initialize Notion Database" appears
- [ ] "Canvas Item: Sync Current Note to Notion" appears

## ✅ Creating Items - Basic

### Prerequisites
- [ ] Create a test canvas file
- [ ] Open the canvas file

### Test: Create Task
1. [ ] Run command "Canvas: New Item From Template (Center Position)"
2. [ ] Modal opens successfully
3. [ ] Modal has all fields:
   - [ ] Type dropdown (Task/Accomplishment)
   - [ ] Effort dropdown (shows custom options)
   - [ ] Title input
   - [ ] Parent input (optional)
4. [ ] Fill in:
   - Type: Task
   - Effort: Engineering
   - Title: "Test Task 1"
5. [ ] Click "Create"
6. [ ] Modal closes
7. [ ] Success notice appears
8. [ ] Note is created in vault
9. [ ] Note has correct path (e.g., `Projects/T001-Test-Task-1.md`)
10. [ ] Note opens successfully
11. [ ] Frontmatter is present and valid
12. [ ] All frontmatter fields are filled:
    - [ ] `type: task`
    - [ ] `title: Test Task 1`
    - [ ] `effort: Engineering`
    - [ ] `id: T001`
    - [ ] `status: todo`
    - [ ] `priority: medium`
    - [ ] `created` has timestamp
    - [ ] `updated` has timestamp
    - [ ] `canvas_source` has canvas path
    - [ ] `vault_path` has note path
13. [ ] Canvas file is updated
14. [ ] New file node appears on canvas
15. [ ] File node links to created note

### Test: Create Accomplishment
1. [ ] Run command again
2. [ ] Change Type to "Accomplishment"
3. [ ] Change Title to "Test Accomplishment 1"
4. [ ] Click "Create"
5. [ ] Note is created with ID `A001`
6. [ ] Frontmatter has `type: accomplishment`
7. [ ] Frontmatter has `priority: high` (default for accomplishments)
8. [ ] Template sections are different from task
9. [ ] Canvas is updated with new node

### Test: ID Increment
1. [ ] Create another task (any name)
2. [ ] Check that ID is `T002` (incremented)
3. [ ] Create another accomplishment
4. [ ] Check that ID is `A002` (incremented)

## ✅ Template System

### Test: Template Usage
- [ ] Task template is used for tasks
- [ ] Accomplishment template is used for accomplishments
- [ ] Placeholders are replaced correctly
- [ ] No `{{placeholder}}` remains in generated notes

### Test: Template Customization
1. [ ] Open task template file
2. [ ] Add custom text (e.g., "Custom section")
3. [ ] Save template
4. [ ] Create new task
5. [ ] Check new task contains custom text

### Test: Template Regeneration
1. [ ] Delete template file
2. [ ] Click "Regenerate default templates"
3. [ ] Template is recreated
4. [ ] Template content matches default

## ✅ ID Generation

### Test: Scanning
1. [ ] Create 3 tasks (should be T001, T002, T003)
2. [ ] Manually delete T002 note
3. [ ] Create new task
4. [ ] Check that ID is T004 (not reusing T002)

### Test: Custom Prefixes
1. [ ] Change Task ID prefix to "TASK"
2. [ ] Change Accomplishment ID prefix to "GOAL"
3. [ ] Create new task
4. [ ] Check ID starts with "TASK"
5. [ ] Create new accomplishment
6. [ ] Check ID starts with "GOAL"

### Test: Zero Padding
1. [ ] Change zero-padding to 4
2. [ ] Create new task
3. [ ] Check ID format is `T0001` (4 digits)

## ✅ Effort Avenues

### Test: Custom Efforts
1. [ ] Add new effort "Design" to list
2. [ ] Save settings
3. [ ] Open item creation modal
4. [ ] Check that "Design" appears in dropdown
5. [ ] Create item with "Design" effort
6. [ ] Check frontmatter has `effort: Design`

### Test: Default Effort
1. [ ] Change default effort to "Business"
2. [ ] Open modal
3. [ ] Check that "Business" is pre-selected

## ✅ Logging

### Test: Log File
- [ ] Log file exists: `.obsidian/plugins/canvas-structured-items/plugin.log`
- [ ] Log file contains entries
- [ ] Log entries have timestamps
- [ ] Log entries have levels (INFO, WARN, ERROR)
- [ ] Creating an item adds log entries

### Test: Console Logging
1. [ ] Open Developer Tools (Ctrl+Shift+I)
2. [ ] Go to Console tab
3. [ ] Enable plugin
4. [ ] Check for "Plugin loaded" message
5. [ ] Create an item
6. [ ] Check for log messages in console

## ✅ Notion Integration (Optional)

### Prerequisites
- [ ] Have Notion account
- [ ] Create Notion integration
- [ ] Get integration token
- [ ] Get parent page ID

### Test: Configuration
1. [ ] Enable Notion sync in settings
2. [ ] Paste integration token
3. [ ] Paste parent page ID
4. [ ] Save settings

### Test: Database Initialization
1. [ ] Click "Initialize Notion Database"
2. [ ] Wait for success message
3. [ ] Check Database ID is filled in settings
4. [ ] Open Notion
5. [ ] Check that new database appears in parent page
6. [ ] Check database has all properties:
   - [ ] Name (title)
   - [ ] Type (select)
   - [ ] Effort (select)
   - [ ] ID (text)
   - [ ] Status (select)
   - [ ] Priority (select)
   - [ ] Parent (text)
   - [ ] Canvas Source (text)
   - [ ] Vault Path (text)
   - [ ] Last Synced (date)

### Test: Auto Sync
1. [ ] Ensure "Sync on note creation" is enabled
2. [ ] Create new task in Obsidian
3. [ ] Check Notion database
4. [ ] Verify new page appears
5. [ ] Check all fields are populated correctly
6. [ ] Open Obsidian note
7. [ ] Check `notion_page_id` is filled in frontmatter

### Test: Manual Sync
1. [ ] Create task WITHOUT Notion auto-sync
2. [ ] Open the created note
3. [ ] Run "Canvas Item: Sync Current Note to Notion"
4. [ ] Check success message
5. [ ] Check Notion database for new page
6. [ ] Check frontmatter for `notion_page_id`

### Test: Update Sync
1. [ ] Open an existing synced note
2. [ ] Change title in frontmatter
3. [ ] Run manual sync command
4. [ ] Check Notion page is updated

## ✅ Error Handling

### Test: No Canvas
1. [ ] Open a markdown note (not canvas)
2. [ ] Run "New Item From Template"
3. [ ] Check for "No active canvas found" message

### Test: Missing Template
1. [ ] Delete template file
2. [ ] Don't regenerate
3. [ ] Create item
4. [ ] Should use default template (fallback)

### Test: Notion Errors
1. [ ] Disable internet
2. [ ] Try to sync to Notion
3. [ ] Check for error message
4. [ ] Check log file for error details

### Test: Invalid Settings
1. [ ] Set ID padding to invalid value (e.g., "abc")
2. [ ] Check that invalid input is rejected or ignored

## ✅ Canvas Integration

### Test: File Node Creation
- [ ] Created items appear as file nodes on canvas
- [ ] File nodes are linked to correct notes
- [ ] Clicking node opens note
- [ ] Node position is at canvas center (or reasonable default)

### Test: Canvas Persistence
1. [ ] Create item on canvas
2. [ ] Close canvas
3. [ ] Reopen canvas
4. [ ] Check node is still present

## ✅ Cross-Platform (If Applicable)

### Windows
- [ ] Plugin builds successfully
- [ ] Plugin loads without errors
- [ ] All features work

### macOS
- [ ] Plugin builds successfully
- [ ] Plugin loads without errors
- [ ] All features work

### Linux
- [ ] Plugin builds successfully
- [ ] Plugin loads without errors
- [ ] All features work

## ✅ Performance

- [ ] Creating item completes in < 2 seconds
- [ ] Modal opens instantly
- [ ] Settings page loads instantly
- [ ] No lag when typing in modal
- [ ] Canvas updates immediately after creation

## ✅ Data Integrity

- [ ] Created notes have valid frontmatter
- [ ] Canvas JSON is valid after updates
- [ ] Settings persist after Obsidian restart
- [ ] Log file doesn't grow excessively large
- [ ] No data loss on plugin disable/enable

## ✅ Documentation

- [ ] README.md is complete and accurate
- [ ] GETTING_STARTED.md is helpful for beginners
- [ ] BUILD.md has correct build instructions
- [ ] DEVELOPMENT.md has useful dev info
- [ ] All commands listed in docs exist
- [ ] All settings listed in docs exist

## ✅ Tests

- [ ] `make test` runs successfully
- [ ] All tests pass
- [ ] No test errors or warnings
- [ ] Test coverage is reasonable

## ✅ Code Quality

- [ ] `make lint` shows no errors
- [ ] Code is properly formatted
- [ ] No console warnings in development
- [ ] TypeScript types are correct
- [ ] No `any` types where avoidable

## Summary Checklist

Core functionality:
- [ ] ✅ Build system works
- [ ] ✅ Plugin loads in Obsidian
- [ ] ✅ Can create tasks
- [ ] ✅ Can create accomplishments
- [ ] ✅ IDs auto-generate correctly
- [ ] ✅ Templates work
- [ ] ✅ Canvas integration works
- [ ] ✅ Settings persist
- [ ] ✅ Logging works

Optional features:
- [ ] ✅ Notion sync works (if configured)
- [ ] ✅ Custom efforts work
- [ ] ✅ Template customization works

## Issue Tracking

If any test fails, record here:

| Test | Status | Issue | Resolution |
|------|--------|-------|------------|
| Example | ❌ Failed | Error message | Fixed by... |
|  |  |  |  |
|  |  |  |  |

## Sign-Off

- [ ] All critical tests pass
- [ ] All optional tests pass (or documented as known limitations)
- [ ] Documentation is accurate
- [ ] Ready for use

**Tested by**: _______________  
**Date**: _______________  
**Version**: 1.0.0  
**Status**: ⬜ Pass / ⬜ Fail  

---

**Note**: This checklist is comprehensive. Some items may not apply to your specific setup (e.g., Notion integration if you don't use Notion). Focus on the core functionality first, then test optional features as needed.


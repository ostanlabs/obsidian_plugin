# New Features Added - Template Selection & Right-Click Menu

## 🎉 What's New

Two powerful features have been added to the Canvas Structured Items plugin:

### 1. Template Folder Support

**Select from multiple templates in your vault!**

#### How it works:
- Enable "Use template folder" in settings
- Place multiple template files in a folder (default: `Templates/`)
- When creating items, choose which template to use from a dropdown

#### Setup:
1. Go to **Settings → Canvas Structured Items → Templates**
2. Enable **"Use template folder"**
3. Set your **Template folder** path (e.g., `Templates`)
4. Create multiple template files in that folder:
   - Name them with `task` or `accomplishment` in the filename for auto-filtering
   - Examples:
     - `Templates/task-bug-fix.md`
     - `Templates/task-feature.md`
     - `Templates/accomplishment-milestone.md`
     - `Templates/accomplishment-release.md`

#### Using templates:
- When you create an item, you'll see a **Template** dropdown
- Select which template you want to use
- The plugin filters templates by type automatically (task templates for tasks, etc.)

#### Example folder structure:
```
Templates/
├── task-bug-fix.md           # For bug fix tasks
├── task-feature.md           # For new features
├── task-refactor.md          # For refactoring work
├── accomplishment-sprint.md  # For sprint goals
├── accomplishment-release.md # For releases
└── generic-template.md       # Works for both (no type in name)
```

### 2. Canvas Right-Click Menu

**Create items directly from the canvas file context menu!**

#### How to use:
1. **Right-click on a canvas file** in the file explorer
2. Choose from:
   - **"Create Item From Template"** - Opens modal to select type/effort/template
   - **"Create Task"** - Directly creates a task (skips type selection)
   - **"Create Accomplishment"** - Directly creates an accomplishment

#### Benefits:
- Faster workflow - no need to open canvas first
- Contextual creation - right-click on the canvas you want to add to
- Quick access - especially useful with hotkeys

## 📖 Updated Workflow

### Old way:
1. Open canvas file
2. Press Ctrl+P
3. Type "Canvas: New Item"
4. Fill in modal
5. Create

### New way (Right-click):
1. Right-click canvas file
2. Select "Create Task" or "Create Accomplishment"
3. Fill in details
4. Create!

### New way (Template Selection):
1. Enable template folder in settings
2. Create multiple templates
3. When creating items, select your preferred template
4. Enjoy customized workflows!

## 🎨 Template Naming Conventions

For automatic filtering:
- Include `task` in filename → Shows for tasks only
- Include `accomplishment` or `goal` in filename → Shows for accomplishments only
- No type keyword → Shows for both types

Examples:
- `task-bug.md` ✅ Task only
- `sprint-accomplishment.md` ✅ Accomplishment only
- `general-template.md` ✅ Both types
- `my-task-template.md` ✅ Task only
- `goal-milestone.md` ✅ Accomplishment only

## 🔧 Settings

New settings added:

### Templates Section
- **Use template folder** (toggle)
  - Enable to scan a folder for templates
  - Shows template dropdown in creation modal

- **Template folder** (text)
  - Path to folder containing templates
  - Default: `Templates`
  - Only visible when "Use template folder" is enabled

## 💡 Use Cases

### Multiple Task Types
Create different templates for different work:
```
Templates/
├── task-bug-critical.md    # Critical bugs
├── task-bug-minor.md       # Minor bugs
├── task-feature-ui.md      # UI features
├── task-feature-api.md     # API features
├── task-spike.md           # Investigation
└── task-doc.md             # Documentation
```

### Project-Specific Templates
Have different templates per project type:
```
Templates/
├── mobile-task.md
├── mobile-accomplishment.md
├── backend-task.md
├── backend-accomplishment.md
├── research-task.md
└── research-accomplishment.md
```

### Team Templates
Standardize across your team:
```
Templates/
├── task-dev.md            # Development work
├── task-qa.md             # QA testing
├── task-design.md         # Design work
├── accomplishment-epic.md # Epic milestones
└── accomplishment-okr.md  # OKR tracking
```

## 🚀 Next Steps

1. **Enable template folder** in settings
2. **Create custom templates** for your workflow
3. **Try the right-click menu** for faster item creation
4. **Organize your templates** with clear naming

## 🔄 Backward Compatibility

- Default behavior unchanged if "Use template folder" is disabled
- Existing single template paths still work
- No breaking changes to existing functionality

## 📝 Notes

- Templates are filtered by filename keywords automatically
- Template dropdown only appears when template folder is enabled
- Right-click menu works on any canvas file in file explorer
- All existing features (Notion sync, ID generation, etc.) work with new features

Enjoy the enhanced workflow! 🎊


# Canvas Project Manager - Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Obsidian Canvas                          │
│                        (.canvas JSON file)                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ Read/Write JSON
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Canvas Project Manager Plugin                  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     Main Plugin (main.ts)                 │   │
│  │  • Command Registration (19 commands)                     │   │
│  │  • Entity Management & Archiving                          │   │
│  │  • Canvas Population & Layout                             │   │
│  │  • Entity Navigator                                       │   │
│  │  • Visual Styling & Visibility Toggles                    │   │
│  └──────────────┬──────────────────────────┬─────────────────┘   │
│                 │                          │                     │
│    ┌────────────▼──────────┐   ┌──────────▼──────────────┐     │
│    │  Settings (settings.ts)│   │  UI (StructuredItemModal)│    │
│    │  • Configuration UI    │   │  • Entity Type Selection │    │
│    │  • Notion Setup        │   │  • Effort Selection      │    │
│    │  • Template Paths      │   │  • Title Input           │    │
│    └────────────────────────┘   └────────────────────────┘     │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Utility Modules                        │   │
│  │                                                            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │   Canvas     │  │  CanvasView  │  │EntityNavigator│  │   │
│  │  │ • JSON Read  │  │ • DOM Manip  │  │ • Index Build │  │   │
│  │  │ • JSON Write │  │ • Node Style │  │ • Relationship│  │   │
│  │  │ • Node/Edge  │  │ • Visibility │  │   Queries     │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │                                                            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │ ID Generator │  │ Frontmatter  │  │  FileNaming  │   │   │
│  │  │ • Scan Notes │  │ • Parse YAML │  │ • Title-based│   │   │
│  │  │ • Find Max   │  │ • Serialize  │  │ • Collision  │   │   │
│  │  │ • Increment  │  │ • Update     │  │   Detection  │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │                                                            │   │
│  │  ┌──────────────┐  ┌──────────────┐                      │   │
│  │  │  Template    │  │    Logger    │                      │   │
│  │  │ • Load File  │  │ • Console    │                      │   │
│  │  │ • Replace    │  │ • Log File   │                      │   │
│  │  │  Placeholders│  │              │                      │   │
│  │  └──────────────┘  └──────────────┘                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Notion Integration (notionClient.ts)            │   │
│  │  • Database Creation                                      │   │
│  │  • Page Creation/Update                                   │   │
│  │  • Dependency Sync                                        │   │
│  │  • Archive Sync                                           │   │
│  └──────────────────────┬───────────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────────┘
                          │
                          │ @notionhq/client
                          ▼
                  ┌───────────────────┐
                  │   Notion API      │
                  │   • Database      │
                  │   • Pages         │
                  │   • Relations     │
                  └───────────────────┘
```

## Entity Type Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                        Entity Types                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│   MILESTONE (M-xxx)                                              │
│   ├── High-level project goals                                   │
│   ├── Border: 3px solid                                          │
│   └── Color: Purple (6)                                          │
│       │                                                           │
│       ├── STORY (S-xxx)                                          │
│       │   ├── User stories / features                            │
│       │   ├── Border: 2px solid                                  │
│       │   └── Color: Blue (3)                                    │
│       │       │                                                   │
│       │       └── TASK (T-xxx)                                   │
│       │           ├── Actionable work items                      │
│       │           ├── Border: 1px solid                          │
│       │           └── Color: Green (2)                           │
│       │                                                           │
│       ├── DECISION (DEC-xxx)                                     │
│       │   ├── Architectural/design decisions                     │
│       │   ├── Border: 2px dashed                                 │
│       │   ├── Color: Orange (4)                                  │
│       │   └── Special: "enables" field for unblocking            │
│       │                                                           │
│       └── DOCUMENT (DOC-xxx)                                     │
│           ├── Technical specs, designs                           │
│           ├── Border: 1px dotted                                 │
│           └── Color: Yellow (5)                                  │
│                                                                   │
│   ACCOMPLISHMENT (A-xxx)                                         │
│   ├── Completed achievements                                     │
│   └── Color: Blue (3)                                            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Component Dependencies

```
main.ts (~7000 lines)
  ├─ depends on → types.ts
  ├─ depends on → settings.ts
  ├─ depends on → ui/StructuredItemModal.ts
  ├─ depends on → notion/notionClient.ts
  ├─ depends on → util/canvas.ts
  ├─ depends on → util/canvasView.ts
  ├─ depends on → util/entityNavigator.ts
  ├─ depends on → util/template.ts
  ├─ depends on → util/idGenerator.ts
  ├─ depends on → util/frontmatter.ts
  ├─ depends on → util/fileNaming.ts
  └─ depends on → util/logger.ts

settings.ts
  ├─ depends on → types.ts
  └─ depends on → main.ts

ui/StructuredItemModal.ts
  └─ depends on → types.ts

notion/notionClient.ts
  ├─ depends on → types.ts
  ├─ depends on → util/logger.ts
  └─ depends on → @notionhq/client (external)

util/canvas.ts
  └─ depends on → Obsidian API

util/canvasView.ts
  └─ depends on → Obsidian API (internal canvas)

util/entityNavigator.ts
  └─ depends on → types.ts

util/frontmatter.ts
  └─ depends on → types.ts

util/fileNaming.ts
  └─ depends on → types.ts

util/logger.ts
  └─ depends on → Obsidian API
```

## Data Flow

### Populate Canvas from Vault

```
User runs "Populate from vault" command
        ↓
┌─────────────────────────────────────────┐
│ STAGE 1: INITIALIZATION                 │
│ • Get active canvas file                │
│ • Load existing canvas data             │
│ • Build set of existing file paths      │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ STAGE 2: ARCHIVE CLEANUP                │
│ • moveArchivedFilesToArchive()          │
│   - Scan for status:archived files      │
│   - Move to archive/{type}/ folders     │
│ • removeArchivedNodesFromCanvas()       │
│   - Remove archived nodes from canvas   │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ STAGE 3: SCAN VAULT FOR ENTITIES        │
│ • Get all markdown files                │
│ • Exclude archive folder                │
│ • Parse frontmatter for each file       │
│ • Extract: type, id, parent, depends_on │
│ • Skip archived items                   │
│ • Skip files already on canvas          │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ STAGE 4: HIERARCHICAL LAYOUT            │
│ • Position milestones horizontally      │
│ • Place children below parents          │
│ • Handle orphans (no parent)            │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ STAGE 5: CREATE EDGES                   │
│ • Create parent→child edges             │
│ • Create dependency edges               │
│ • Create enables edges (decisions)      │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ STAGE 6: SAVE CANVAS                    │
│ • Write updated canvas JSON             │
│ • Show summary notice                   │
└─────────────────────────────────────────┘
```

### Archive System Flow

```
File with status:archived or archived:true
        ↓
Determine entity type from frontmatter
        ↓
Calculate archive path:
  archive/{type}s/{filename}
  e.g., archive/milestones/M-001_project.md
        ↓
Create archive folder if needed (tolerant)
        ↓
Move file using fileManager.renameFile()
        ↓
Remove node from canvas if present
```

### Entity Navigator Flow

```
User opens entity file
        ↓
Parse frontmatter for entity info
        ↓
Query EntityIndex for relationships:
  • getParent(id)
  • getChildren(id)
  • getDependencies(id)
  • getImplementedDocuments(id)
  • getRelatedDecisions(id)
  • getEnabledEntities(id)
        ↓
Display navigation menu or execute hotkey
        ↓
Open selected entity file(s)
```

### Workstream-Based Layout (Reposition)

```
┌─────────────────────────────────────────┐
│ STEP 1: Parse all file nodes            │
│ • Extract type, workstream, entityId    │
│ • Build entityId → nodeId map           │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ STEP 2: Build dependency graph          │
│ • From canvas edges                     │
│ • From frontmatter depends_on           │
│ • From frontmatter enables              │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ STEP 3: Group milestones by workstream  │
│ • engineering, business, etc.           │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ STEP 4: Calculate bounding boxes        │
│ • For each milestone + its dependencies │
│ • Stories fan LEFT of milestone         │
│ • Tasks fan further LEFT                │
│ • Decisions/Documents with offset       │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ STEP 5: Position workstream lanes       │
│ • Milestones left-to-right by deps      │
│ • Lanes stacked vertically              │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ STEP 6: Handle cross-stream deps        │
│ • Shift milestones if needed            │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ STEP 7: Position orphan nodes           │
│ • Nodes without parents                 │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│ STEP 8: Apply positions to canvas       │
│ • Update node x, y, width, height       │
│ • Save canvas JSON                      │
└─────────────────────────────────────────┘
```

## State Management

```
Plugin State (in-memory)
  ├─ visibilityState: { tasks, stories, milestones, decisions, documents }
  ├─ entityIndex: EntityIndex (relationship cache)
  ├─ fileAccomplishmentIdCache: Map<filePath, entityId>
  ├─ canvasNodeCache: Map<canvasPath, Set<filePath>>
  └─ controlPanelEl: HTMLElement reference

Plugin Settings (data.json)
  ├─ General Settings
  ├─ Template Paths
  ├─ ID Configuration
  ├─ Effort Options
  └─ Notion Configuration

Entity Index (EntityIndex class)
  ├─ entries: Map<entityId, EntityIndexEntry>
  └─ Methods:
      ├─ buildIndex(vault)
      ├─ getParent(id)
      ├─ getChildren(id)
      ├─ getDependencies(id)
      ├─ getImplementedDocuments(id)
      ├─ getRelatedDecisions(id)
      └─ getEnabledEntities(id)
```

## Key Design Patterns

### 1. **Multi-Stage Processing**
- Populate from vault uses 6 distinct stages
- Each stage has clear responsibility
- Verbose logging for debugging

### 2. **Tolerant Operations**
- Archive folder creation ignores "already exists" errors
- File operations wrapped in try-catch
- Graceful degradation on failures

### 3. **Index-Based Navigation**
- EntityIndex built once, queried many times
- O(1) lookups for relationships
- Rebuilt on demand via command

### 4. **Visual Differentiation**
- CSS data attributes for entity types
- Border styles indicate entity type
- Colors indicate effort/category

### 5. **Archive Exclusion Pattern**
- Consistent filtering: `!path.includes('/archive/') && !path.startsWith('archive/')`
- Applied in vault scans and archive processing
- Prevents re-processing archived files

## Performance Considerations

### Entity Index
- **O(n)** to build where n = markdown files
- **O(1)** for relationship queries
- Rebuilt only on explicit command

### Canvas Population
- **O(n)** for vault scan
- **O(m)** for layout where m = entities to add
- **O(e)** for edge creation where e = relationships

### Archive Processing
- **O(n)** scan for archived files
- File moves are atomic operations
- Tolerant folder creation avoids race conditions

## Security Considerations

### File Operations
- All operations within vault
- Uses Obsidian's fileManager for moves
- No external file access

### Archive Safety
- Files moved, not deleted
- Archive folder structure preserved
- Easy to recover archived items

## Extensibility Points

### Adding New Entity Types
1. Add to `entityTypes` array
2. Add to `typeToFolder` mapping
3. Add CSS styling in styles.css
4. Add to visibility toggles

### Adding New Relationships
1. Add frontmatter field parsing
2. Add to EntityIndex queries
3. Add navigation command
4. Add to context menu

# Canvas Structured Items - Architecture

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
│                   Canvas Structured Items Plugin                 │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     Main Plugin (main.ts)                 │   │
│  │  • Command Registration                                   │   │
│  │  • Orchestration                                          │   │
│  │  • Lifecycle Management                                   │   │
│  └──────────────┬──────────────────────────┬─────────────────┘   │
│                 │                          │                     │
│    ┌────────────▼──────────┐   ┌──────────▼──────────────┐     │
│    │  Settings (settings.ts)│   │  UI (ItemCreationModal)│     │
│    │  • Configuration UI    │   │  • Type Selection      │     │
│    │  • Notion Setup        │   │  • Effort Selection    │     │
│    │  • Template Paths      │   │  • Title Input         │     │
│    └────────────────────────┘   └────────────────────────┘     │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Utility Modules                        │   │
│  │                                                            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │   Canvas     │  │  Template    │  │    Logger    │   │   │
│  │  │ • JSON Read  │  │ • Load File  │  │ • Console    │   │   │
│  │  │ • JSON Write │  │ • Replace    │  │ • Log File   │   │   │
│  │  │ • Node Ops   │  │   Placeholders│  │              │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │                                                            │   │
│  │  ┌──────────────┐  ┌──────────────┐                      │   │
│  │  │ ID Generator │  │ Frontmatter  │                      │   │
│  │  │ • Scan Notes │  │ • Parse YAML │                      │   │
│  │  │ • Find Max   │  │ • Serialize  │                      │   │
│  │  │ • Increment  │  │ • Update     │                      │   │
│  │  └──────────────┘  └──────────────┘                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Notion Integration (notionClient.ts)            │   │
│  │  • Database Creation                                      │   │
│  │  • Page Creation                                          │   │
│  │  • Page Updates                                           │   │
│  │  • Property Mapping                                       │   │
│  └──────────────────────┬───────────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────────┘
                          │
                          │ @notionhq/client
                          ▼
                  ┌───────────────────┐
                  │   Notion API      │
                  │   • Database      │
                  │   • Pages         │
                  │   • Properties    │
                  └───────────────────┘
```

## Data Flow

### Creating a New Item

```
User Action (Command)
        ↓
Open ItemCreationModal
        ↓
User fills: Type, Effort, Title
        ↓
Generate ID (scan vault)
        ↓
Load Template (from vault)
        ↓
Replace Placeholders
        ↓
Create Note File
        ↓
Update Canvas JSON
        ↓
[If Notion Enabled]
        ↓
Sync to Notion
        ↓
Update Note with Notion ID
        ↓
Log Success
```

### Syncing to Notion

```
Read Note Frontmatter
        ↓
Check Notion Configuration
        ↓
[Has notion_page_id?]
   Yes ↓         No ↓
Update Page   Create Page
        ↓           ↓
        └───────────┘
                ↓
        Store Page ID
                ↓
        Update Last Synced
                ↓
        Log Success
```

## Component Dependencies

```
main.ts
  ├─ depends on → types.ts
  ├─ depends on → settings.ts
  ├─ depends on → ui/ItemCreationModal.ts
  ├─ depends on → notion/notionClient.ts
  ├─ depends on → util/canvas.ts
  ├─ depends on → util/template.ts
  ├─ depends on → util/idGenerator.ts
  ├─ depends on → util/frontmatter.ts
  └─ depends on → util/logger.ts

settings.ts
  ├─ depends on → types.ts
  └─ depends on → main.ts

ui/ItemCreationModal.ts
  └─ depends on → types.ts

notion/notionClient.ts
  ├─ depends on → types.ts
  ├─ depends on → util/logger.ts
  └─ depends on → @notionhq/client (external)

util/canvas.ts
  └─ depends on → Obsidian API

util/template.ts
  └─ depends on → types.ts

util/idGenerator.ts
  ├─ depends on → types.ts
  └─ depends on → Obsidian API

util/frontmatter.ts
  └─ depends on → types.ts

util/logger.ts
  └─ depends on → Obsidian API
```

## File Organization

```
Source Files (.ts)
        ↓
TypeScript Compiler (tsc)
        ↓
Type Checking
        ↓
ESBuild
        ↓
Bundle & Minify
        ↓
main.js (output)
```

## Settings Flow

```
User Changes Settings
        ↓
settings.ts updates plugin.settings
        ↓
plugin.saveSettings() → saves to data.json
        ↓
Notify NotionClient of changes
        ↓
NotionClient reinitializes if needed
```

## ID Generation Flow

```
Need New ID (T or A)
        ↓
Get All Markdown Files
        ↓
For Each File:
  ├─ Get Metadata Cache
  ├─ Check Frontmatter
  ├─ Extract ID
  └─ If matches prefix → track number
        ↓
Find Maximum Number
        ↓
Increment by 1
        ↓
Format with Prefix + Zero Padding
        ↓
Return ID (e.g., T001)
```

## Template Processing Flow

```
Template File (.md)
        ↓
Read File Content
        ↓
Find {{placeholders}}
        ↓
Replace with Actual Values
  • {{title}} → "My Task"
  • {{id}} → "T001"
  • {{effort}} → "Engineering"
  • ... etc
        ↓
Write to New Note
```

## Logging System

```
Plugin Action
        ↓
Call logger.info/warn/error
        ↓
Format Message (timestamp, level, data)
        ↓
    ┌───┴───┐
    ↓       ↓
Console  Log File
Output   (.obsidian/plugins/.../plugin.log)
```

## Module Interactions

```
┌──────────────────────────────────────────────┐
│  User Interactions                           │
│  • Commands (via Obsidian)                   │
│  • Settings Changes                          │
└──────────┬───────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────┐
│  Core Plugin (main.ts)                       │
│  • Receives commands                         │
│  • Orchestrates operations                   │
│  • Manages state                             │
└──┬───────┬────────┬────────┬────────┬────────┘
   ↓       ↓        ↓        ↓        ↓
┌─────┐ ┌────┐ ┌──────┐ ┌──────┐ ┌────────┐
│Modal│ │Cnvs│ │Tmplt │ │  ID  │ │ Notion │
│     │ │    │ │      │ │  Gen │ │        │
└─────┘ └────┘ └──────┘ └──────┘ └────────┘
   ↓       ↓        ↓        ↓        ↓
   └───────┴────────┴────────┴────────┘
                   ↓
          ┌─────────────────┐
          │   Obsidian      │
          │   • Vault       │
          │   • Files       │
          │   • Metadata    │
          └─────────────────┘
```

## State Management

```
Plugin Settings (data.json)
  ├─ General Settings
  ├─ Template Paths
  ├─ ID Configuration
  ├─ Effort Options
  └─ Notion Configuration

No Other State Files Needed!
  • IDs: Discovered by scanning
  • Templates: Loaded from vault
  • Notion: Stored in note frontmatter
```

## Error Handling Flow

```
Operation Attempt
        ↓
[Try Block]
        ↓
    Success?
   Yes ↓   No ↓
       │    [Catch Block]
       │         ↓
       │    Log Error
       │         ↓
       │    Show Notice
       │         ↓
       └─────────┘
              ↓
        Continue Execution
```

## Key Design Patterns

### 1. **Dependency Injection**
- Plugin passes dependencies to components
- Easy to test and mock

### 2. **Service Layer**
- Utility modules provide services
- Separation of concerns

### 3. **Configuration Object**
- All settings in one interface
- Easy to extend

### 4. **Factory Pattern**
- Create nodes, generate IDs
- Consistent object creation

### 5. **Observer Pattern**
- Settings changes notify components
- Reactive updates

## Performance Considerations

### ID Generation
- **O(n)** where n = number of markdown files
- Acceptable for vaults up to ~10,000 files
- Could be cached in future versions

### Canvas Operations
- **O(1)** for reading/writing JSON
- Fast even with hundreds of nodes

### Notion API
- **Rate Limited**: 3 requests/second
- Sequential operations (no batching in v1)
- Future: request queue

### Template Loading
- **Cached** by Obsidian's file system
- Fast after first load

## Security Considerations

### Notion Token
- Stored in plugin settings (encrypted by Obsidian)
- Never logged or exposed
- Password input field in UI

### File Operations
- All operations within vault
- No external file access
- Obsidian sandbox provides security

### User Input
- Sanitized for file names
- Validated before processing
- Safe against injection

## Extensibility Points

### Easy to Add:
1. **New Template Placeholders**
   - Add to `replacePlaceholders()`

2. **New Settings**
   - Add to interface
   - Add to settings UI
   - Add to defaults

3. **New Commands**
   - Register in `registerCommands()`
   - Add handler method

4. **New Notion Properties**
   - Add to database schema
   - Add to property builder

### Future Architecture:
- Plugin API for extensions
- Hook system for custom logic
- Event emitters for actions
- Custom template engines


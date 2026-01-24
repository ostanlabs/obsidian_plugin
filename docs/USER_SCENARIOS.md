# User Scenarios

> **Version:** 1.2
> **Scope:** Comprehensive test scenarios with expected results for Canvas Project Manager

---

## Table of Contents

1. [Onboarding Scenarios](#onboarding-scenarios) (ON-001 to ON-010)
2. [Entity Creation Scenarios](#entity-creation-scenarios) (SC-001 to SC-005)
3. [Hierarchy Management](#hierarchy-management) (SC-010 to SC-012)
4. [Dependency Management](#dependency-management) (SC-020 to SC-024)
5. [Canvas Operations](#canvas-operations) (SC-030 to SC-033)
6. [Archive System](#archive-system) (SC-040 to SC-043)
7. [Navigation Scenarios](#navigation-scenarios) (SC-050 to SC-054)
8. [Notion Sync Scenarios](#notion-sync-scenarios) (SC-060 to SC-063)
9. [Edge Cases](#edge-cases---entity-ids)
   - [Entity IDs](#edge-cases---entity-ids) (EC-001 to EC-003)
   - [Parent/Child Relationships](#edge-cases---parentchild-relationships) (EC-010 to EC-013)
   - [Dependencies](#edge-cases---dependencies) (EC-020 to EC-025)
   - [Workstreams](#edge-cases---workstreams) (EC-030 to EC-033)
   - [Canvas Operations](#edge-cases---canvas-operations) (EC-040 to EC-044)
   - [Archive System](#edge-cases---archive-system) (EC-050 to EC-053)
   - [Frontmatter](#edge-cases---frontmatter) (EC-060 to EC-064)
   - [Visibility Toggles](#edge-cases---visibility-toggles) (EC-070 to EC-071)
   - [Notion Sync](#edge-cases---notion-sync) (EC-080 to EC-082)
10. [Status Transition Scenarios](#status-transition-scenarios) (ST-001 to ST-004)
11. [Workstream Scenarios](#workstream-scenarios) (WS-001 to WS-003)

---

## Test Format

Each scenario follows this structure:

| Section | Description |
|---------|-------------|
| **Preconditions** | Required state before test |
| **Steps** | Actions to perform |
| **Expected Results** | Table with Check, Expected value, and How to Verify |

---

## Onboarding Scenarios

### ON-001: First-Time Plugin Installation

**Preconditions:**
- Fresh Obsidian vault with no Canvas Project Manager plugin
- Plugin files available (main.js, manifest.json, styles.css)

**Steps:**
1. Copy plugin files to `.obsidian/plugins/canvas-project-manager/`
2. Open Obsidian Settings → Community Plugins
3. Enable "Canvas Project Manager"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Plugin loads | No error messages | Obsidian loads normally |
| Commands available | Plugin commands in command palette | Cmd/Ctrl+P, search "Canvas" |
| Settings tab | Plugin settings accessible | Settings → Canvas Project Manager |
| Ribbon icon | Plugin icon in left ribbon (if configured) | Visual check |

---

### ON-002: Initial Folder Structure Setup

**Preconditions:**
- Plugin installed and enabled
- Empty vault (no project folders)

**Steps:**
1. Run command: "Initialize Project Structure"
2. Observe created folders

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| milestones/ created | Folder exists | File explorer |
| stories/ created | Folder exists | File explorer |
| tasks/ created | Folder exists | File explorer |
| decisions/ created | Folder exists | File explorer |
| documents/ created | Folder exists | File explorer |
| features/ created | Folder exists | File explorer |
| archive/ created | Folder exists with subfolders | File explorer |
| Success notice | "Project structure initialized" | Obsidian notice |

---

### ON-003: Create First Canvas

**Preconditions:**
- Plugin installed
- Folder structure exists (or will be created)

**Steps:**
1. Run command: "Create Project Canvas"
2. Enter canvas name: "My Project"
3. Observe created canvas

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Canvas created | `My Project.canvas` file exists | File explorer |
| Canvas opens | Canvas view active | Visual |
| Empty canvas | No nodes initially | Visual |
| Ready for entities | Can run "Populate from vault" | Command available |

---

### ON-004: Create First Milestone (Empty Project)

**Preconditions:**
- Plugin installed
- No existing entities in vault

**Steps:**
1. Run command: "Create Structured Item"
2. Select type: "Milestone"
3. Enter title: "MVP Release"
4. Set workstream: "engineering"
5. Click Create

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| File created | `milestones/M-001_MVP_Release.md` | File explorer |
| ID is M-001 | First milestone gets ID 001 | Frontmatter |
| Frontmatter complete | All required fields present | Open file |
| File opens | New milestone opens in editor | Active file |
| Folder created | `milestones/` folder created if didn't exist | File explorer |

---

### ON-005: Populate Canvas with First Entity

**Preconditions:**
- Canvas open
- M-001 exists in vault
- Canvas is empty

**Steps:**
1. Run command: "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Node added | M-001 appears on canvas | Visual |
| Correct size | 280x200 pixels (milestone size) | Node dimensions |
| Correct styling | Milestone border and colors | Visual |
| Position | Reasonable starting position | Not at 0,0 |
| Notice shown | "Added 1 entity to canvas" | Obsidian notice |

---

### ON-006: Configure Plugin Settings

**Preconditions:**
- Plugin installed and enabled

**Steps:**
1. Open Settings → Canvas Project Manager
2. Review all settings options
3. Modify a setting (e.g., default workstream)
4. Close settings

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Settings visible | All options displayed | Settings panel |
| Default workstream | Can set default value | Setting field |
| Entity folders | Can customize folder paths | Setting fields |
| Notion settings | Token and database ID fields | Settings panel |
| Settings persist | After restart, settings retained | Restart Obsidian |

---

### ON-007: First Notion Integration Setup

**Preconditions:**
- Plugin installed
- Notion account with integration created
- Integration token available

**Steps:**
1. Open Settings → Canvas Project Manager
2. Enter Notion Integration Token
3. Enter Parent Page ID (where database will be created)
4. Save settings
5. Run command: "Initialize Notion Database"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Token saved | Token stored in settings | Settings check |
| Database created | New database in Notion | Open Notion |
| Properties configured | All entity properties exist | Notion database schema |
| Database ID saved | ID stored in settings | Settings check |
| Success notice | "Notion database initialized" | Obsidian notice |

---

### ON-008: Complete Onboarding Workflow

**Preconditions:**
- Fresh vault with plugin installed

**Steps:**
1. Run "Initialize Project Structure"
2. Run "Create Project Canvas"
3. Create first milestone (M-001)
4. Create first story under milestone (S-001)
5. Create first task under story (T-001)
6. Run "Populate from vault"
7. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Folder structure | All entity folders exist | File explorer |
| Canvas exists | Project canvas file | File explorer |
| 3 entities | M-001, S-001, T-001 files | File explorer |
| Hierarchy correct | T-001 → S-001 → M-001 | Frontmatter parent fields |
| Canvas populated | 3 nodes visible | Canvas |
| Layout correct | T-001 LEFT of S-001 LEFT of M-001 | Visual positions |
| Edges exist | Parent-child edges visible | Canvas |
| Ready to use | Can create more entities, sync, etc. | All commands work |

---

### ON-009: Import Existing Project (Migration)

**Preconditions:**
- Vault has existing markdown files with project info
- Files not in expected folder structure
- No frontmatter or wrong format

**Steps:**
1. Run "Initialize Project Structure"
2. Manually move files to appropriate folders
3. Add/update frontmatter with required fields
4. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Folders created | Entity folders exist | File explorer |
| Files recognized | After frontmatter added, entities detected | Populate command |
| IDs assigned | Each entity has unique ID | Frontmatter |
| Relationships work | Parent/child, dependencies function | Canvas edges |
| No data loss | Original content preserved | File content |

---

### ON-010: Onboarding with Sample Data

**Preconditions:**
- Plugin installed
- User wants to explore with example data

**Steps:**
1. Run command: "Create Sample Project" (if available)
2. OR manually create:
   - 2 milestones in different workstreams
   - 3 stories (2 under M-001, 1 under M-002)
   - 4 tasks distributed under stories
   - 1 decision affecting a story
   - 1 document
3. Run "Populate from vault"
4. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| All entities created | 11 files in appropriate folders | File explorer |
| Canvas populated | 11 nodes visible | Canvas |
| Workstream lanes | 2 horizontal lanes | Visual |
| Hierarchy visible | Children LEFT of parents | Visual layout |
| Dependencies shown | Decision → Story edge | Canvas |
| Full functionality | All features work with sample data | Test various commands |

---

## Entity Creation Scenarios

### SC-001: Create Milestone with Target Date

**Preconditions:**
- Active canvas open
- Existing milestones: M-001, M-002, M-003

**Steps:**
1. Run command: "Create Structured Item" (Cmd/Ctrl+Shift+N)
2. Select "Milestone" from type dropdown
3. Enter title: "Q2 Launch"
4. Select workstream: "engineering"
5. Select priority: "High"
6. Set target date: 2025-06-30
7. Click Create

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| File created | `milestones/M-004_Q2_Launch.md` exists | File explorer |
| ID correct | `id: M-004` in frontmatter | Open file |
| Type correct | `type: milestone` | Frontmatter |
| Status default | `status: Not Started` | Frontmatter |
| Workstream set | `workstream: engineering` | Frontmatter |
| Priority set | `priority: High` | Frontmatter |
| Target date set | `target_date: 2025-06-30` | Frontmatter |
| Canvas node | Node added at 280x200 size | Canvas visual |
| CSS classes | `canvas-milestone`, `canvas-workstream-engineering`, `canvas-status-not-started`, `canvas-priority-high` | Frontmatter cssclasses |
| Timestamps | `created_at` and `updated_at` set to now | Frontmatter |

---

### SC-002: Create Story Under Milestone

**Preconditions:**
- M-001 exists on canvas
- Existing stories: S-001 through S-010

**Steps:**
1. Run "Create Structured Item"
2. Select "Story"
3. Enter title: "User Authentication"
4. Set parent: M-001
5. Click Create

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| File created | `stories/S-011_User_Authentication.md` | File explorer |
| ID correct | `id: S-011` | Frontmatter |
| Parent set | `parent: M-001` | Frontmatter |
| M-001 updated | `children` array includes `S-011` | Open M-001, check frontmatter |
| Canvas position | S-011 node LEFT of M-001 | Visual: S-011.x < M-001.x |
| Edge created | Arrow from S-011 to M-001 | Canvas shows edge |
| Node size | 200x150 pixels | Canvas node dimensions |

---

### SC-003: Create Task Under Story

**Preconditions:**
- S-015 exists
- Existing tasks: T-001 through T-050

**Steps:**
1. Run "Create Structured Item"
2. Select "Task"
3. Enter title: "Setup Database"
4. Set parent: S-015
5. Set estimate: 4 hours
6. Click Create

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| File created | `tasks/T-051_Setup_Database.md` | File explorer |
| ID correct | `id: T-051` | Frontmatter |
| Parent set | `parent: S-015` | Frontmatter |
| Estimate set | `estimate_hrs: 4` | Frontmatter |
| S-015 updated | `children` includes `T-051` | Open S-015 |
| Canvas position | T-051 LEFT of S-015 | Position check |
| Edge created | Arrow from T-051 to S-015 | Canvas |
| Node size | 160x100 pixels | Canvas |

---

### SC-004: Create Decision Affecting Multiple Entities

**Preconditions:**
- S-015 and DOC-005 exist on canvas

**Steps:**
1. Run "Create Structured Item"
2. Select "Decision"
3. Enter title: "Use PostgreSQL"
4. Set affects: [S-015, DOC-005]
5. Set status: Decided
6. Click Create

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| File created | `decisions/DEC-XXX_Use_PostgreSQL.md` | File explorer |
| Affects set | `affects: [S-015, DOC-005]` | Frontmatter |
| Status set | `status: Decided` | Frontmatter |
| Edge to S-015 | Arrow from DEC to S-015 | Canvas |
| Edge to DOC-005 | Arrow from DEC to DOC-005 | Canvas |
| No reverse sync | S-015 does NOT have `affected_by` field | Check S-015 frontmatter |
| Position | Near first affected entity (S-015) | Visual |

---

### SC-005: Create Document with Version Chain

**Preconditions:**
- DOC-004 exists with `next_version: null`

**Steps:**
1. Run "Create Structured Item"
2. Select "Document"
3. Enter title: "API Spec v2"
4. Set previous_version: DOC-004
5. Click Create

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| File created | `documents/DOC-005_API_Spec_v2.md` | File explorer |
| Previous set | `previous_version: DOC-004` | DOC-005 frontmatter |
| DOC-004 updated | `next_version: DOC-005` | Open DOC-004, check frontmatter |
| Bidirectional nav | Can navigate DOC-004 → DOC-005 → DOC-004 | Click links |

---

## Hierarchy Management

### SC-010: Reparent Story to Different Milestone

**Preconditions:**
- S-001 exists with `parent: M-001`
- M-001 has `children: [S-001]`
- M-002 exists with `children: []`

**Steps:**
1. Open S-001.md
2. Change frontmatter: `parent: M-002`
3. Save file
4. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| S-001 parent updated | `parent: M-002` | S-001 frontmatter |
| M-001 children updated | `children: []` (S-001 removed) | M-001 frontmatter |
| M-002 children updated | `children: [S-001]` | M-002 frontmatter |
| Old edge removed | No edge S-001 → M-001 | Canvas JSON |
| New edge created | Edge S-001 → M-002 | Canvas JSON |
| Position updated | S-001 now LEFT of M-002 | Visual position |

---

### SC-011: Create Orphan Story (No Parent)

**Preconditions:**
- Canvas has workstream lanes with milestones

**Steps:**
1. Run "Create Structured Item"
2. Select "Story"
3. Leave parent field empty
4. Click Create
5. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| File created | Story file exists | File explorer |
| No parent field | `parent` is null or missing | Frontmatter |
| Orphan position | Story at BOTTOM of canvas | Y position > all workstream nodes |
| No parent edge | No edge from story | Canvas JSON |
| Orphan grid | If multiple orphans, arranged in grid | Visual layout |

---

### SC-012: Nested Hierarchy (Milestone → Story → Task)

**Preconditions:**
- M-001 with `children: [S-001]`
- S-001 with `parent: M-001`, `children: [T-001]`
- T-001 with `parent: S-001`

**Steps:**
1. Run "Reposition all nodes"
2. Measure X positions of each node

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| M-001 rightmost | Largest X position | M-001.x > S-001.x > T-001.x |
| S-001 middle | Between T-001 and M-001 | Position measurement |
| T-001 leftmost | Smallest X position | Position measurement |
| Edge T-001 → S-001 | Parent edge exists | Canvas JSON |
| Edge S-001 → M-001 | Parent edge exists | Canvas JSON |
| Same Y range | All in same workstream lane | Similar Y positions |

---

## Dependency Management

### SC-020: Simple Dependency Chain

**Preconditions:**
- S-001 exists with `blocks: []`
- S-002 exists with `depends_on: []`

**Steps:**
1. Open S-002.md
2. Set `depends_on: [S-001]`
3. Save file
4. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| S-002 depends_on set | `depends_on: [S-001]` | S-002 frontmatter |
| S-001 blocks updated | `blocks: [S-002]` | S-001 frontmatter (auto-sync) |
| Edge created | Edge from S-001 to S-002 | Canvas JSON |
| Edge direction | fromSide: right, toSide: left | Canvas JSON edge properties |
| Position order | S-001.x < S-002.x (S-001 LEFT of S-002) | Position measurement |

---

### SC-021: Cross-Workstream Dependency

**Preconditions:**
- M-001 with `workstream: engineering`
- M-002 with `workstream: business`
- M-002 has `depends_on: [M-001]`

**Steps:**
1. Run "Reposition all nodes"
2. Observe layout

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Separate lanes | Engineering and business in different Y bands | Visual |
| M-001 LEFT of M-002 | M-001.x < M-002.x | Position measurement |
| Cross-lane edge | Edge spans between workstream lanes | Visual |
| Lane integrity | M-001 stays in engineering lane Y | Y position in engineering band |
| Lane integrity | M-002 stays in business lane Y | Y position in business band |

---

### SC-022: Decision Blocking Work

**Preconditions:**
- DEC-001 with `status: Pending`
- S-015 with `depends_on: [DEC-001]`

**Steps:**
1. Run "Populate from vault"
2. Observe canvas

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Edge exists | Edge from DEC-001 to S-015 | Canvas |
| DEC-001 position | LEFT of S-015 | DEC-001.x < S-015.x |
| Visual indicator | S-015 shows blocked state (if implemented) | CSS class or visual |
| Decision status visible | DEC-001 shows "Pending" | Node label or styling |

---

### SC-023: Transitive Dependency Removal

**Preconditions:**
- S-001 exists (no dependencies)
- S-002 with `depends_on: [S-001]`
- S-003 with `depends_on: [S-001, S-002]`

**Steps:**
1. Run "Populate from vault"
2. Count edges in canvas JSON

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Edge S-002 → S-001 | EXISTS | Canvas JSON |
| Edge S-003 → S-002 | EXISTS | Canvas JSON |
| Edge S-003 → S-001 | DOES NOT EXIST | Canvas JSON - no such edge |
| Total edge count | 2 edges (not 3) | Count in JSON |
| Frontmatter unchanged | S-003 still has `depends_on: [S-001, S-002]` | File content |

---

### SC-024: Circular Dependency Detection

**Preconditions:**
- S-001 with `depends_on: [S-003]`
- S-002 with `depends_on: [S-001]`
- S-003 with `depends_on: [S-002]`

**Steps:**
1. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Error notice | "Circular dependency detected" message | Obsidian notice |
| Cycle identified | Notice mentions S-001, S-002, S-003 | Notice text |
| One edge skipped | Only 2 of 3 edges created | Canvas JSON |
| No infinite loop | Command completes in reasonable time | Plugin responsive |
| All nodes positioned | S-001, S-002, S-003 have valid X,Y | No NaN or 0,0 positions |
| Log details | Console shows which edge was skipped | DevTools |

---

## Canvas Operations

### SC-030: Populate Canvas from Vault

**Preconditions:**
- Canvas exists with 3 entities already on it
- Vault has 5 additional entities not on canvas
- 1 entity has `archived: true`

**Steps:**
1. Open the canvas
2. Run command: "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Archived file moved | File in `archive/<type>/` folder | File explorer |
| Archived node removed | Not on canvas | Canvas visual |
| New nodes added | 5 new nodes on canvas | Count nodes (was 3, now 8) |
| Hierarchical layout | Children LEFT of parents | Visual structure |
| Edges created | All relationship edges exist | Canvas JSON |
| Notice shown | "Added 5 entities, archived 1" | Obsidian notice |
| Archive excluded | No nodes from archive/ folder | Canvas check |

---

### SC-031: Reposition All Nodes

**Preconditions:**
- Canvas has 10 nodes in random positions
- Nodes span 2 workstreams: engineering, business
- Some nodes have dependencies

**Steps:**
1. Run command: "Reposition all nodes"
2. Observe final layout

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Workstream lanes | 2 horizontal lanes visible | Visual |
| Engineering lane | All engineering entities in same Y band | Y position check |
| Business lane | All business entities in same Y band | Y position check |
| Dependency order | Dependencies LEFT of dependents | X position comparison |
| Children position | Children LEFT of parents | X position comparison |
| No overlap | No nodes intersecting | Visual inspection |
| Orphans at bottom | Parentless entities below workstreams | Y position > workstream lanes |

---

### SC-032: Toggle Entity Type Visibility

**Preconditions:**
- Canvas shows: 2 milestones, 4 stories, 8 tasks
- All visible initially

**Steps:**
1. Click "Hide Tasks" toggle (or run command)
2. Observe canvas
3. Reload canvas
4. Check toggle state

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Tasks hidden | 8 task nodes not visible | Visual count |
| Milestones visible | 2 milestones still shown | Visual |
| Stories visible | 4 stories still shown | Visual |
| Task edges hidden | Edges to/from tasks not visible | Visual |
| Other edges visible | Milestone-story edges shown | Visual |
| State persisted | After reload, tasks still hidden | Reload and check |

---

### SC-033: Apply Visual Styling

**Preconditions:**
- M-001: status=In Progress, priority=Critical, workstream=engineering
- S-001: status=Not Started, priority=High, workstream=engineering
- T-001: status=Open, workstream=engineering

**Steps:**
1. Open canvas with these entities
2. Inspect node styling

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| M-001 border | 4px solid (thickest) | Visual or DevTools |
| S-001 border | 2px solid (medium) | Visual or DevTools |
| T-001 border | 1px solid (thinnest) | Visual or DevTools |
| Workstream color | All same color (engineering) | Visual |
| Status indicator | Different styling per status | Visual differentiation |
| Priority badge | M-001 shows Critical indicator | Visual |

---

## Archive System

### SC-040: Archive Completed Milestone

**Preconditions:**
- M-001 at `milestones/M-001_Test.md`
- M-001 has `archived: true` in frontmatter
- M-001 node exists on canvas

**Steps:**
1. Run "Populate from vault"
2. Check file location
3. Check canvas

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| File moved | Now at `archive/milestones/M-001_Test.md` | File explorer |
| Original gone | Not at `milestones/M-001_Test.md` | File explorer |
| Node removed | M-001 not on canvas | Canvas visual |
| Children remain | Child stories still on canvas | Canvas visual |
| Children orphaned | Children now in orphan area | Position check |
| Archive folder created | `archive/milestones/` exists | File explorer |

---

### SC-041: Archive Entity with Children

**Preconditions:**
- M-001 with `children: [S-001, S-002]`
- S-001 and S-002 have `parent: M-001`
- Set M-001 `archived: true`

**Steps:**
1. Run "Populate from vault"
2. Check all three entities

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| M-001 archived | In `archive/milestones/` | File explorer |
| S-001 NOT archived | Still in `stories/` folder | File explorer |
| S-002 NOT archived | Still in `stories/` folder | File explorer |
| S-001 on canvas | Node visible | Canvas |
| S-002 on canvas | Node visible | Canvas |
| S-001 orphaned | In orphan grid (parent gone) | Position at bottom |
| S-002 orphaned | In orphan grid (parent gone) | Position at bottom |
| Parent ref preserved | S-001 still has `parent: M-001` | Frontmatter |

---

### SC-042: Prevent Re-Processing Archived Files

**Preconditions:**
- M-001 in `archive/milestones/M-001_Test.md`
- M-001 has `archived: false` (user forgot to set true)

**Steps:**
1. Run "Populate from vault"
2. Check canvas

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| M-001 NOT on canvas | Archive folder excluded from scan | Canvas check |
| File not moved | Still in archive folder | File explorer |
| No error | Command completes normally | No error notice |

---

### SC-043: Restore Archived Entity

**Preconditions:**
- M-001 in `archive/milestones/M-001_Test.md`
- M-001 has `archived: true`

**Steps:**
1. Move file to `milestones/M-001_Test.md`
2. Edit frontmatter: set `archived: false`
3. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| M-001 on canvas | Node added | Canvas visual |
| Proper position | In correct workstream lane | Position check |
| Edges restored | If children exist, edges created | Canvas JSON |
| Fully functional | Can edit, reposition, etc. | Interact with node |

---

## Navigation Scenarios

### SC-050: Navigate to Parent

**Preconditions:**
- T-042 open in editor
- T-042 has `parent: S-015`
- S-015 exists

**Steps:**
1. With T-042 open, run "Go to Parent" command

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| File opened | S-015.md opens in editor | Active file is S-015 |
| Correct file | S-015 content visible | File content |
| Canvas highlight | If canvas open, S-015 node highlighted | Visual |

---

### SC-051: Navigate to Children

**Preconditions:**
- M-001 open in editor
- M-001 has `children: [S-001, S-002, S-003]`

**Steps:**
1. Run "Show Children" command

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Modal appears | List of children shown | Visual |
| All children listed | S-001, S-002, S-003 in list | Modal content |
| Titles shown | Each child shows title, not just ID | Modal content |
| Click to open | Clicking S-001 opens that file | File opens |
| Status shown | Each child shows current status | Modal content |

---

### SC-052: Navigate Dependencies

**Preconditions:**
- S-015 open in editor
- S-015 has `depends_on: [DEC-001, S-012]`

**Steps:**
1. Run "Show Dependencies" command

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Modal appears | Dependencies listed | Visual |
| DEC-001 shown | With title and status | Modal content |
| S-012 shown | With title and status | Modal content |
| Status visible | "Pending" or "Decided" for DEC-001 | Modal content |
| Click to navigate | Clicking opens that file | File opens |

---

### SC-053: Navigate Blockers (Reverse Dependencies)

**Preconditions:**
- DEC-001 open in editor
- DEC-001 has `blocks: [S-015, S-016, T-042]` (auto-synced)

**Steps:**
1. Run "Show What This Blocks" command

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Modal appears | Blocked entities listed | Visual |
| All blockers shown | S-015, S-016, T-042 in list | Modal content |
| Entity types shown | Story, Story, Task indicators | Modal content |
| Impact visible | User understands decision affects 3 items | Modal content |

---

### SC-054: Navigate Decision Chain

**Preconditions:**
- DEC-001 with `superseded_by: DEC-015`
- DEC-015 with `supersedes: DEC-001`

**Steps:**
1. Open DEC-001
2. Look for supersession info

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Superseded indicator | "Superseded by DEC-015" visible | Frontmatter or UI |
| Link clickable | Can navigate to DEC-015 | Click link |
| Chain navigable | From DEC-015, can see it supersedes DEC-001 | Check DEC-015 |
| Status reflects | DEC-001 status is "Superseded" | Frontmatter |

---

## Notion Sync Scenarios

### SC-060: Initial Database Setup

**Preconditions:**
- Notion integration token configured in settings
- Parent page ID configured
- No database exists yet

**Steps:**
1. Run "Initialize Notion Database" command

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Database created | New database in Notion | Open Notion |
| Properties exist | id, type, title, status, priority, workstream | Notion database schema |
| Relations exist | depends_on, parent, blocks relations | Notion database schema |
| Status options | All status values as select options | Notion property config |
| Database ID saved | ID stored in plugin settings | Check settings |
| Success notice | "Database initialized successfully" | Obsidian notice |

---

### SC-061: Sync Entity to Notion

**Preconditions:**
- Database initialized
- M-001 exists in Obsidian with all fields populated

**Steps:**
1. Open M-001
2. Run "Sync to Notion" command

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Page created | M-001 page in Notion database | Notion |
| Title synced | "M-001: <title>" in Notion | Notion page |
| Status synced | Correct status value | Notion property |
| Priority synced | Correct priority value | Notion property |
| Workstream synced | Correct workstream | Notion property |
| Timestamps | created_at, updated_at populated | Notion properties |
| Success notice | "Synced M-001 to Notion" | Obsidian notice |

---

### SC-062: Sync Dependencies via Canvas Edges

**Preconditions:**
- S-001 and S-002 synced to Notion
- Canvas has edge from S-001 to S-002 (S-002 depends on S-001)

**Steps:**
1. Run "Sync to Notion" for S-002

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Relation created | S-002 depends_on includes S-001 | Notion relation property |
| Bidirectional | S-001 blocks includes S-002 | Notion relation property |
| Edge label | If edge has label, preserved | Notion |

---

### SC-063: Sync Archived Entities

**Preconditions:**
- M-001 previously synced to Notion
- M-001 now has `archived: true` in Obsidian

**Steps:**
1. Run "Sync to Notion"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Page updated | M-001 page still exists | Notion |
| Archived flag | archived property = true | Notion property |
| Relations preserved | Dependencies still linked | Notion relations |
| Filterable | Can filter to hide archived | Notion view |

---

## Edge Cases - Entity IDs

### EC-001: Duplicate Entity IDs

**Preconditions:**
- File A: `milestones/M-001_ProjectA.md` with `id: M-001`
- File B: `milestones/M-001_ProjectB.md` with `id: M-001`

**Steps:**
1. Run "Populate from vault" command

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Warning displayed | ⚠️ "Duplicate ID M-001 found" notice appears | Visual check in Obsidian |
| First file processed | File A node appears on canvas | Canvas shows M-001_ProjectA |
| Second file skipped | File B NOT on canvas | Search canvas for M-001_ProjectB - not found |
| Log entry | Warning in console: "Skipping duplicate ID M-001" | Open DevTools → Console |

**Cleanup:** Rename one file's ID to M-002

---

### EC-002: Invalid ID Format

**Preconditions:**
- Create file with `id: MILESTONE-001` (invalid format, should be M-XXX)

**Steps:**
1. Run "Populate from vault" command

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| File skipped | Entity not added to canvas | Canvas does not show this file |
| Warning logged | "Invalid ID format: MILESTONE-001" | DevTools Console |
| No crash | Plugin continues processing other files | Other entities appear normally |

---

### EC-003: ID with Leading Zeros

**Preconditions:**
- M-001, M-002, M-010 exist
- Create new milestone

**Steps:**
1. Run "Create Structured Item" → Milestone

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Next ID correct | New milestone gets M-011 (not M-003 or M-0011) | Check frontmatter of new file |
| Numeric ordering | IDs treated as numbers, not strings | M-010 < M-011 in ordering |

---

## Edge Cases - Parent/Child Relationships

### EC-010: Missing Parent Reference

**Preconditions:**
- Create `stories/S-001_Test.md` with `parent: M-999`
- M-999 does NOT exist in vault

**Steps:**
1. Run "Populate from vault" command
2. Run "Reposition all nodes" command

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Story added to canvas | S-001 node visible | Visual check |
| Treated as orphan | S-001 in orphan grid (bottom of canvas) | Position Y > all workstream nodes |
| No parent edge | No edge from S-001 | Inspect canvas JSON - no edge with S-001 as fromNode to M-999 |
| Warning logged | "Parent M-999 not found for S-001" | DevTools Console |
| Frontmatter unchanged | `parent: M-999` still in file | Open S-001 file, check frontmatter |

---

### EC-011: Orphan Becomes Parented

**Preconditions:**
- S-001 exists with no parent (orphan)
- M-001 exists

**Steps:**
1. Edit S-001, add `parent: M-001`
2. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| S-001 moves from orphan grid | S-001 no longer at bottom | Visual position change |
| S-001 positioned near M-001 | S-001 LEFT of M-001 | X position: S-001.x < M-001.x |
| Edge created | Edge from S-001 to M-001 | Canvas JSON has edge |
| M-001 children updated | M-001.children includes S-001 | Open M-001, check frontmatter |

---

### EC-012: Parent Deleted While Child Exists

**Preconditions:**
- M-001 exists with children: [S-001, S-002]
- S-001 and S-002 have `parent: M-001`

**Steps:**
1. Delete M-001.md file
2. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| M-001 node removed | No M-001 on canvas | Visual check |
| S-001, S-002 become orphans | Both in orphan grid | Position at bottom |
| Edges removed | No edges to non-existent M-001 | Canvas JSON check |
| Children frontmatter unchanged | S-001 still has `parent: M-001` | File content check |
| Warning logged | "Parent M-001 not found" for each child | Console |

---

### EC-013: Circular Parent Reference

**Preconditions:**
- S-001 with `parent: S-002`
- S-002 with `parent: S-001`

**Steps:**
1. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Error notice | "Circular parent reference detected" | Obsidian notice |
| Both treated as orphans | S-001 and S-002 in orphan grid | Position check |
| No infinite loop | Plugin completes without hanging | Command finishes |
| No edges created | No parent edges between them | Canvas JSON |

---

## Edge Cases - Dependencies

### EC-020: Self-Reference in Dependencies

**Preconditions:**
- S-001 with `depends_on: [S-001]`

**Steps:**
1. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Self-reference ignored | No self-loop edge | Canvas JSON - no edge where fromNode = toNode |
| Warning logged | "Self-reference ignored for S-001" | Console |
| Entity still processed | S-001 appears on canvas normally | Visual check |
| Other deps work | If S-001 also depends on S-002, that edge exists | Canvas JSON |

---

### EC-021: Circular Dependency (2 nodes)

**Preconditions:**
- S-001 with `depends_on: [S-002]`
- S-002 with `depends_on: [S-001]`

**Steps:**
1. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Error notice | "Circular dependency: S-001 ↔ S-002" | Obsidian notice |
| One edge created | Only one direction edge exists | Canvas JSON |
| No infinite loop | Command completes | Plugin responsive |
| Positions assigned | Both nodes have valid positions | No NaN or undefined in x,y |

---

### EC-022: Circular Dependency (3+ nodes)

**Preconditions:**
- S-001 depends on S-002
- S-002 depends on S-003
- S-003 depends on S-001

**Steps:**
1. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Cycle detected | "Circular dependency detected in chain" | Notice |
| Cycle broken | One edge in cycle skipped | Canvas JSON - only 2 of 3 edges |
| All nodes positioned | S-001, S-002, S-003 have valid positions | Visual check |
| Log shows cycle | "Cycle: S-001 → S-002 → S-003 → S-001" | Console |

---

### EC-023: Dependency on Non-Existent Entity

**Preconditions:**
- S-001 with `depends_on: [S-999]`
- S-999 does NOT exist

**Steps:**
1. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| S-001 added normally | Node on canvas | Visual |
| No edge to S-999 | No dangling edge | Canvas JSON |
| Warning logged | "Dependency S-999 not found for S-001" | Console |
| Frontmatter unchanged | `depends_on: [S-999]` preserved | File check |

---

### EC-024: Transitive Dependency Removal

**Preconditions:**
- S-003 depends on [S-001, S-002]
- S-002 depends on [S-001]

**Steps:**
1. Run "Populate from vault"
2. Count edges in canvas

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Edge S-003 → S-002 exists | Direct dependency shown | Canvas JSON |
| Edge S-002 → S-001 exists | Direct dependency shown | Canvas JSON |
| Edge S-003 → S-001 REMOVED | Transitive edge not shown | Canvas JSON - no such edge |
| Total edges = 2 | Not 3 | Count edges in JSON |

---

### EC-025: Diamond Dependency Pattern

**Preconditions:**
```
    S-001
   /     \
S-002   S-003
   \     /
    S-004
```
- S-002 depends on S-001
- S-003 depends on S-001
- S-004 depends on [S-002, S-003]

**Steps:**
1. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| S-001 leftmost | X position smallest | Position check |
| S-002, S-003 middle | Same X or close | Position check |
| S-004 rightmost | X position largest | Position check |
| 4 edges total | S-002→S-001, S-003→S-001, S-004→S-002, S-004→S-003 | Canvas JSON |
| No S-004→S-001 edge | Transitive removed | Canvas JSON |

---

## Edge Cases - Workstreams

### EC-030: Empty Workstream Field

**Preconditions:**
- M-001 with `workstream: ""` (empty string)

**Steps:**
1. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Entity positioned | M-001 has valid position | Not at 0,0 or NaN |
| Default workstream | Treated as "default" or "unassigned" | Grouped with other empty workstreams |
| Warning shown | "Empty workstream for M-001" | Console or notice |

---

### EC-031: Missing Workstream Field

**Preconditions:**
- M-001 frontmatter has no `workstream` field at all

**Steps:**
1. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| No crash | Plugin continues | Command completes |
| Entity in orphan area | M-001 at bottom of canvas | Position check |
| Warning logged | "Missing workstream for M-001" | Console |

---

### EC-032: Single Entity in Workstream

**Preconditions:**
- M-001 with `workstream: solo-stream`
- No other entities in solo-stream

**Steps:**
1. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Workstream lane created | solo-stream row exists | Visual - separate horizontal band |
| M-001 positioned correctly | Valid X, Y coordinates | Not overlapping other workstreams |
| Lane height appropriate | Fits single milestone | Height ~200px (milestone height) |

---

### EC-033: Many Workstreams (10+)

**Preconditions:**
- Create milestones in 10 different workstreams

**Steps:**
1. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| All lanes visible | 10 horizontal lanes | Visual count |
| No overlap | Lanes don't intersect | Visual check |
| Consistent spacing | Equal gaps between lanes | Measure Y differences |
| Performance OK | Completes in <5 seconds | Time the operation |

---

## Edge Cases - Canvas Operations

### EC-040: Empty Canvas Population

**Preconditions:**
- Canvas file exists but is empty (no nodes)
- Vault has 5 entities

**Steps:**
1. Open empty canvas
2. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| All 5 entities added | 5 nodes on canvas | Count nodes |
| Proper layout | Hierarchical positioning | Visual structure |
| Edges created | Relationship edges exist | Canvas JSON |
| Notice shown | "Added 5 entities to canvas" | Obsidian notice |

---

### EC-041: Populate with All Entities Already on Canvas

**Preconditions:**
- Canvas has all vault entities already

**Steps:**
1. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| No duplicates | Same node count as before | Count nodes |
| Positions unchanged | Nodes don't move | Compare before/after positions |
| Notice shown | "No new entities to add" or "0 entities added" | Notice |

---

### EC-042: Canvas with Non-Entity Nodes

**Preconditions:**
- Canvas has entity nodes (M-001, S-001)
- Canvas also has text nodes, image nodes, or links

**Steps:**
1. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Entity nodes repositioned | M-001, S-001 moved to proper layout | Position check |
| Non-entity nodes unchanged | Text/image nodes at original positions | Compare positions |
| No errors | Command completes | No error notices |

---

### EC-043: Very Large Canvas (100+ entities)

**Preconditions:**
- Create 100+ entities across multiple workstreams

**Steps:**
1. Run "Reposition all nodes"
2. Measure time

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Completes successfully | No timeout or crash | Command finishes |
| Performance acceptable | <10 seconds | Stopwatch |
| All nodes positioned | No nodes at 0,0 or overlapping | Visual scan |
| Canvas responsive | Can pan/zoom after | Interact with canvas |

---

### EC-044: Canvas File Locked/Read-Only

**Preconditions:**
- Make canvas file read-only (chmod 444 on Unix)

**Steps:**
1. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Error notice | "Cannot write to canvas file" | Notice |
| No crash | Plugin continues | Obsidian responsive |
| Graceful failure | Clear error message | User understands issue |

---

## Edge Cases - Archive System

### EC-050: Archive Entity with Active Dependencies

**Preconditions:**
- M-001 with `archived: true`
- S-001 depends on M-001 (S-001 NOT archived)

**Steps:**
1. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| M-001 moved to archive | File in `archive/milestones/` | File system check |
| M-001 removed from canvas | No M-001 node | Canvas check |
| S-001 dependency preserved | S-001 still has `depends_on: [M-001]` | Frontmatter check |
| Edge removed | No edge to archived entity | Canvas JSON |
| Warning logged | "Archived M-001 is dependency of S-001" | Console |

---

### EC-051: Archive Folder Already Exists

**Preconditions:**
- `archive/milestones/` folder already exists
- M-001 with `archived: true`

**Steps:**
1. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| No error | Folder existence handled | No error notice |
| File moved | M-001 in archive folder | File system |
| No duplicate folders | Single `archive/milestones/` | File system |

---

### EC-052: File Already in Archive Location

**Preconditions:**
- M-001 already at `archive/milestones/M-001_Test.md`
- M-001 has `archived: true`

**Steps:**
1. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| File not moved again | Same location | File path unchanged |
| Not added to canvas | M-001 not on canvas | Canvas check |
| No error | Graceful handling | No notices |

---

### EC-053: Archive with Special Characters in Filename

**Preconditions:**
- M-001 with title "Test & Demo (v2) [Final]"
- Set `archived: true`

**Steps:**
1. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| File moved successfully | In archive folder | File system |
| Filename preserved | Special chars intact or safely encoded | Filename check |
| No path errors | Valid file path | File accessible |

---

## Edge Cases - Frontmatter

### EC-060: Malformed YAML Frontmatter

**Preconditions:**
- Create file with invalid YAML:
```yaml
---
id: M-001
title: Test
  invalid_indent: true
---
```

**Steps:**
1. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| File skipped | Not added to canvas | Canvas check |
| Error logged | "YAML parse error in M-001" | Console |
| Other files processed | Valid entities still added | Canvas has other nodes |
| No crash | Plugin continues | Obsidian responsive |

---

### EC-061: Missing Required Fields

**Preconditions:**
- File with frontmatter missing `id` field:
```yaml
---
type: milestone
title: Test
---
```

**Steps:**
1. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| File skipped | Not on canvas | Canvas check |
| Warning logged | "Missing required field 'id'" | Console |
| No crash | Continues processing | Other files work |

---

### EC-062: Wrong Type for Field

**Preconditions:**
- File with `depends_on: S-001` (string instead of array)

**Steps:**
1. Run "Populate from vault"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Coerced to array | Treated as `depends_on: [S-001]` | Edge created |
| OR warning shown | "depends_on should be array" | Console |
| Entity still processed | Node on canvas | Visual check |

---

### EC-063: Extra Unknown Fields

**Preconditions:**
- File with extra fields not in schema:
```yaml
---
id: M-001
type: milestone
custom_field: value
another_field: 123
---
```

**Steps:**
1. Run "Populate from vault"
2. Edit entity via plugin
3. Check frontmatter

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Entity processed | On canvas | Visual |
| Extra fields preserved | custom_field still in file | Frontmatter check |
| No data loss | Unknown fields not stripped | File content |

---

### EC-064: Unicode in Field Values

**Preconditions:**
- M-001 with `title: "プロジェクト 🚀 Émoji"`
- `workstream: "日本語"`

**Steps:**
1. Run "Populate from vault"
2. Check canvas node label

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Title displayed correctly | Unicode renders | Canvas node shows title |
| Workstream works | Grouped correctly | Same workstream entities together |
| File operations work | Can edit, save | Modify and save file |

---

## Edge Cases - Visibility Toggles

### EC-070: Hide All Entity Types

**Preconditions:**
- Canvas with milestones, stories, tasks, decisions, documents

**Steps:**
1. Toggle hide for each entity type (all hidden)

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| All nodes hidden | Canvas appears empty | Visual |
| Edges hidden | No visible edges | Visual |
| Toggle states saved | Refresh maintains state | Reload canvas |
| Can unhide | Toggle back shows nodes | Toggle each back |

---

### EC-071: Hide Parent, Show Children

**Preconditions:**
- M-001 with children S-001, S-002
- Hide milestones, show stories

**Steps:**
1. Toggle "Hide Milestones"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| M-001 hidden | Not visible | Visual |
| S-001, S-002 visible | Stories shown | Visual |
| Parent edges hidden | No edges to hidden M-001 | Visual |
| Story-to-story edges visible | If any exist | Visual |

---

## Edge Cases - Notion Sync

### EC-080: Sync with Invalid Token

**Preconditions:**
- Notion token set to invalid value

**Steps:**
1. Run "Sync to Notion"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Error notice | "Notion authentication failed" | Notice |
| No data sent | Nothing created in Notion | Check Notion |
| Local data unchanged | Obsidian files intact | File check |
| Clear guidance | "Check your integration token" | Error message |

---

### EC-081: Sync Entity with Notion Page Already Deleted

**Preconditions:**
- Entity synced to Notion previously
- Notion page manually deleted

**Steps:**
1. Edit entity in Obsidian
2. Run "Sync to Notion"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| New page created | Entity re-synced | Check Notion |
| OR error handled | "Page not found, creating new" | Notice |
| No crash | Sync completes | Plugin responsive |

---

### EC-082: Sync Very Long Field Values

**Preconditions:**
- Entity with 10,000 character description

**Steps:**
1. Run "Sync to Notion"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Sync succeeds | Page created | Notion check |
| Content truncated if needed | Notion limits respected | Page content |
| Warning if truncated | "Description truncated" | Notice |

---

## Status Transition Scenarios

### ST-001: Milestone Status Flow

**Valid Transitions:**
```
Not Started → In Progress → Completed
                ↓
              Blocked → In Progress → Completed
```

**Preconditions:**
- M-001 with `status: Not Started`

**Test Cases:**

| From | To | Steps | Expected Result |
|------|-----|-------|-----------------|
| Not Started | In Progress | Change status in frontmatter | `updated_at` changes, CSS class updates to `canvas-status-in-progress` |
| In Progress | Completed | Change status | Archive eligibility triggered, CSS class updates |
| In Progress | Blocked | Change status | Visual blocked indicator appears, CSS class updates |
| Blocked | In Progress | Change status | Blocked indicator removed |
| Completed | Not Started | Change status | Should be allowed (re-opening) |

**Verification:**
- Check `updated_at` timestamp changes on each transition
- Check canvas node CSS class reflects status
- Check archive behavior when Completed

---

### ST-002: Task Status Flow

**Valid Transitions:**
```
Open → InProgress → Complete
         ↓
       OnHold → InProgress → Complete
```

**Preconditions:**
- T-001 with `status: Open`
- T-001 has `parent: S-001`

**Test Cases:**

| From | To | Steps | Expected Result |
|------|-----|-------|-----------------|
| Open | InProgress | Change status | CSS class updates, `updated_at` changes |
| InProgress | Complete | Change status | Task marked done, parent story may update progress |
| InProgress | OnHold | Change status | Distinct visual state (grayed out or similar) |
| OnHold | InProgress | Change status | Normal visual state restored |
| Complete | Open | Change status | Should be allowed (re-opening) |

**Verification:**
- Check parent story's completion percentage if tracked
- Check visual styling for each status

---

### ST-003: Decision Status Flow

**Valid Transitions:**
```
Pending → Decided
            ↓
         Superseded (via supersedes relationship)
```

**Preconditions:**
- DEC-001 with `status: Pending`
- S-015 with `depends_on: [DEC-001]`

**Test Cases:**

| From | To | Steps | Expected Result |
|------|-----|-------|-----------------|
| Pending | Decided | Change status | Dependent entities (S-015) unblocked |
| Decided | Superseded | Create DEC-002 with `supersedes: DEC-001` | DEC-001 auto-updates to Superseded, `superseded_by: DEC-002` set |

**Verification:**
- Check S-015 blocked indicator when DEC-001 is Pending
- Check S-015 unblocked when DEC-001 is Decided
- Check bidirectional supersession links

---

### ST-004: Document Status Flow

**Valid Transitions:**
```
Draft → Review → Approved
                    ↓
                 Superseded (via next_version)
```

**Preconditions:**
- DOC-001 with `status: Draft`

**Test Cases:**

| From | To | Steps | Expected Result |
|------|-----|-------|-----------------|
| Draft | Review | Change status | Document ready for review |
| Review | Approved | Change status | Implementation can proceed |
| Approved | Superseded | Create DOC-002 with `previous_version: DOC-001` | DOC-001 status becomes Superseded, `next_version: DOC-002` set |

**Verification:**
- Check version chain navigation works
- Check superseded documents show historical indicator

---

## Workstream Scenarios

### WS-001: Single Workstream Project

**Preconditions:**
- 5 milestones, all with `workstream: engineering`
- Various dependencies between them

**Steps:**
1. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Single lane | All nodes in one horizontal band | Visual |
| Dependency order | Dependencies LEFT of dependents | X position comparison |
| Children fan left | Stories LEFT of their milestone parents | X position comparison |
| No vertical stacking | Nodes spread horizontally | Y positions similar |

---

### WS-002: Multi-Workstream Project

**Preconditions:**
- 3 milestones in `engineering`
- 2 milestones in `business`
- 2 milestones in `design`

**Steps:**
1. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| Three lanes | Three distinct horizontal bands | Visual |
| Lane separation | Clear gap between lanes | Y position differences |
| Engineering lane | 3 milestones in same Y band | Y position check |
| Business lane | 2 milestones in same Y band | Y position check |
| Design lane | 2 milestones in same Y band | Y position check |
| Independent ordering | Each lane ordered by its own dependencies | X positions within lane |

---

### WS-003: Cross-Workstream Dependency Ordering

**Preconditions:**
- M-001 with `workstream: engineering`
- M-002 with `workstream: business`, `depends_on: [M-001]`

**Steps:**
1. Run "Reposition all nodes"

**Expected Results:**
| Check | Expected | How to Verify |
|-------|----------|---------------|
| M-001 LEFT of M-002 | M-001.x < M-002.x | Position measurement |
| Different Y bands | M-001 in engineering lane, M-002 in business lane | Y position check |
| Edge visible | Arrow from M-001 to M-002 | Canvas visual |
| Edge spans lanes | Edge crosses between Y bands | Visual |
| Constraint respected | Even though different lanes, X order maintained | X comparison |

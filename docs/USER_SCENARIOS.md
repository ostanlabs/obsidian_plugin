# User Scenarios

> **Version:** 1.0
> **Scope:** Comprehensive use cases, behaviors, and edge cases for Canvas Project Manager

---

## Table of Contents

1. [Entity Creation Scenarios](#entity-creation-scenarios)
2. [Hierarchy Management](#hierarchy-management)
3. [Dependency Management](#dependency-management)
4. [Canvas Operations](#canvas-operations)
5. [Archive System](#archive-system)
6. [Navigation Scenarios](#navigation-scenarios)
7. [Notion Sync Scenarios](#notion-sync-scenarios)
8. [Edge Cases](#edge-cases)

---

## Entity Creation Scenarios

### SC-001: Create Milestone with Target Date

**Given:** User has an active canvas open
**When:** User runs "Create Structured Item" command and selects Milestone
**Then:**
- New file created at `milestones/M-XXX_<title>.md`
- ID auto-incremented from highest existing M-XXX
- Frontmatter includes: `type: milestone`, `status: Not Started`, `workstream`, `priority`
- Node added to canvas with 280x200 size
- CSS classes applied: `canvas-milestone`, `canvas-workstream-<ws>`, `canvas-status-not-started`

### SC-002: Create Story Under Milestone

**Given:** User has milestone M-001 open or selected
**When:** User creates a new Story with parent set to M-001
**Then:**
- New file created at `stories/S-XXX_<title>.md`
- Frontmatter includes `parent: M-001`
- M-001's `children` array auto-updated to include S-XXX
- Story positioned LEFT of M-001 on canvas
- Edge created from S-XXX to M-001

### SC-003: Create Task Under Story

**Given:** Story S-015 exists
**When:** User creates Task with `parent: S-015`
**Then:**
- New file at `tasks/T-XXX_<title>.md`
- S-015's `children` array auto-updated
- Task positioned LEFT of S-015 on canvas
- Edge created from T-XXX to S-015

### SC-004: Create Decision Affecting Multiple Entities

**Given:** Story S-015 and Document DOC-005 exist
**When:** User creates Decision with `affects: [S-015, DOC-005]`
**Then:**
- New file at `decisions/DEC-XXX_<title>.md`
- Decision positioned as child of first affected entity
- Edges created to all affected entities
- No reverse auto-sync (affects is one-way)

### SC-005: Create Document with Version Chain

**Given:** Document DOC-004 exists
**When:** User creates DOC-005 with `previous_version: DOC-004`
**Then:**
- DOC-004's `next_version` auto-updated to DOC-005
- Version chain navigable in both directions

---

## Hierarchy Management

### SC-010: Reparent Story to Different Milestone

**Given:** S-001 has `parent: M-001`
**When:** User changes S-001's parent to M-002
**Then:**
- S-001 removed from M-001's `children` array
- S-001 added to M-002's `children` array
- Canvas edge updated from S-001 → M-002
- S-001 repositioned under M-002's container

### SC-011: Create Orphan Story (No Parent)

**Given:** User creates Story without setting parent
**When:** Canvas is populated/repositioned
**Then:**
- Story appears in orphan grid at bottom of canvas
- No parent edge created
- Story can later be assigned a parent

### SC-012: Nested Hierarchy (Milestone → Story → Task)

**Given:** M-001 → S-001 → T-001 hierarchy
**When:** Canvas reposition runs
**Then:**
- M-001 positioned rightmost in its workstream
- S-001 positioned LEFT of M-001
- T-001 positioned LEFT of S-001
- Visual hierarchy: T-001 ← S-001 ← M-001

---

## Dependency Management

### SC-020: Simple Dependency Chain

**Given:** S-002 depends on S-001
**When:** User sets `S-002.depends_on: [S-001]`
**Then:**
- S-001's `blocks` array auto-updated to include S-002
- Edge created: S-001 → S-002 (right to left)
- S-001 positioned LEFT of S-002 on canvas

### SC-021: Cross-Workstream Dependency

**Given:** M-001 (engineering) and M-002 (business) exist
**When:** M-002 depends on M-001
**Then:**
- M-001 positioned LEFT of M-002 (cross-workstream constraint)
- Edge spans between workstream lanes
- Both milestones maintain their workstream row positions

### SC-022: Decision Blocking Work

**Given:** DEC-001 is Pending, S-015 depends on DEC-001
**When:** Canvas displays
**Then:**
- S-015 shows as blocked (visual indicator)
- Edge from DEC-001 → S-015
- DEC-001 positioned LEFT of S-015

### SC-023: Transitive Dependency Removal

**Given:** C depends on A and B, B depends on A
**When:** Canvas edges are created
**Then:**
- Edge C → A is NOT created (redundant)
- Only edges: C → B, B → A
- Reduces visual clutter

### SC-024: Circular Dependency Detection

**Given:** User attempts: A depends on B, B depends on C, C depends on A
**When:** Canvas reposition runs
**Then:**
- Error notice displayed
- Circular edge skipped
- Remaining valid edges created
- User prompted to fix circular reference

---

## Canvas Operations

### SC-030: Populate Canvas from Vault

**Given:** Vault contains entities not on canvas
**When:** User runs "Populate from vault" command
**Then:**
1. Archived files moved to archive folders
2. Archived nodes removed from canvas
3. New entities scanned (excluding archive/)
4. Nodes created with hierarchical layout
5. Edges created for all relationships
6. Summary notice shown

### SC-031: Reposition All Nodes

**Given:** Canvas has nodes in arbitrary positions
**When:** User runs "Reposition all nodes" command
**Then:**
- Milestones grouped by workstream (horizontal lanes)
- Dependencies determine left-to-right order
- Children positioned LEFT of parents
- Orphans placed in grid at bottom
- No overlapping nodes

### SC-032: Toggle Entity Type Visibility

**Given:** Canvas shows all entity types
**When:** User toggles "Hide Tasks"
**Then:**
- All task nodes hidden (display: none)
- Edges to/from tasks hidden
- Other entity types unaffected
- Toggle state persisted

### SC-033: Apply Visual Styling

**Given:** Entity has status and priority set
**When:** Canvas renders
**Then:**
- Border thickness by type (milestone=4px, story=2px, task=1px)
- Color by workstream
- Status indicator applied
- Priority badge shown (for milestones/stories)


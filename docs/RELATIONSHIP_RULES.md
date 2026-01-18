# Relationship Rules for Canvas Positioning

> **Version:** 2.1
> **Date:** January 2026
> **Status:** Implementation Spec

---

## Overview

This document defines the **normalized relationship rules** used by the positioning engine. All entity relationships are translated into two fundamental actions:

1. **Containment** - Parent/child hierarchy (determines which container an entity belongs to)
2. **Sequencing** - Left-to-right ordering among peers

A third action, **Deferred**, handles entities with multiple parent relationships.

---

## Actions

| Action | Meaning |
|--------|---------|
| **Containment** | Parent/child relationship - entity is positioned inside parent's container |
| **Sequencing** | Left-to-right ordering - determines horizontal position among peers |
| **Deferred** | Entity has multiple parents - create edges, position ABOVE containers after all containers positioned |

---

## Entity Categories

Entities are categorized based on their relationships:

| Category | Definition | Position |
|----------|------------|----------|
| **Contained** | Has at least one containment relationship | Inside parent container |
| **Floating (single-ws)** | Has sequencing relationships only, targets in 1 workstream | On top of that workstream |
| **Floating (multi-ws)** | Has sequencing relationships only, targets in 2+ workstreams | Between those workstreams |
| **Orphan** | No relationships at all (neither containment nor sequencing) | Grid at bottom |

**Floating entity workstream determination:**
- Determined by the workstream(s) of sequencing target(s)
- If all targets are in one workstream → float on top of that workstream
- If targets span multiple workstreams → float in the area between those workstreams

---

## Relationship Rules by Entity Type

### MILESTONE

| Field | Target Type | Action | Direction |
|-------|-------------|--------|-----------|
| `workstream` | workstream | Containment | Milestone is CHILD of Workstream |
| `depends_on` | milestone | Sequencing | Milestone comes AFTER target |
| `blocks` | milestone | Sequencing | Milestone comes BEFORE target |
| `implements` | feature/document | Containment | Milestone is PARENT of feature/document |

### STORY

| Field | Target Type | Action | Direction |
|-------|-------------|--------|-----------|
| `parent` | milestone | Containment | Story is CHILD of Milestone |
| `depends_on` | story | Sequencing | Story comes AFTER target |
| `blocks` | story | Sequencing | Story comes BEFORE target |
| `implements` | feature/document | Containment | Story is PARENT of feature/document |

### TASK

| Field | Target Type | Action | Direction |
|-------|-------------|--------|-----------|
| `parent` | story | Containment | Task is CHILD of Story |
| `depends_on` | task | Sequencing | Task comes AFTER target |
| `blocks` | task | Sequencing | Task comes BEFORE target |

### DECISION

| Field | Target Type | Action | Direction | Priority |
|-------|-------------|--------|-----------|----------|
| `parent` | milestone/story | Containment | Decision is CHILD of parent | 1 (wins) |
| `affects` | milestone/story/task | Containment | Decision is CHILD of affected target | 2 (if no parent; else edge only) |
| `supersedes` | decision | Sequencing | Decision comes BEFORE target | - |

### DOCUMENT

| Field | Target Type | Action | Direction | Priority |
|-------|-------------|--------|-----------|----------|
| `parent` | milestone/story | Containment | Document is CHILD of parent | 1 (wins) |
| `implemented_by` | milestone/story/task | Containment | Document is CHILD of implementer | 2 |
| `documents` | feature | Containment | Document is CHILD of feature | 3 |
| `previous_version` | document | Sequencing | Document comes AFTER target | - |

### FEATURE

| Field | Target Type | Action | Direction | Priority |
|-------|-------------|--------|-----------|----------|
| `parent` | milestone/story | Containment | Feature is CHILD of parent | 1 (wins) |
| `implemented_by` | milestone/story/task | Containment | Feature is CHILD of implementer | 2 |

---

## Deferred Action (Multi-Parent Entities)

**Triggers when:** An entity has CHILD containment relationships with MORE than one parent entity.

**Examples:**
- Document has `parent: M-001` AND `implemented_by: T-005` → two parents → deferred
- Feature has `parent: S-001` AND `implemented_by: [M-001, M-002]` → three parents → deferred

**Behavior:**
1. Create edges from entity to ALL parent containers
2. After all containers are positioned, position the entity ABOVE its multiple parent containers
3. Entity is visually connected to all parents but not contained within any single one

---

## Orphan Entities

**Definition:** An entity with NO relationships at all (neither containment NOR sequencing).

**NOT orphans:**
- Task with `parent: S-001` (has containment)
- Document with `implemented_by: T-105` (has containment)
- Milestone with `workstream: W-001` (has containment)
- Task with only `blocks: T-106` but no `parent` (has sequencing → **Floating**, not orphan)
- Decision with only `supersedes: D-001` (has sequencing → **Floating**, not orphan)

**IS orphan:**
- Task with no `parent`, no `blocks`, no `depends_on` - completely isolated
- Any entity with zero relationships of any kind

**Positioning:**
- Orphans are positioned in a grid below all workstreams
- No ordering constraints (no relationships to determine order)

---

## Cross-Workstream Relationships

### Sequencing Across Workstreams

| Entity Type | Cross-WS Sequencing | Behavior |
|-------------|---------------------|----------|
| **Milestone** | Yes | Position constraint - milestone must be RIGHT of cross-ws dependency |
| **Story** | Yes | Position constraint - story must be RIGHT of cross-ws dependency |
| **Task** | No positioning | Edge only - visual connection, no position change |

### Cross-Workstream Constraint Propagation

When a sequencing relationship crosses workstreams:
1. **Milestone/Story**: The dependent entity is constrained to appear RIGHT of its dependency's container
2. **Task**: Only a visual edge is created; no positioning constraint applied

### Floating Entities Across Workstreams

When a floating entity (sequencing-only) has targets in multiple workstreams:
- Entity is positioned in the **area between** those workstreams
- Similar to multi-parent deferred entities

---

## Migration Guide: Decision Fields

The following fields are **deprecated** and should be migrated to `affects`:

| Old Field | New Field | Migration |
|-----------|-----------|-----------|
| `enables` | `affects` | Direct rename - `enables: [X]` becomes `affects: [X]` |
| `blocks` (on Decision) | `affects` | Direct rename - `blocks: [X]` becomes `affects: [X]` |

**Note:** `blocks` on non-Decision entities (Milestone, Story, Task) remains unchanged as a sequencing relationship.

---

## Positioning Engine Phases

The positioning engine processes entities in 11 phases:

| Phase | Name | Description |
|-------|------|-------------|
| 1 | **Index Entities** | Build maps (entityId→data, nodeId↔entityId), clean self-references |
| 2 | **Process Relationships via Ruleset** | Single pass using declarative rules to build containment/sequencing graphs |
| 3 | **Categorize Entities** | Classify each entity as Contained, Floating, or Orphan |
| 4 | **Detect Circular Dependencies** | DFS cycle detection for Milestone and Story dependency graphs |
| 5 | **Calculate Container Sizes** | Bottom-up recursion from leaf nodes to parents |
| 6 | **Position Workstreams & Milestones** | Order workstreams, topological sort milestones, cross-ws constraint propagation |
| 7 | **Position Stories with Cross-WS Constraints** | Apply cross-workstream positioning constraints for stories |
| 8 | **Position Children Within Containers** | Recursive grid positioning (dependency-aware or optimal grid) |
| 9 | **Position Floating Entities** | Single-ws: on top of workstream; Multi-ws: between workstreams |
| 10 | **Position Orphans** | Grid at bottom of canvas |
| 11 | **Resolve Overlaps** | Iterative push-apart based on entity type priority |

---

## Ruleset Data Structure (for Implementation)

```typescript
type RelationshipAction = 'containment' | 'sequencing' | 'deferred';
type ContainmentDirection = 'child' | 'parent';
type SequencingDirection = 'before' | 'after';

interface RelationshipRule {
  sourceType: EntityType | '*';
  field: string;
  targetType: EntityType | EntityType[] | '*';
  action: RelationshipAction;
  direction: ContainmentDirection | SequencingDirection;
  priority?: number;  // For containment conflicts (lower wins)
  crossWsPositioning?: boolean;  // If true, apply cross-workstream position constraints
}

const RELATIONSHIP_RULES: RelationshipRule[] = [
  // MILESTONE
  { sourceType: 'milestone', field: 'workstream', targetType: 'workstream', action: 'containment', direction: 'child' },
  { sourceType: 'milestone', field: 'depends_on', targetType: 'milestone', action: 'sequencing', direction: 'after', crossWsPositioning: true },
  { sourceType: 'milestone', field: 'blocks', targetType: 'milestone', action: 'sequencing', direction: 'before', crossWsPositioning: true },
  { sourceType: 'milestone', field: 'implements', targetType: ['feature', 'document'], action: 'containment', direction: 'parent' },

  // STORY
  { sourceType: 'story', field: 'parent', targetType: 'milestone', action: 'containment', direction: 'child' },
  { sourceType: 'story', field: 'depends_on', targetType: 'story', action: 'sequencing', direction: 'after', crossWsPositioning: true },
  { sourceType: 'story', field: 'blocks', targetType: 'story', action: 'sequencing', direction: 'before', crossWsPositioning: true },
  { sourceType: 'story', field: 'implements', targetType: ['feature', 'document'], action: 'containment', direction: 'parent' },

  // TASK (crossWsPositioning: false - edge only, no position constraint)
  { sourceType: 'task', field: 'parent', targetType: 'story', action: 'containment', direction: 'child' },
  { sourceType: 'task', field: 'depends_on', targetType: 'task', action: 'sequencing', direction: 'after', crossWsPositioning: false },
  { sourceType: 'task', field: 'blocks', targetType: 'task', action: 'sequencing', direction: 'before', crossWsPositioning: false },

  // DECISION
  { sourceType: 'decision', field: 'parent', targetType: ['milestone', 'story'], action: 'containment', direction: 'child', priority: 1 },
  { sourceType: 'decision', field: 'affects', targetType: ['milestone', 'story', 'task'], action: 'containment', direction: 'child', priority: 2 },
  { sourceType: 'decision', field: 'supersedes', targetType: 'decision', action: 'sequencing', direction: 'before' },

  // DOCUMENT
  { sourceType: 'document', field: 'parent', targetType: ['milestone', 'story'], action: 'containment', direction: 'child', priority: 1 },
  { sourceType: 'document', field: 'implemented_by', targetType: ['milestone', 'story', 'task'], action: 'containment', direction: 'child', priority: 2 },
  { sourceType: 'document', field: 'documents', targetType: 'feature', action: 'containment', direction: 'child', priority: 3 },
  { sourceType: 'document', field: 'previous_version', targetType: 'document', action: 'sequencing', direction: 'after' },

  // FEATURE
  { sourceType: 'feature', field: 'parent', targetType: ['milestone', 'story'], action: 'containment', direction: 'child', priority: 1 },
  { sourceType: 'feature', field: 'implemented_by', targetType: ['milestone', 'story', 'task'], action: 'containment', direction: 'child', priority: 2 },
];
```

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 2.1 | 2026-01-17 | Added entity categories (Contained/Floating/Orphan), positioning phases, priorities for Document/Feature, cross-ws positioning flags |
| 2.0 | 2026-01-17 | Initial relationship rules spec - normalized containment/sequencing model |
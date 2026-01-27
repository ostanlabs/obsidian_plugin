# Canvas Layout and Positioning

> **Version:** 1.0
> **Scope:** Automatic canvas layout algorithm and relationship rules

---

## Overview

This document specifies the positioning algorithm for automatically laying out project management entities on an Obsidian Canvas. The algorithm uses a hierarchical container model with workstream-based lanes.

---

## Coordinate System

```
Y=0 (top of canvas)
↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    CHILDREN (smaller Y, smaller X)                       │
│  [T-001] [T-002]                                                        │
│  [S-001]────────────────────────────────────────────────────────────────│
│                                                                          │
│  [DEC-001] [S-002]──────────────────────────────────────────[M-001]     │
│                                                              PARENT      │
│                                                         (larger Y, X)    │
└─────────────────────────────────────────────────────────────────────────┘
↓
Y increases
```

- **Children**: Above parent (smaller Y), to the left of parent (smaller X)
- **Parent node**: Bottom-right of its container area
- **Workstreams**: Stacked vertically (each workstream is a horizontal row)

---

## Node Sizes

| Type | ID Pattern | Width | Height |
|------|------------|-------|--------|
| **Milestone** | `M-xxx` | 280px | 200px |
| **Story** | `S-xxx` | 200px | 150px |
| **Task** | `T-xxx` | 160px | 100px |
| **Decision** | `DEC-xxx` | 180px | 120px |
| **Document** | `DOC-xxx` | 200px | 150px |
| **Feature** | `F-xxx` | 300px | 220px |

---

## Relationship Types

### Containment (Parent-Child Hierarchy)

| Source | Target | Field | Container Logic |
|--------|--------|-------|-----------------|
| Story | Milestone | `parent` | Story is child of Milestone |
| Task | Story | `parent` | Task is child of Story |
| Document | Milestone/Story | `implemented_by` | Document attached to implementer |
| Feature | Milestone/Story | `implemented_by` | Feature attached to implementer |
| Decision | Any | `affects` | Decision is child of affected entity |

### Sequencing (Left-to-Right Ordering)

| Relationship | Effect |
|--------------|--------|
| `depends_on` | Dependency is LEFT of dependent |
| `blocks` | Blocker is LEFT of blocked |

---

## Entity Categories

| Category | Definition | Position |
|----------|------------|----------|
| **Contained** | Has containment relationship | Inside parent container |
| **Floating** | Has sequencing only | Above related workstream(s) |
| **Orphan** | No relationships | Grid at bottom |

---

## Processing Pipeline

### Phase 1: Parse & Index
- Read all MD files (skip `archive` folder)
- Build entity maps by type

### Phase 2: Build Workstream Index
- Group milestones by `workstream` field
- Build milestone dependency graph
- Attach stories to milestones via `parent`

### Phase 3: Attach Children
Processing order: Decisions → Tasks → Documents → Features

### Phase 4: Calculate Container Sizes (Bottom-Up)
Order: Decisions → Tasks → Documents → Features → Stories → Milestones

### Phase 5: Position Workstreams & Milestones
- Order workstreams vertically
- Topological sort milestones horizontally

### Phase 6: Position Children Within Containers
Recursive grid positioning with dependency awareness

### Phase 7: Position Floating & Orphan Entities
- Floating: Above related workstreams
- Orphans: Grid at bottom of canvas

---

## Grid Layout Algorithm

For N children, find optimal grid arrangement:

```typescript
function calculateOptimalGrid(n: number): { columns: number; rows: number } {
  if (n <= 1) return { columns: n, rows: n };
  
  let bestDiagonal = Infinity;
  let bestCols = 1, bestRows = n;
  
  for (let cols = Math.ceil(Math.sqrt(n)); cols >= 1; cols--) {
    const rows = Math.ceil(n / cols);
    const diagonal = Math.sqrt(cols * cols + rows * rows);
    if (diagonal < bestDiagonal) {
      bestDiagonal = diagonal;
      bestCols = cols;
      bestRows = rows;
    }
  }
  return { columns: bestCols, rows: bestRows };
}
```

---

## Configurable Parameters

```typescript
interface PositioningConfig {
  childGap: 40;           // Gap between child nodes
  containerGap: 80;       // Gap between milestone containers
  workstreamGap: 120;     // Gap between workstream rows
  orphanGap: 100;         // Gap between orphan area and workstreams
}
```

---

## Edge Creation Rules

| Relationship | From Node | To Node | Default Sides |
|--------------|-----------|---------|---------------|
| `depends_on` | dependency | this entity | `right` → `left` |
| `parent` | child | parent | `top` → `bottom` |
| `affects` | decision | affected entity | `right` → `left` |
| `implements` | document/feature | implementer | `right` → `left` |
| `supersedes` | new decision | old decision | `right` → `left` |

---

## Transitive Dependency Removal

If entity C depends on both A and B, and B depends on A:
- **Before:** C → A, C → B, B → A
- **After:** C → B, B → A (C → A is removed as redundant)

This reduces visual clutter by removing edges implied by transitivity.


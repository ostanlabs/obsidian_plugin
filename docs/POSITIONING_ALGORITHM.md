# Canvas Node Positioning Algorithm V3

## Overview

This document specifies the V3 positioning algorithm for automatically laying out project management entities on an Obsidian Canvas. The algorithm uses a hierarchical container model with workstream-based lanes.

## Coordinate System & Visual Model

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
- **Starting position**: Horizontally left (X=0), vertically centered

---

## Node Types (6 entity types)

| Type | ID Pattern | Width | Height | Typical Role |
|------|------------|-------|--------|--------------|
| **Milestone** | `M-xxx` | 280px | 200px | Root containers, grouped by workstream |
| **Story** | `S-xxx` | 200px | 150px | Children of milestones, parents of tasks |
| **Task** | `T-xxx` | 160px | 100px | Leaf nodes, children of stories |
| **Decision** | `DEC-xxx` | 180px | 120px | Children of what they block/enable |
| **Document** | `DOC-xxx` | 200px | 150px | Attached to implementers |
| **Feature** | `F-xxx` | 300px | 220px | Attached to implementers |

---

## Relationship Types

### Containment Relationships (create parent-child hierarchy)

| SRC Entity | DST Entity | Field on SRC | Container Logic |
|------------|------------|--------------|-----------------|
| Story | Milestone | `parent: M-xxx` | Story is child of Milestone |
| Task | Story | `parent: S-xxx` | Task is child of Story |
| Document | Milestone/Story | `implemented_by: [X]` | Document attached to implementer |
| Feature | Milestone/Story | `implemented_by: [X]` | Feature attached to implementer |
| Decision | Any | `blocks: [X]` / `enables: [X]` | Decision is child of what it blocks/enables |

### Non-Containment Relationships (ordering only)

| Relationship | Effect |
|--------------|--------|
| `depends_on` | Dependency is LEFT of dependent |
| `blocks` (between milestones) | Blocker is LEFT of blocked |

---

## Processing Pipeline

### Phase 1: Parse & Index

1. Read all MD files (skip `archive` folder)
2. Build entity maps by type:
   - `milestonesMap: Map<entityId, MilestoneData>`
   - `storiesMap: Map<entityId, StoryData>`
   - `tasksMap: Map<entityId, TaskData>`
   - `decisionsMap: Map<entityId, DecisionData>`
   - `documentsMap: Map<entityId, DocumentData>`
   - `featuresMap: Map<entityId, FeatureData>`

### Phase 2: Build Workstream Index

1. Group milestones by `workstream` field
2. For each workstream, build milestone graph with edges from:
   - `depends_on`: dependency LEFT of dependent
   - `blocks`: blocker LEFT of blocked
3. Attach stories to milestones via `parent` field
4. Orphaned stories → separate list

### Phase 3: Attach Children

**Processing order:**
1. **Decisions** (first, to build decision chains)
2. **Tasks** (attach to stories)
3. **Documents** (classify by parent count)
4. **Features** (classify by parent count)

**Classification for Documents/Features/Decisions:**
- **1 parent**: Attach directly to that parent
- **1+ parents**: Store in `multiParentEntities` list
- **0 parents**: Store in `orphanedEntities` list

**Decision chains:** If `DEC-001.blocks: [DEC-002]`, then DEC-001 is a child of DEC-002.

### Phase 4: Detect Circular Dependencies

- Check for cycles in dependency/blocks relationships
- On circular dependency: Show error notice, skip the edge

---

## Size Calculation (Bottom-Up)

**Order:** Decisions → Tasks → Documents → Features → Stories → Milestones

### Grid Layout Algorithm

For N children, find optimal grid arrangement by minimizing diagonal:

```typescript
function calculateOptimalGrid(n: number): { columns: number; rows: number } {
  if (n <= 1) return { columns: n, rows: n };

  // Find smallest square >= n
  let targetSquare = n;
  while (!Number.isInteger(Math.sqrt(targetSquare))) {
    targetSquare++;
  }

  // Try arrangements, minimize diagonal = sqrt(width² + height²)
  let bestDiagonal = Infinity;
  let bestCols = 1, bestRows = n;

  for (let cols = Math.sqrt(targetSquare); cols >= 1; cols--) {
    const rows = Math.ceil(n / cols);
    const width = cols * (childWidth + gap);
    const height = rows * (childHeight + gap);
    const diagonal = Math.sqrt(width * width + height * height);

    if (diagonal < bestDiagonal) {
      bestDiagonal = diagonal;
      bestCols = cols;
      bestRows = rows;
    }
  }

  return { columns: bestCols, rows: bestRows };
}
```

### Container Size Formula

```
containerSize(node) = {
  width: gridWidth + nodeWidth + horizontalGap,
  height: max(gridHeight, nodeHeight)
}
```

Where `gridWidth` and `gridHeight` are computed from children's container sizes arranged in optimal grid.

---

## Position Calculation (Top-Down)

### Step 1: Position Workstreams Vertically

```typescript
const startX = 0;
const totalHeight = sum(workstreamHeights) + (workstreamCount - 1) * workstreamGap;
let currentY = -totalHeight / 2;  // Center vertically

for (const workstream of sortedWorkstreams) {
  workstream.baseY = currentY;
  currentY += workstream.height + workstreamGap;
}
```

### Step 2: Sort & Position Milestones Horizontally

Within each workstream, sort milestones by:
- `blocks`: blocker LEFT of blocked
- `depends_on`: dependency LEFT of dependent

```typescript
let currentX = startX;
for (const milestone of sortedMilestones) {
  milestone.position = { x: currentX + milestone.containerWidth - nodeWidth, y: workstream.baseY };
  currentX += milestone.containerWidth + containerGap;
}
```

### Step 3: Position Children Within Containers

Children positioned LEFT and ABOVE parent:

```typescript
function positionChildren(parent: ContainerNode) {
  const grid = calculateOptimalGrid(children.length);
  const gridStartX = parent.x - horizontalGap - gridWidth;
  const gridStartY = parent.y - (gridHeight - nodeHeight) / 2;

  for (let i = 0; i < children.length; i++) {
    const col = i % grid.columns;
    const row = Math.floor(i / grid.columns);

    children[i].position = {
      x: gridStartX + col * (childWidth + childGap),
      y: gridStartY + row * (childHeight + childGap)
    };

    positionChildren(children[i]);  // Recurse
  }
}
```

### Step 4: Adjust for Non-Overlap

Push milestone containers right if they overlap with previous containers.

---

## Multi-Parent Entity Positioning

### Same Workstream
Center horizontally above all parents, checking for overlaps:

```typescript
const minX = Math.min(...parentPositions.map(p => p.x));
const maxX = Math.max(...parentPositions.map(p => p.x + p.width));
const minY = Math.min(...parentPositions.map(p => p.y));

entity.position = {
  x: (minX + maxX) / 2 - entityWidth / 2,
  y: minY - verticalGap - entityHeight
};
```

### Cross-Workstream
Create minimal-height band between workstreams, position entity centered in band.

---

## Orphan Positioning

Position below-left of all workstreams in a grid:

```typescript
const orphanGrid = calculateOptimalGrid(orphans.length);
const startX = 0;
const startY = maxWorkstreamY + orphanGap;

for (let i = 0; i < orphans.length; i++) {
  const col = i % orphanGrid.columns;
  const row = Math.floor(i / orphanGrid.columns);

  orphans[i].position = {
    x: startX + col * (orphanWidth + childGap),
    y: startY + row * (orphanHeight + childGap)
  };
}
```

---

## Configurable Parameters

```typescript
interface PositioningConfig {
  nodeSizes: {
    milestone: { width: 280, height: 200 },
    story: { width: 200, height: 150 },
    task: { width: 160, height: 100 },
    decision: { width: 180, height: 120 },
    document: { width: 200, height: 150 },
    feature: { width: 300, height: 220 }
  };

  childGap: 40;           // Gap between child nodes in grid
  containerGap: 80;       // Gap between milestone containers
  workstreamGap: 120;     // Gap between workstream rows
  orphanGap: 100;         // Gap between orphan area and workstreams
  crossWorkstreamBandMinHeight: 60;
}
```

---

## Example Layout

Given:
- M-001 (workstream: engineering)
- M-002 (workstream: engineering, depends_on: [M-001])
- S-001 (parent: M-001)
- S-002 (parent: M-001)
- T-001, T-002 (parent: S-001)
- DEC-001 (blocks: [S-002])

```
WORKSTREAM: engineering
┌─────────────────────────────────────────────────────────────────────────┐
│  [T-001] [T-002]                                                        │
│           [S-001]                                                       │
│                                                                         │
│  [DEC-001]                                                              │
│           [S-002]     [M-001] ─────────────────────────────── [M-002]   │
└─────────────────────────────────────────────────────────────────────────┘
```

- M-001 LEFT of M-002 (dependency order)
- S-001, S-002 LEFT of M-001 (children)
- T-001, T-002 LEFT+ABOVE S-001 (grandchildren in grid)
- DEC-001 LEFT of S-002 (blocks it, so is its child)


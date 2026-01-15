# Feature Entity Implementation Spec: Obsidian Plugin

**Version:** 1.0  
**Status:** Draft  
**Created:** 2026-01-13  
**Purpose:** Specification for adding Feature (F-XXX) entity type to Obsidian Plugin

---

## Overview

Add `feature` entity support to the Obsidian plugin, including:
- File creation and parsing
- Canvas positioning and visual representation
- Relationship linking to other entities
- UI commands and templates

---

## 1. File Management

### 1.1 File Location

```
vault/
├── features/                    # Feature files directory
│   ├── F-001_Workflow_Execution.md
│   ├── F-002_Tool_Invocation.md
│   └── ...
├── milestones/
├── stories/
├── tasks/
├── decisions/
└── documents/
```

### 1.2 File Naming Convention

```
Pattern: {id}_{title_snake_case}.md
Example: F-001_Workflow_Execution.md
         F-042_Self_Configuration_Tools.md

Rules:
- ID prefix: F-XXX (3+ digits, zero-padded)
- Title: Snake_case, max 50 chars
- Special chars removed: [/:*?"<>|]
- Spaces → underscores
```

### 1.3 Frontmatter Schema

```yaml
---
# Identity (required)
id: F-001
type: feature
title: Workflow Execution
workstream: engineering

# Feature Classification (required)
user_story: "As a developer, I want to define workflows in YAML..."
tier: OSS                    # OSS | Premium
phase: MVP                   # MVP | 0 | 1 | 2 | 3 | 4 | 5
status: Complete             # Planned | In Progress | Complete | Deferred
priority: High               # Low | Medium | High | Critical

# Detail Fields (optional)
personas:                    # Target user personas
  - OSS Developer
  - Team Lead
acceptance_criteria:         # Completion criteria
  - Criterion 1
  - Criterion 2
test_refs:                   # Test file references
  - tests/test_workflow.py

# Relationships
implemented_by:              # Milestones and Stories
  - M-012
  - S-XXX
documented_by:               # Documents
  - DOC-029
decided_by:                  # Decisions
  - DEC-001
depends_on:                  # Other Features
  - F-000
blocks:                      # Features this blocks (auto-synced)
  - F-010

# Metadata (auto-managed)
last_updated: 2026-01-13T12:00:00.000Z
created_at: 2026-01-13T10:00:00.000Z
---
```

### 1.4 Body Template

```markdown
# {id}: {title}

## Description

{Detailed description of the feature}

## User Story

{user_story from frontmatter, expanded}

## Acceptance Criteria

{Rendered as checklist from frontmatter}

## Implementation Notes

{Technical notes, considerations}

## Related

- **Implements:** {links to milestones/stories}
- **Docs:** {links to documents}
- **Decisions:** {links to decisions}
- **Depends On:** {links to features}
- **Blocks:** {links to features}
```

---

## 2. Canvas Positioning

### 2.1 Canvas Layout Strategy

Features should be positioned on a **separate canvas** or **dedicated region** within the main canvas, organized by phase and tier.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FEATURE CANVAS                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────── OSS FEATURES ───────────┐  ┌─── PREMIUM FEATURES ───┐   │
│   │                                     │  │                        │   │
│   │  Phase MVP    Phase 1    Phase 2    │  │  Phase 4    Phase 5   │   │
│   │  ┌─────┐     ┌─────┐    ┌─────┐    │  │  ┌─────┐    ┌─────┐   │   │
│   │  │F-001│     │F-021│    │F-041│    │  │  │F-101│    │F-121│   │   │
│   │  │F-002│     │F-022│    │F-042│    │  │  │F-102│    │F-122│   │   │
│   │  │F-003│     │F-023│    │F-043│    │  │  │F-103│    │F-123│   │   │
│   │  │ ... │     │ ... │    │ ... │    │  │  │ ... │    │ ... │   │   │
│   │  └─────┘     └─────┘    └─────┘    │  │  └─────┘    └─────┘   │   │
│   │                                     │  │                        │   │
│   └─────────────────────────────────────┘  └────────────────────────┘   │
│                                                                          │
│   ┌────────────────────── DEPENDENCY ARROWS ──────────────────────┐     │
│   │  F-001 ──────► F-010 ──────► F-041                            │     │
│   │                  │                                             │     │
│   │                  ▼                                             │     │
│   │               F-025 ──────► F-102                             │     │
│   └───────────────────────────────────────────────────────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Canvas Regions

Define fixed regions for feature placement:

```typescript
interface CanvasRegions {
  features: {
    // OSS Region (left side)
    oss: {
      x: 0,
      y: 0,
      width: 2000,
      phases: {
        MVP:  { x: 0,    y: 100, width: 400 },
        "0":  { x: 400,  y: 100, width: 300 },
        "1":  { x: 700,  y: 100, width: 400 },
        "2":  { x: 1100, y: 100, width: 400 },
        "3":  { x: 1500, y: 100, width: 400 },
      }
    },
    // Premium Region (right side)
    premium: {
      x: 2200,
      y: 0,
      width: 1000,
      phases: {
        "4":  { x: 2200, y: 100, width: 500 },
        "5":  { x: 2700, y: 100, width: 500 },
      }
    }
  }
}
```

### 2.3 Node Positioning Algorithm

```typescript
interface FeatureNodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

function calculateFeaturePosition(
  feature: Feature,
  existingNodes: FeatureNodePosition[]
): FeatureNodePosition {
  // 1. Determine region based on tier
  const regionBase = feature.tier === "OSS" 
    ? canvasRegions.features.oss 
    : canvasRegions.features.premium;
  
  // 2. Determine column based on phase
  const phaseColumn = regionBase.phases[feature.phase];
  
  // 3. Find next available Y position in column
  const nodesInColumn = existingNodes.filter(n => 
    n.x >= phaseColumn.x && n.x < phaseColumn.x + phaseColumn.width
  );
  
  const maxY = nodesInColumn.length > 0
    ? Math.max(...nodesInColumn.map(n => n.y + n.height))
    : phaseColumn.y;
  
  // 4. Return position
  return {
    x: phaseColumn.x + 20,  // Padding from column edge
    y: maxY + 30,           // Gap between nodes
    width: 280,             // Standard feature card width
    height: 120,            // Standard feature card height
  };
}
```

### 2.4 Node Visual Style

```typescript
interface FeatureNodeStyle {
  // Size
  width: 280,
  height: 120,  // Can expand based on content
  
  // Colors by status
  colors: {
    "Planned":     { bg: "#f0f0f0", border: "#999999" },
    "In Progress": { bg: "#fff3cd", border: "#ffc107" },
    "Complete":    { bg: "#d4edda", border: "#28a745" },
    "Deferred":    { bg: "#e2e3e5", border: "#6c757d" },
  },
  
  // Tier indicator
  tierBadge: {
    "OSS":     { bg: "#e7f5ff", text: "#1971c2" },
    "Premium": { bg: "#fff4e6", text: "#e8590c" },
  },
  
  // Phase indicator
  phaseBadge: {
    position: "top-right",
    format: "Phase {phase}",
  }
}
```

### 2.5 Canvas Node Content

```markdown
┌─────────────────────────────────────┐
│ [OSS]              Phase MVP        │  ← Badges
├─────────────────────────────────────┤
│ F-001: Workflow Execution           │  ← Title
├─────────────────────────────────────┤
│ Status: ✅ Complete                 │  ← Status
│ Priority: High                      │  ← Priority
├─────────────────────────────────────┤
│ Implements: M-012, S-XXX           │  ← Relationships
│ Tests: 2 files                      │  ← Test coverage
└─────────────────────────────────────┘
```

---

## 3. Relationship Management

### 3.1 Link Types on Canvas

```typescript
enum FeatureLinkType {
  // Feature → Feature (dependency)
  DEPENDS_ON = "depends_on",      // Dashed arrow, color: blue
  
  // Feature → Implementation (implemented_by is stored on Feature)
  IMPLEMENTED_BY = "implemented_by", // Solid arrow, color: green
  
  // Feature → Document
  DOCUMENTED_BY = "documented_by",   // Dotted arrow, color: gray
  
  // Feature → Decision
  DECIDED_BY = "decided_by",         // Dotted arrow, color: purple
}

interface LinkStyle {
  depends_on:      { style: "dashed", color: "#1971c2", arrowEnd: true },
  implemented_by:  { style: "solid",  color: "#2f9e44", arrowEnd: true },
  documented_by:   { style: "dotted", color: "#868e96", arrowEnd: true },
  decided_by:      { style: "dotted", color: "#9c36b5", arrowEnd: true },
}
```

### 3.2 Cross-Canvas Links

When features link to entities on other canvases (milestones, stories):

```typescript
interface CrossCanvasLink {
  sourceCanvas: "features.canvas",
  sourceNode: "F-001",
  targetCanvas: "engineering.canvas",  // or "main.canvas"
  targetNode: "M-012",
  linkType: "implemented_by",
  
  // Visual: Show abbreviated link on feature canvas
  // Full link navigates to target canvas
}
```

### 3.3 Bidirectional Sync

When adding relationships via plugin:

```typescript
async function addImplementedBy(
  featureId: string, 
  implementorId: string
): Promise<void> {
  // 1. Update Feature file
  const feature = await loadFeature(featureId);
  feature.implemented_by.push(implementorId);
  await saveFeature(feature);
  
  // 2. Update implementing entity (Milestone or Story)
  const implementor = await loadEntity(implementorId);
  if (!implementor.implements) {
    implementor.implements = [];
  }
  implementor.implements.push(featureId);
  await saveEntity(implementor);
  
  // 3. Update canvas links (if on same canvas)
  await updateCanvasLink(featureId, implementorId, "implemented_by");
}
```

---

## 4. Assignment UI

### 4.1 Command Palette Commands

```typescript
const featureCommands = [
  {
    id: "create-feature",
    name: "Create Feature",
    callback: () => showCreateFeatureModal(),
  },
  {
    id: "link-feature-to-milestone",
    name: "Link Feature to Milestone",
    callback: () => showLinkModal("milestone"),
  },
  {
    id: "link-feature-to-story",
    name: "Link Feature to Story", 
    callback: () => showLinkModal("story"),
  },
  {
    id: "set-feature-phase",
    name: "Set Feature Phase",
    callback: () => showPhaseSelector(),
  },
  {
    id: "set-feature-tier",
    name: "Set Feature Tier (OSS/Premium)",
    callback: () => showTierSelector(),
  },
  {
    id: "view-feature-coverage",
    name: "View Feature Coverage Report",
    callback: () => showCoverageReport(),
  },
];
```

### 4.2 Create Feature Modal

```
┌────────────────────────────────────────────────────────────┐
│                    Create New Feature                       │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  Title: [________________________________]                  │
│                                                             │
│  User Story:                                                │
│  As a [_______________]                                     │
│  I want to [__________________________]                     │
│  So that [____________________________]                     │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Tier        │  │ Phase       │  │ Priority    │        │
│  │ [OSS     ▼] │  │ [MVP     ▼] │  │ [Medium  ▼] │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                             │
│  Workstream: [engineering ▼]                                │
│                                                             │
│  Personas (comma-separated):                                │
│  [OSS Developer, Team Lead_______________________]          │
│                                                             │
│  Acceptance Criteria:                                       │
│  [+ Add criterion]                                          │
│  • [________________________________] [x]                  │
│  • [________________________________] [x]                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Link to Implementation (optional)                    │   │
│  │ Milestone: [Search milestones...        ▼]          │   │
│  │ Story:     [Search stories...           ▼]          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                    [Cancel]  [Create Feature]               │
└────────────────────────────────────────────────────────────┘
```

### 4.3 Link Feature Modal

```
┌────────────────────────────────────────────────────────────┐
│              Link Feature to Implementation                 │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  Feature: F-001: Workflow Execution                         │
│                                                             │
│  Link Type: [implemented_by ▼]                              │
│                                                             │
│  Search: [_______________________________] 🔍               │
│                                                             │
│  Available Milestones:                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☐ M-012: Workflow Engine          [Completed]       │   │
│  │ ☑ M-014: CLI                      [Completed]       │   │
│  │ ☐ M-024: Plugin Framework         [Not Started]     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Available Stories:                                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☐ S-044: Self-Config MCP Tools    [Completed]       │   │
│  │ ☐ S-041: Deferred CLI Commands    [Completed]       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Currently Linked:                                          │
│  • M-012: Workflow Engine [Remove]                          │
│                                                             │
│                         [Cancel]  [Save Links]              │
└────────────────────────────────────────────────────────────┘
```

### 4.4 Context Menu (Right-Click on Entity)

When right-clicking on a Milestone or Story:

```
┌─────────────────────────────────┐
│ M-012: Workflow Engine          │
├─────────────────────────────────┤
│ View Details                    │
│ Edit                            │
│ ─────────────────────────────── │
│ Link to Feature...           ▶  │  ← NEW
│   └─ F-001: Workflow Execution  │
│   └─ F-002: Tool Invocation     │
│   └─ [Search features...]       │
│ ─────────────────────────────── │
│ View Implementing Features   ▶  │  ← NEW
│   └─ F-001: Workflow Execution  │
│ ─────────────────────────────── │
│ Change Status                ▶  │
│ Archive                         │
└─────────────────────────────────┘
```

### 4.5 Feature Sidebar Panel

When a feature is selected, show details in sidebar:

```
┌─────────────────────────────────┐
│ 📋 F-001                        │
│ Workflow Execution              │
├─────────────────────────────────┤
│ Status    ✅ Complete           │
│ Tier      🟢 OSS                │
│ Phase     MVP                   │
│ Priority  🔴 High               │
├─────────────────────────────────┤
│ USER STORY                      │
│ As a developer, I want to       │
│ define workflows in YAML...     │
├─────────────────────────────────┤
│ ACCEPTANCE CRITERIA             │
│ ☑ YAML format supported         │
│ ☑ Sequential execution          │
│ ☑ Variable templating           │
│ ☑ Error reporting               │
├─────────────────────────────────┤
│ IMPLEMENTATION          [Edit]  │
│ 📌 M-012 Workflow Engine        │
│ 📌 S-XXX Story Name             │
│ [+ Add implementation]          │
├─────────────────────────────────┤
│ DOCUMENTATION           [Edit]  │
│ 📄 DOC-029 Workflow Spec        │
│ [+ Add document]                │
├─────────────────────────────────┤
│ DECISIONS               [Edit]  │
│ ⚖️ DEC-001 Step Definition      │
│ [+ Add decision]                │
├─────────────────────────────────┤
│ TESTS                           │
│ 🧪 test_workflow_engine.py      │
│ 🧪 test_workflow_registry.py    │
├─────────────────────────────────┤
│ DEPENDENCIES                    │
│ Depends on: (none)              │
│ Blocks: F-010                   │
└─────────────────────────────────┘
```

---

## 5. Feature Canvas Setup

### 5.1 Canvas File Structure

Create `features.canvas` with predefined structure:

```json
{
  "nodes": [
    // Header nodes (labels)
    {
      "id": "header-oss",
      "type": "text",
      "text": "# OSS Features",
      "x": 0, "y": 0,
      "width": 2000, "height": 60
    },
    {
      "id": "header-premium",
      "type": "text", 
      "text": "# Premium Features",
      "x": 2200, "y": 0,
      "width": 1000, "height": 60
    },
    // Phase column headers
    {
      "id": "phase-mvp",
      "type": "text",
      "text": "## Phase MVP",
      "x": 0, "y": 70,
      "width": 400, "height": 30
    },
    // ... more phase headers
    
    // Feature nodes added dynamically
  ],
  "edges": [
    // Dependency arrows between features
  ]
}
```

### 5.2 Auto-Layout Command

```typescript
const autoLayoutCommand = {
  id: "auto-layout-features",
  name: "Auto-Layout Feature Canvas",
  callback: async () => {
    const features = await getAllFeatures();
    const canvas = await loadCanvas("features.canvas");
    
    // Group by tier and phase
    const grouped = groupFeatures(features);
    
    // Calculate positions
    const positions = calculateAllPositions(grouped);
    
    // Update canvas
    await updateCanvasNodes(canvas, positions);
    
    // Add dependency edges
    await updateCanvasDependencyEdges(canvas, features);
  }
};
```

### 5.3 Integration with Main Canvas

Option A: **Separate Canvas (Recommended)**
- `features.canvas` - All features organized by phase/tier
- Link to main canvas via cross-canvas navigation
- Keeps main canvas focused on execution (milestones/stories/tasks)

Option B: **Integrated Region**
- Add feature region to main canvas
- Features positioned above/below milestone region
- More cluttered but single view

```typescript
// Configuration option
interface PluginSettings {
  featureCanvas: {
    mode: "separate" | "integrated",
    separateCanvasPath: "features.canvas",
    integratedRegion: {
      x: 0,
      y: -1000,  // Above milestones
      width: 3000,
      height: 800
    }
  }
}
```

---

## 6. Status Indicators

### 6.1 Status Colors

```typescript
const statusColors = {
  feature: {
    "Planned":     { background: "#f8f9fa", border: "#adb5bd", icon: "⬜" },
    "In Progress": { background: "#fff9db", border: "#fab005", icon: "🔄" },
    "Complete":    { background: "#d3f9d8", border: "#40c057", icon: "✅" },
    "Deferred":    { background: "#e9ecef", border: "#868e96", icon: "⏸️" },
  }
};
```

### 6.2 Progress Indicator

Show implementation progress on feature node:

```typescript
function calculateFeatureProgress(feature: Feature): number {
  const implementors = feature.implemented_by;
  if (implementors.length === 0) return 0;
  
  const statuses = await Promise.all(
    implementors.map(id => getEntityStatus(id))
  );
  
  const completed = statuses.filter(s => s === "Completed").length;
  return Math.round((completed / statuses.length) * 100);
}

// Display as progress bar on node
// [████████░░] 80%
```

---

## 7. Queries and Views

### 7.1 Dataview Queries

```dataview
// All OSS features for Phase 2
TABLE tier, phase, status, implemented_by
FROM "features"
WHERE tier = "OSS" AND phase = "2"
SORT status ASC
```

```dataview
// Features without implementation
TABLE tier, phase, priority
FROM "features"
WHERE length(implemented_by) = 0
SORT priority DESC
```

```dataview
// Features by completion status
TABLE length(filter(implemented_by, (x) => x.status = "Completed")) as "Done",
      length(implemented_by) as "Total"
FROM "features"
GROUP BY phase
```

### 7.2 Plugin Views

```typescript
// Feature Coverage View
interface FeatureCoverageView {
  columns: [
    "Feature",
    "Tier",
    "Phase", 
    "Status",
    "Implementation %",
    "Has Docs",
    "Has Tests"
  ],
  filters: {
    tier: FeatureTier[],
    phase: FeaturePhase[],
    status: FeatureStatus[],
    hasGaps: boolean  // Missing impl/docs/tests
  },
  groupBy: "phase" | "tier" | "status"
}
```

---

## 8. Migration Support

### 8.1 Import from FUTURE_FEATURES.md

```typescript
async function importFromFutureFeatures(): Promise<void> {
  // Parse FUTURE_FEATURES.md
  const content = await readFile("FUTURE_FEATURES.md");
  const features = parseFutureFeatures(content);
  
  // Map FF-XXX to F-XXX
  for (const ff of features) {
    const feature: Feature = {
      id: generateFeatureId(),  // F-XXX
      title: ff.title,
      user_story: ff.description,  // Convert to user story format
      tier: ff.category.includes("Premium") ? "Premium" : "OSS",
      phase: mapCategoryToPhase(ff.category),
      status: ff.status === "Not planned" ? "Deferred" : "Planned",
      // ... map other fields
    };
    
    await createFeature(feature);
  }
}
```

### 8.2 Link Existing Entities

```typescript
async function linkExistingMilestones(): Promise<void> {
  // For each feature, suggest matching milestones
  const features = await getAllFeatures();
  const milestones = await getAllMilestones();
  
  for (const feature of features) {
    const suggestions = findMatchingMilestones(feature, milestones);
    
    if (suggestions.length > 0) {
      // Show UI to confirm links
      await showLinkSuggestionModal(feature, suggestions);
    }
  }
}

function findMatchingMilestones(
  feature: Feature, 
  milestones: Milestone[]
): Milestone[] {
  // Match by title similarity
  // Match by workstream
  // Match by keywords in content
  return milestones.filter(m => 
    similarity(feature.title, m.title) > 0.5 ||
    feature.title.toLowerCase().includes(m.title.toLowerCase())
  );
}
```

---

## 9. Settings

### 9.1 Plugin Settings

```typescript
interface FeaturePluginSettings {
  // File management
  featuresFolder: string;           // Default: "features"
  fileNamePattern: string;          // Default: "{id}_{title}"
  
  // Canvas
  featureCanvasPath: string;        // Default: "features.canvas"
  canvasMode: "separate" | "integrated";
  autoLayoutOnCreate: boolean;      // Default: true
  showDependencyArrows: boolean;    // Default: true
  
  // Status
  autoStatusFromImplementation: boolean;  // Default: false
  
  // UI
  showTierBadge: boolean;           // Default: true
  showPhaseBadge: boolean;          // Default: true
  showProgressBar: boolean;         // Default: true
  
  // ID generation
  featureIdPrefix: string;          // Default: "F-"
  featureIdPadding: number;         // Default: 3 (F-001)
}
```

---

## 10. Implementation Checklist

### Phase 1: Core Entity Support ✅
- [x] Add `feature` type to entity parser
- [x] Create feature file template
- [x] Implement `createFeature` function
- [x] Implement `updateFeature` function (via setFeaturePhase, setFeatureTier)
- [ ] Implement `deleteFeature` function
- [x] Add `implements` field to Milestone schema
- [x] Add `implements` field to Story schema
- [x] Add `documents` field to Document schema
- [x] Add `affects` field to Decision schema

### Phase 2: Relationship Management ✅
- [x] Add relationship fields to ItemFrontmatter and EntityIndexEntry
- [x] Implement bidirectional sync for `implemented_by`
- [x] Implement bidirectional sync for `documented_by`
- [x] Implement bidirectional sync for `decided_by`
- [x] Implement bidirectional sync for `depends_on`/`blocks`
- [x] Add to reconcile command (reconcile-all-relationships)

### Phase 3: Canvas Support ✅
- [x] Create features.canvas template (create-features-canvas command)
- [x] Implement feature node positioning (auto-layout-features command)
- [x] Implement phase column layout
- [x] Implement dependency edge rendering (renderDependencyEdges)
- [x] Add auto-layout command
- [x] Add populate features canvas command

### Phase 4: UI Components ✅
- [x] Create Feature modal (FeatureModal.ts)
- [x] Link Feature modal (LinkFeatureModal.ts)
- [x] Feature sidebar panel (FeatureDetailsView.ts)
- [x] Context menu additions (addEntityNavigatorSubmenu)
- [x] Command palette commands (create-feature, set-feature-phase, set-feature-tier, entity-nav-go-to-features)

### Phase 5: Queries and Views ✅
- [x] Feature coverage view (FeatureCoverageView.ts)
- [x] Dataview integration (standard YAML frontmatter)
- [x] Search indexing for features (EntityIndex)

### Phase 6: Migration Tools ✅
- [x] Import from FUTURE_FEATURES.md (import-future-features command)
- [x] Auto-link suggestion tool (suggest-feature-links command)
- [x] Bulk link editor (bulk-link-features command)

---

## Related Documents

- [FEATURE_ENTITY_SPEC.md](../../obsidian_mcp/docs/FEATURE_ENTITY_SPEC.md) - MCP implementation

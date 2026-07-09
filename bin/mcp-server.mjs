var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/entity-core/default-schema.ts
var default_schema_exports = {};
__export(default_schema_exports, {
  DEFAULT_SCHEMA: () => DEFAULT_SCHEMA
});
var DEFAULT_SCHEMA;
var init_default_schema = __esm({
  "src/entity-core/default-schema.ts"() {
    DEFAULT_SCHEMA = {
      schemaVersion: 1,
      settings: {
        idPadding: 3,
        archiveLayout: "by-type",
        // Canonical convention matching the production vault: TITLE-ONLY filenames
        // (no id prefix), PRESERVE-case slugs (spaces→_, hyphens kept, case preserved).
        // e.g. "Add 90-day retention policy" → "Add_90-day_retention_policy.md".
        filenamePattern: "{title}",
        filenameCase: "preserve",
        // Overlap-resolution priority (highest first): higher-priority nodes stay put and
        // lower-priority nodes are nudged aside when two overlap. Single source of truth for
        // positioningV4's overlap resolver.
        overlapPriorityOrder: ["milestone", "story", "task", "decision", "document", "feature"]
      },
      entityTypes: [
        {
          type: "milestone",
          label: "Milestone",
          idPrefix: "M",
          folder: "milestones",
          statuses: ["Not Started", "In Progress", "Completed", "Blocked"],
          defaultStatus: "Not Started",
          fields: [
            {
              name: "priority",
              kind: "enum",
              values: ["Low", "Medium", "High", "Critical"],
              required: true,
              default: "Medium"
            },
            { name: "target_date", kind: "date", required: false },
            { name: "owner", kind: "string", required: false },
            { name: "objective", kind: "text", required: false },
            { name: "success_criteria", kind: "string[]", required: false }
          ],
          canvas: { width: 500, height: 400, color: "6", icon: "target" }
        },
        {
          type: "story",
          label: "Story",
          idPrefix: "S",
          folder: "stories",
          statuses: ["Not Started", "In Progress", "Completed", "Blocked"],
          defaultStatus: "Not Started",
          fields: [
            {
              name: "priority",
              kind: "enum",
              values: ["Low", "Medium", "High", "Critical"],
              required: true,
              default: "Medium"
            },
            { name: "outcome", kind: "text", required: false },
            { name: "acceptance_criteria", kind: "string[]", required: false },
            { name: "notes", kind: "text", required: false }
          ],
          canvas: { width: 400, height: 300, color: "3", icon: "book" }
        },
        {
          type: "task",
          label: "Task",
          idPrefix: "T",
          folder: "tasks",
          statuses: ["Not Started", "In Progress", "Completed", "Blocked"],
          defaultStatus: "Not Started",
          fields: [
            { name: "goal", kind: "text", required: true },
            { name: "estimate_hrs", kind: "number", required: false },
            { name: "actual_hrs", kind: "number", required: false },
            { name: "assignee", kind: "string", required: false },
            { name: "description", kind: "text", required: false },
            { name: "technical_notes", kind: "text", required: false },
            { name: "notes", kind: "text", required: false }
          ],
          canvas: { width: 350, height: 250, color: "2", icon: "check" }
        },
        {
          type: "decision",
          label: "Decision",
          idPrefix: "DEC",
          folder: "decisions",
          statuses: ["Pending", "Decided", "Superseded"],
          defaultStatus: "Pending",
          fields: [
            { name: "context", kind: "text", required: false },
            { name: "decision", kind: "text", required: false },
            { name: "rationale", kind: "text", required: false },
            { name: "alternatives", kind: "string[]", required: false },
            // NOTE: this `decided_by` is a PERSON (string field), distinct from the
            // relationship reverse field `decided_by` written onto affects targets.
            // They share a name but live on different entity types — no collision.
            { name: "decided_by", kind: "string", required: false },
            { name: "decided_on", kind: "date", required: false }
          ],
          canvas: { width: 400, height: 300, color: "4", icon: "gavel" }
        },
        {
          type: "document",
          label: "Document",
          idPrefix: "DOC",
          folder: "documents",
          statuses: ["Draft", "Review", "Approved", "Superseded"],
          defaultStatus: "Draft",
          fields: [
            {
              name: "doc_type",
              kind: "enum",
              values: ["spec", "adr", "vision", "guide", "research"],
              required: true,
              default: "spec"
            },
            { name: "version", kind: "string", required: false },
            { name: "owner", kind: "string", required: false },
            { name: "implementation_context", kind: "text", required: false },
            { name: "content", kind: "markdown", required: false }
          ],
          canvas: { width: 400, height: 350, color: "5", icon: "file-text" }
        },
        {
          type: "feature",
          label: "Feature",
          idPrefix: "F",
          folder: "features",
          statuses: ["Planned", "In Progress", "Complete", "Deferred"],
          defaultStatus: "Planned",
          fields: [
            { name: "user_story", kind: "text", required: true },
            {
              name: "tier",
              kind: "enum",
              values: ["OSS", "Premium"],
              required: true,
              default: "OSS"
            },
            {
              name: "phase",
              kind: "enum",
              values: ["MVP", "0", "1", "2", "3", "4", "5"],
              required: true,
              default: "MVP"
            },
            {
              name: "priority",
              kind: "enum",
              values: ["Low", "Medium", "High", "Critical"],
              required: false
            },
            { name: "test_refs", kind: "string[]", required: false },
            { name: "content", kind: "markdown", required: false }
          ],
          canvas: { width: 300, height: 220, color: "1", icon: "star" }
        }
      ],
      // NOTE: relationship pairs + `positioning` metadata are the SINGLE SOURCE OF TRUTH.
      // The MCP validator (validate_project allow-list) and the plugin positioning engine
      // (positioningV4 RELATIONSHIP_RULES) both DERIVE from here via schema-derivation.ts.
      // Corrected valid set 2026-07-03 (see schema-explorer.html export).
      relationships: [
        {
          name: "hierarchy",
          label: "Hierarchy",
          pairs: [
            { from: "task", to: "story", forward: "parent", reverse: "children" },
            { from: "story", to: "milestone", forward: "parent", reverse: "children" }
          ],
          cardinality: { forward: "one", reverse: "many" },
          canvas: { color: "gray", style: "solid" },
          graph: { transitiveReduction: false, cyclePrevention: true },
          // child (from) sits under container (to); e.g. story under milestone.
          positioning: { role: "containment", containerEnd: "to" }
        },
        {
          name: "dependency",
          label: "Dependency",
          pairs: [
            // depends_on's inverse is `blocks`. Same-type ordering only (m→m, s→s, t→t).
            { from: "milestone", to: "milestone", forward: "depends_on", reverse: "blocks" },
            { from: "story", to: "story", forward: "depends_on", reverse: "blocks" },
            { from: "task", to: "task", forward: "depends_on", reverse: "blocks" }
          ],
          cardinality: { forward: "many", reverse: "many" },
          canvas: { color: "blue", style: "dashed" },
          graph: { transitiveReduction: true, cyclePrevention: true },
          // sequencing: depends_on => 'after', blocks => 'before'. crossWs suppressed for task.
          positioning: { role: "sequencing", forwardDirection: "after", emitReverseRule: true, crossWsPositioning: true, crossWsExcludedTypes: ["task"] }
        },
        {
          name: "implementation",
          label: "Implementation",
          pairs: [
            { from: "milestone", to: "feature", forward: "implements", reverse: "implemented_by" },
            { from: "story", to: "feature", forward: "implements", reverse: "implemented_by" }
          ],
          cardinality: { forward: "many", reverse: "many" },
          canvas: { color: "purple", style: "solid" },
          graph: { transitiveReduction: false, cyclePrevention: false },
          // container (from = milestone/story) is the parent; feature (to) sits under it.
          positioning: { role: "containment", containerEnd: "from", priority: 1, emitParentRule: true }
        },
        {
          name: "documentation",
          label: "Documentation",
          pairs: [
            { from: "document", to: "feature", forward: "documents", reverse: "documented_by" }
          ],
          cardinality: { forward: "many", reverse: "many" },
          canvas: { color: "yellow", style: "solid" },
          graph: { transitiveReduction: false, cyclePrevention: false },
          // document (from) sits under the feature (to = container). The parent rule lets a
          // feature claim its documents as children (documented_by → document, direction 'parent'),
          // so features at the top of deep chains keep their documents attached for layout.
          positioning: { role: "containment", containerEnd: "to", priority: 1, emitParentRule: true }
        },
        {
          name: "decision-impact",
          label: "Affects",
          pairs: [
            // affects's inverse is `decided_by`. Decision sits under the document it affects.
            { from: "decision", to: "document", forward: "affects", reverse: "decided_by" }
          ],
          cardinality: { forward: "many", reverse: "many" },
          canvas: { color: "yellow", style: "dotted" },
          graph: { transitiveReduction: false, cyclePrevention: false },
          // decision (from) sits under the document it affects (to = container). The parent rule
          // lets a document claim its decisions as children (decided_by → decision, direction 'parent').
          positioning: { role: "containment", containerEnd: "to", priority: 1, emitParentRule: true }
        },
        {
          name: "supersession",
          label: "Supersession",
          pairs: [
            { from: "decision", to: "decision", forward: "supersedes", reverse: "superseded_by" }
          ],
          cardinality: { forward: "one", reverse: "one" },
          canvas: { color: "orange", style: "solid" },
          graph: { transitiveReduction: false, cyclePrevention: true },
          // supersedes => the newer decision comes 'before' the one it supersedes. No reverse rule.
          positioning: { role: "sequencing", forwardDirection: "before", emitReverseRule: false }
        },
        {
          name: "versioning",
          label: "Versioning",
          pairs: [
            { from: "document", to: "document", forward: "previous_version", reverse: "next_version" }
          ],
          cardinality: { forward: "one", reverse: "one" },
          canvas: { color: "gray", style: "dashed" },
          graph: { transitiveReduction: false, cyclePrevention: true },
          positioning: { role: "sequencing", forwardDirection: "after", emitReverseRule: false }
        }
      ],
      workstreams: {
        values: ["engineering", "business", "infra", "research", "design", "marketing"],
        default: "engineering",
        normalization: {
          infrastructure: "infra",
          ops: "infra",
          devops: "infra",
          eng: "engineering",
          dev: "engineering",
          development: "engineering",
          biz: "business",
          rnd: "research",
          "r&d": "research",
          ux: "design",
          ui: "design",
          mktg: "marketing"
        },
        canvas: {
          engineering: { color: "3" },
          business: { color: "6" },
          design: { color: "5" },
          marketing: { color: "1" },
          infra: { color: "4" },
          research: { color: "2" }
        }
      }
    };
  }
});

// mcp.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// src/adapters/node-fs-adapter.ts
import * as fs from "fs/promises";
import * as path from "path";
var NodeFsAdapter = class {
  constructor(vaultPath) {
    this.vaultPath = vaultPath;
  }
  async readFile(filePath) {
    const fullPath = this.resolvePath(filePath);
    return await fs.readFile(fullPath, "utf-8");
  }
  async writeFile(filePath, content) {
    const fullPath = this.resolvePath(filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }
  async deleteFile(filePath) {
    const fullPath = this.resolvePath(filePath);
    await fs.unlink(fullPath);
  }
  async renameFile(oldPath, newPath) {
    const fullOldPath = this.resolvePath(oldPath);
    const fullNewPath = this.resolvePath(newPath);
    await fs.mkdir(path.dirname(fullNewPath), { recursive: true });
    await fs.rename(fullOldPath, fullNewPath);
  }
  async listFiles(folderPath) {
    const fullPath = this.resolvePath(folderPath);
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile()).map((entry) => path.join(folderPath, entry.name));
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
  async exists(filePath) {
    const fullPath = this.resolvePath(filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
  async createFolder(folderPath) {
    const fullPath = this.resolvePath(folderPath);
    await fs.mkdir(fullPath, { recursive: true });
  }
  async deleteFolder(folderPath) {
    const fullPath = this.resolvePath(folderPath);
    await fs.rm(fullPath, { recursive: true, force: true });
  }
  async stat(filePath) {
    const fullPath = this.resolvePath(filePath);
    const stats = await fs.stat(fullPath);
    return {
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtimeMs: stats.mtimeMs
    };
  }
  async readDir(folderPath) {
    const fullPath = this.resolvePath(folderPath);
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        path: path.join(folderPath, entry.name),
        isDirectory: entry.isDirectory()
      }));
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
  async createDir(folderPath, options) {
    const fullPath = this.resolvePath(folderPath);
    await fs.mkdir(fullPath, { recursive: options?.recursive ?? true });
  }
  async deleteDir(folderPath, options) {
    const fullPath = this.resolvePath(folderPath);
    await fs.rm(fullPath, { recursive: options?.recursive ?? true, force: true });
  }
  async readFiles(paths) {
    const result = /* @__PURE__ */ new Map();
    for (const filePath of paths) {
      try {
        const content = await this.readFile(filePath);
        result.set(filePath, content);
      } catch {
      }
    }
    return result;
  }
  async writeFiles(files) {
    for (const [filePath, content] of files) {
      await this.writeFile(filePath, content);
    }
  }
  resolvePath(relativePath) {
    const cleaned = relativePath.startsWith("/") ? relativePath.slice(1) : relativePath;
    return path.join(this.vaultPath, cleaned);
  }
};

// src/entity-core/types.ts
function notImplemented(name) {
  throw new Error(`NOT_IMPLEMENTED: ${name}`);
}

// src/entity-core/schema-registry.ts
var SchemaRegistry = class _SchemaRegistry {
  constructor(schema2, validationCache = /* @__PURE__ */ new Map()) {
    this.schema = schema2;
    this.validationCache = validationCache;
    this.typeMap = /* @__PURE__ */ new Map();
    this.relationshipMap = /* @__PURE__ */ new Map();
    this.fieldToRelationship = /* @__PURE__ */ new Map();
    for (const type of schema2.entityTypes) {
      this.typeMap.set(type.type, type);
    }
    for (const rel of schema2.relationships) {
      this.relationshipMap.set(rel.name, rel);
      for (const pair of rel.pairs) {
        this.fieldToRelationship.set(pair.forward, rel);
        this.fieldToRelationship.set(pair.reverse, rel);
      }
    }
  }
  /**
   * Load schema from `<vaultPath>/schema.json`, else built-in default.
   * Invalid schema → last-good/default + errors[].
   */
  static async load(fs2, vaultPath) {
    const schemaPath = `${vaultPath}/schema.json`;
    const errors = [];
    let usedDefault = false;
    try {
      const content = await fs2.readFile(schemaPath);
      const parsed = JSON.parse(content);
      if (!parsed.entityTypes || !Array.isArray(parsed.entityTypes)) {
        errors.push("Invalid schema: missing entityTypes array");
        throw new Error("Invalid schema");
      }
      if (!parsed.relationships || !Array.isArray(parsed.relationships)) {
        errors.push("Invalid schema: missing relationships array");
        throw new Error("Invalid schema");
      }
      return {
        registry: new _SchemaRegistry(parsed),
        errors,
        usedDefault: false
      };
    } catch (err) {
      usedDefault = true;
      if (errors.length === 0 && !(err instanceof Error && err.message.includes("ENOENT"))) {
        errors.push(`Failed to load schema: ${err instanceof Error ? err.message : String(err)}`);
      }
      const { DEFAULT_SCHEMA: DEFAULT_SCHEMA2 } = await Promise.resolve().then(() => (init_default_schema(), default_schema_exports));
      return {
        registry: new _SchemaRegistry(DEFAULT_SCHEMA2),
        errors,
        usedDefault: true
      };
    }
  }
  /** Raw schema object (used by migrator + tests). */
  getSchema() {
    return this.schema;
  }
  getSchemaVersion() {
    return this.schema.schemaVersion;
  }
  // --- Type queries -----------------------------------------------------------
  getEntityType(type) {
    return this.typeMap.get(type) || null;
  }
  getAllEntityTypes() {
    return Array.from(this.typeMap.values());
  }
  getStatuses(type) {
    const typeDef = this.getEntityType(type);
    return typeDef ? typeDef.statuses : [];
  }
  getDefaultStatus(type) {
    const typeDef = this.getEntityType(type);
    return typeDef?.defaultStatus || "";
  }
  // --- Field queries ----------------------------------------------------------
  getFields(type) {
    const typeDef = this.getEntityType(type);
    return typeDef?.fields || [];
  }
  getField(type, fieldName) {
    const fields = this.getFields(type);
    return fields.find((f) => f.name === fieldName) || null;
  }
  getSystemFields() {
    return ["id", "type", "title", "status", "created_at", "updated_at", "workstream"];
  }
  // --- Relationship queries ---------------------------------------------------
  getRelationship(name) {
    return this.relationshipMap.get(name) || null;
  }
  getAllRelationships() {
    return Array.from(this.relationshipMap.values());
  }
  getRelationshipsForType(type) {
    return this.getAllRelationships().filter((rel) => {
      return rel.pairs.some((pair) => {
        return pair.from === type || pair.from === "*" || pair.to === type || pair.to === "*";
      });
    });
  }
  getRelationshipForField(fieldName) {
    return this.fieldToRelationship.get(fieldName) || null;
  }
  getRelationshipByName(name) {
    return this.relationshipMap.get(name) || null;
  }
  /**
   * Cardinality of a relationship field, resolved by the DIRECTION the field
   * represents (forward vs reverse). E.g. `children` is the reverse of
   * hierarchy (cardinality 'many') even though the forward `parent` is 'one'.
   * Fixes the §9 setRelationshipIds bug.
   */
  getCardinalityForField(fieldName) {
    const rel = this.getRelationshipForField(fieldName);
    if (!rel) {
      throw new Error(`No relationship found for field: ${fieldName}`);
    }
    for (const pair of rel.pairs) {
      if (pair.forward === fieldName) {
        return rel.cardinality.forward;
      }
      if (pair.reverse === fieldName) {
        return rel.cardinality.reverse;
      }
    }
    throw new Error(`Field ${fieldName} not found in relationship ${rel.name} pairs`);
  }
  // --- Validation -------------------------------------------------------------
  getValidator(_type) {
    return notImplemented("SchemaRegistry.getValidator");
  }
  // --- Settings ---------------------------------------------------------------
  getIdPadding() {
    return this.schema.settings.idPadding;
  }
  getArchiveLayout() {
    return this.schema.settings.archiveLayout;
  }
  getFilenamePattern() {
    return this.schema.settings.filenamePattern;
  }
  /** Filename slug casing mode; defaults to 'snake' when the schema omits it. */
  getFilenameCase() {
    return this.schema.settings.filenameCase ?? "snake";
  }
  // --- Canvas -----------------------------------------------------------------
  getCanvasConfig(type) {
    const typeDef = this.getEntityType(type);
    return typeDef?.canvas || { width: 400, height: 300, color: "1", icon: "file" };
  }
  // --- Workstreams ------------------------------------------------------------
  getWorkstreams() {
    if (!this.schema.workstreams) return [];
    if (Array.isArray(this.schema.workstreams)) {
      return this.schema.workstreams.map((w) => w.name);
    }
    return this.schema.workstreams.values || [];
  }
  getDefaultWorkstream() {
    if (!this.schema.workstreams) return "";
    if (Array.isArray(this.schema.workstreams)) {
      return this.schema.workstreams[0]?.name || "";
    }
    return this.schema.workstreams.default || "";
  }
  normalizeWorkstream(input) {
    const normalized = input.toLowerCase().trim();
    if (!this.schema.workstreams) return input;
    if (Array.isArray(this.schema.workstreams)) {
      for (const ws of this.schema.workstreams) {
        if (ws.name.toLowerCase() === normalized) {
          return ws.name;
        }
      }
      for (const ws of this.schema.workstreams) {
        if (ws.aliases?.some((alias) => alias.toLowerCase() === normalized)) {
          return ws.name;
        }
      }
      return input;
    }
    const values = this.schema.workstreams.values || [];
    for (const ws of values) {
      if (ws.toLowerCase() === normalized) {
        return ws;
      }
    }
    const normMap = this.schema.workstreams.normalization || {};
    if (normMap[normalized]) {
      return normMap[normalized];
    }
    return input;
  }
  getWorkstreamColor(workstream) {
    if (!this.schema.workstreams) return "#808080";
    if (Array.isArray(this.schema.workstreams)) {
      const ws = this.schema.workstreams.find((w) => w.name === workstream);
      return ws?.color || "#808080";
    }
    const canvas = this.schema.workstreams.canvas || {};
    return canvas[workstream]?.color || "#808080";
  }
};

// mcp.ts
init_default_schema();

// src/entity-core/schema-derivation.ts
function buildReverseRelationMap(schema2) {
  const map = {};
  for (const rel of schema2.relationships) {
    for (const p of rel.pairs) {
      map[p.forward] = p.reverse;
      map[p.reverse] = p.forward;
    }
  }
  return map;
}
function buildValidationAllowList(schema2) {
  const allow = {};
  const add = (type, field, target) => {
    if (type === "*" || target === "*") return;
    allow[type] ??= {};
    allow[type][field] ??= [];
    if (!allow[type][field].includes(target)) allow[type][field].push(target);
  };
  for (const rel of schema2.relationships) {
    for (const p of rel.pairs) {
      add(p.from, p.forward, p.to);
      add(p.to, p.reverse, p.from);
    }
  }
  return allow;
}

// src/entity-core/schema-bootstrap.ts
init_default_schema();
var SCHEMA_FILENAME = "schema.json";
function serializeSchema(schema2) {
  return JSON.stringify(schema2, null, 2) + "\n";
}
function validateSchema(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object") {
    errors.push("schema is not an object");
    return errors;
  }
  const s = obj;
  if (!Array.isArray(s.entityTypes)) errors.push('missing "entityTypes" array');
  else {
    const types = /* @__PURE__ */ new Set();
    s.entityTypes.forEach((e, i) => {
      if (!e || typeof e !== "object") {
        errors.push(`entityTypes[${i}] is not an object`);
        return;
      }
      if (!e.type) errors.push(`entityTypes[${i}] missing "type"`);
      else {
        if (types.has(e.type)) errors.push(`duplicate entity type "${e.type}"`);
        types.add(e.type);
      }
    });
  }
  if (!Array.isArray(s.relationships)) errors.push('missing "relationships" array');
  else {
    const knownTypes = new Set(Array.isArray(s.entityTypes) ? s.entityTypes.map((e) => e?.type) : []);
    const okType = (t) => t === "*" || knownTypes.size === 0 || knownTypes.has(t);
    s.relationships.forEach((r, i) => {
      const label = r?.name ?? i;
      if (!r || typeof r !== "object") {
        errors.push(`relationships[${i}] is not an object`);
        return;
      }
      if (!r.name) errors.push(`relationships[${i}] missing "name"`);
      if (!Array.isArray(r.pairs)) {
        errors.push(`relationships[${label}] missing "pairs" array`);
      } else {
        r.pairs.forEach((p, j) => {
          for (const k of ["from", "to", "forward", "reverse"]) {
            if (!p || !p[k]) errors.push(`relationships[${label}].pairs[${j}] missing "${k}"`);
          }
          if (p?.from && !okType(p.from)) errors.push(`relationships[${label}].pairs[${j}].from unknown type "${p.from}"`);
          if (p?.to && !okType(p.to)) errors.push(`relationships[${label}].pairs[${j}].to unknown type "${p.to}"`);
        });
      }
      if (r.positioning) {
        const role = r.positioning.role;
        if (role !== "containment" && role !== "sequencing") {
          errors.push(`relationships[${label}].positioning.role must be "containment" or "sequencing"`);
        }
        if (role === "containment" && r.positioning.containerEnd && r.positioning.containerEnd !== "from" && r.positioning.containerEnd !== "to") {
          errors.push(`relationships[${label}].positioning.containerEnd must be "from" or "to"`);
        }
        if (role === "sequencing" && r.positioning.forwardDirection && r.positioning.forwardDirection !== "before" && r.positioning.forwardDirection !== "after") {
          errors.push(`relationships[${label}].positioning.forwardDirection must be "before" or "after"`);
        }
        if (r.positioning.priority !== void 0 && (typeof r.positioning.priority !== "number" || r.positioning.priority < 0)) {
          errors.push(`relationships[${label}].positioning.priority must be a non-negative number`);
        }
      }
    });
  }
  return errors;
}
async function loadOrBootstrapSchema(fs2, dir) {
  const path2 = dir && dir !== "." ? `${dir}/${SCHEMA_FILENAME}` : SCHEMA_FILENAME;
  let content = null;
  try {
    content = await fs2.readFile(path2);
  } catch {
    content = null;
  }
  if (content === null) {
    try {
      await fs2.writeFile(path2, serializeSchema(DEFAULT_SCHEMA));
      return { schema: DEFAULT_SCHEMA, source: "default", errors: [], wroteDefault: true, path: path2 };
    } catch (e) {
      return { schema: DEFAULT_SCHEMA, source: "default", errors: [`could not write ${SCHEMA_FILENAME}: ${e instanceof Error ? e.message : String(e)}`], wroteDefault: false, path: path2 };
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return { schema: DEFAULT_SCHEMA, source: "default", errors: [`${SCHEMA_FILENAME} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`], wroteDefault: false, path: path2 };
  }
  const errors = validateSchema(parsed);
  if (errors.length > 0) {
    return { schema: DEFAULT_SCHEMA, source: "default", errors, wroteDefault: false, path: path2 };
  }
  return { schema: parsed, source: "file", errors: [], wroteDefault: false, path: path2 };
}

// schema-designer.html
var schema_designer_default = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Schema Relationship Designer</title>
<style>
  :root{--bg:#0f1216;--panel:#161b22;--panel2:#1c232d;--line:#2a333f;--text:#e6edf3;--muted:#8b98a6;--accent:#4a90e0;--good:#49b36b;--seq:#4a90e0;--con:#9b59d0}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:var(--bg);color:var(--text);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .app{display:flex;height:100vh;overflow:hidden}
  .sidebar{width:390px;min-width:390px;height:100%;overflow-y:auto;background:var(--panel);border-right:1px solid var(--line);padding:16px}
  .stage{flex:1;position:relative;overflow:hidden}
  h1{font-size:16px;margin:0 0 2px}
  .sub{color:var(--muted);font-size:12px;margin:0 0 12px}
  .section{margin:16px 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  .btnrow{display:flex;gap:6px;margin:8px 0 4px;flex-wrap:wrap}
  .btn{background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:6px;padding:5px 9px;font-size:12px;cursor:pointer}
  .btn:hover{border-color:var(--accent)}
  .btn.primary{background:var(--good);border-color:var(--good);color:#08130c;font-weight:700;padding:9px 12px;width:100%;font-size:13px;margin-top:4px}
  .applynote{background:rgba(74,144,224,.1);border:1px solid #3a5f88;border-radius:8px;padding:8px 10px;font-size:12px;color:#bcd;margin:8px 0}
  .applynote code{background:#0b0e12}
  .group{border:1px solid var(--line);border-radius:9px;margin:8px 0;overflow:hidden;background:var(--panel)}
  .ghead{display:flex;align-items:center;gap:9px;padding:9px;cursor:pointer;background:var(--panel2)}
  .ghead .rline{width:26px;border-top-width:3px}
  .ghead .name{font-weight:600;flex:1}
  .ghead .cnt{font-size:11px;color:var(--muted)}
  .roleTag{font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;border-radius:4px;padding:1px 5px}
  .role-containment{background:rgba(155,89,208,.18);color:#c9a3ec;border:1px solid #6b4a86}
  .role-sequencing{background:rgba(74,144,224,.16);color:#9cc4f0;border:1px solid #3a5f88}
  .pairs{padding:2px 6px 6px}
  .pair{display:flex;align-items:center;gap:8px;padding:6px;border-radius:6px;font-size:12px;cursor:pointer}
  .pair:hover{background:var(--panel2)}.pair.off{opacity:.4}
  .pair .fromto{flex:1}.pair .fromto b{color:var(--text)}.pair .fld{color:var(--muted)}
  .anytag{font-size:9px;font-weight:700;color:#8b98a6;border:1px solid var(--line);border-radius:4px;padding:0 4px}
  input[type=checkbox]{accent-color:var(--accent);cursor:pointer;margin:0}
  .item{display:flex;align-items:center;gap:9px;padding:7px;border-radius:8px;cursor:pointer;user-select:none}
  .item:hover{background:var(--panel2)}.item.off{opacity:.42}
  .swatch{width:14px;height:14px;border-radius:4px;flex:0 0 auto}
  .chip{display:inline-block;font-size:10px;color:var(--muted);border:1px solid var(--line);border-radius:4px;padding:0 5px;margin-left:4px}
  code{background:var(--panel2);border-radius:4px;padding:1px 4px;font-size:11px}
  svg{width:100%;height:100%;display:block}
  .node circle{cursor:grab}.node.dim,.edge.dim{opacity:.12}
  .edge path{cursor:pointer}.edge.disabled path{stroke-dasharray:3 4!important;opacity:.16!important}
  .nlabel{font-size:12px;font-weight:600;fill:var(--text);pointer-events:none}
  .nprefix{font-size:13px;font-weight:700;fill:#0f1216;pointer-events:none}
  .elabel{font-size:10px;fill:var(--muted);pointer-events:none}.elabel-bg{fill:var(--bg);opacity:.72}
  #tooltip{position:absolute;pointer-events:none;background:#0b0e12;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:12px;max-width:280px;opacity:0;transition:opacity .1s;box-shadow:0 6px 20px rgba(0,0,0,.5);z-index:5}
  #tooltip b{color:#fff}#tooltip .kv{color:var(--muted)}
  .legend{position:absolute;left:14px;bottom:12px;background:rgba(11,14,18,.85);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:11px;color:var(--muted);max-width:420px}
  .legend .k{display:inline-flex;align-items:center;gap:5px;margin-right:12px}
  .legend .ln{width:22px;height:0;border-top-width:3px;display:inline-block}
  .count{position:absolute;right:14px;top:12px;background:rgba(11,14,18,.85);border:1px solid var(--line);border-radius:8px;padding:6px 10px;font-size:12px;color:var(--muted)}
  #toast{position:absolute;left:50%;top:16px;transform:translateX(-50%);background:var(--good);color:#08130c;font-weight:700;padding:8px 16px;border-radius:8px;opacity:0;transition:opacity .2s;z-index:9}
  #preview{max-height:260px;overflow:auto;background:#0b0e12;border:1px solid var(--line);border-radius:8px;padding:8px;font:11px/1.4 ui-monospace,Menlo,monospace;white-space:pre;color:#bcd;margin-top:8px;display:none}
  .hint{color:var(--muted);font-size:11px;margin-top:6px}
  .fallback{max-width:640px;margin:14vh auto 0;padding:28px;background:var(--panel);border:1px solid var(--line);border-radius:12px;text-align:center}
  .fallback h1{font-size:20px;margin-bottom:10px}.fallback p{color:var(--muted);font-size:14px;line-height:1.6}
  .fallback code{font-size:13px}
</style>
</head>
<body>
<script>
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// CONTRACT: the MCP \`get_schema_designer\` tool injects the vault's live schema by
// running  html.replaceAll('"__SCHEMA_PLACEHOLDER__"', JSON.stringify(schema)).
// So at runtime ACTIVE_SCHEMA becomes the full Schema OBJECT. Keep the next line
// EXACTLY as-is (the quoted token is what gets replaced).
const ACTIVE_SCHEMA = "__SCHEMA_PLACEHOLDER__";
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

(function () {
  // Fallback: opened as a raw file (token never replaced) \u2192 ACTIVE_SCHEMA is still a string.
  if (typeof ACTIVE_SCHEMA === 'string' || !ACTIVE_SCHEMA ||
      !Array.isArray(ACTIVE_SCHEMA.entityTypes) || !Array.isArray(ACTIVE_SCHEMA.relationships)) {
    document.body.innerHTML =
      '<div class="fallback"><h1>Schema Relationship Designer</h1>' +
      '<p>This page needs a live schema injected into it. Open it through the ' +
      '<code>get_schema_designer</code> MCP tool (it substitutes your vault\u2019s active schema), ' +
      'rather than opening the raw <code>schema-designer.html</code> file directly.</p></div>';
    return;
  }
  main(ACTIVE_SCHEMA);
})();

function main(SCHEMA) {
  const SVGNS = 'http://www.w3.org/2000/svg';

  // \u2500\u2500 Colour resolution \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Obsidian canvas numeric palette (1..6), common colour names, hex passthrough,
  // else a deterministic fallback palette by index.
  const OBS = {'1':'#e0544a','2':'#e08a3a','3':'#e0bd3a','4':'#49b36b','5':'#39a8c0','6':'#9b6dff'};
  const NAMED = {gray:'#8a8f98',grey:'#8a8f98',blue:'#4a90e0',purple:'#9b59d0',violet:'#9b59d0',
    yellow:'#d9b23a',gold:'#d9b23a',orange:'#e07b3a',red:'#e0544a',green:'#49b36b',
    cyan:'#39a8c0',teal:'#3ab0a0',pink:'#e06aa8',magenta:'#c65cc6'};
  const FALLBACK = ['#9b6dff','#e0bd3a','#e08a3a','#49b36b','#39a8c0','#e0544a','#4a90e0','#e06aa8','#3ab0a0','#c65cc6'];
  function resolveColor(c, i) {
    if (c === undefined || c === null || c === '') return FALLBACK[i % FALLBACK.length];
    const s = String(c).trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s;
    if (OBS[s]) return OBS[s];
    const lc = s.toLowerCase();
    if (NAMED[lc]) return NAMED[lc];
    return FALLBACK[i % FALLBACK.length];
  }

  // \u2500\u2500 Nodes: one per entity type, plus synthetic nodes for any pair endpoint that
  //    isn't a declared entity type ('*' \u2192 "Any", or an unknown type name). \u2500\u2500\u2500\u2500\u2500\u2500
  const ENT = SCHEMA.entityTypes.map((e, i) => ({
    type: e.type,
    label: e.label || e.type,
    prefix: e.idPrefix || String(e.type || '?').slice(0, 3).toUpperCase(),
    color: resolveColor(e.canvas && e.canvas.color, i),
  }));
  const known = new Set(ENT.map(e => e.type));
  const NODES = ENT.slice();
  const extraTypes = new Set();
  let usesAny = false;
  SCHEMA.relationships.forEach(r => (r.pairs || []).forEach(p => {
    [p.from, p.to].forEach(t => {
      if (t === '*' || t === undefined || t === null) { usesAny = usesAny || t === '*'; }
      else if (!known.has(t)) extraTypes.add(t);
    });
  }));
  [...extraTypes].forEach((t, i) => NODES.push({
    type: t, label: t, prefix: String(t).slice(0, 3).toUpperCase(), color: FALLBACK[(ENT.length + i) % FALLBACK.length],
  }));
  if (usesAny) NODES.push({ type: '*', label: 'Any', prefix: '*', color: '#8b98a6', isAny: true });
  const nodeById = Object.fromEntries(NODES.map(n => [n.type, n]));
  function endLabel(t) { return t === '*' ? 'Any' : (nodeById[t] ? nodeById[t].label : t); }

  // \u2500\u2500 Relationships (normalised view model). role/style DERIVED from positioning.
  //    Solid = containment, dashed = sequencing. Default containment if absent. \u2500\u2500
  const RELS = SCHEMA.relationships.map((r, ri) => {
    const role = (r.positioning && r.positioning.role) === 'sequencing' ? 'sequencing' : 'containment';
    const card = r.cardinality ? \`\${r.cardinality.forward || '?'} \u2192 \${r.cardinality.reverse || '?'}\` : '';
    return {
      ri,
      name: r.name || ('relationship-' + ri),
      label: r.label || r.name || ('Relationship ' + ri),
      role,
      color: resolveColor(r.canvas && r.canvas.color, ri),
      card,
      pairs: (r.pairs || []).map((p, pi) => ({
        pi, key: ri + '|' + pi,
        from: p.from, to: p.to, forward: p.forward, reverse: p.reverse,
      })),
    };
  });

  const styleFor = role => role === 'containment' ? '' : '8 6'; // solid vs dashed

  // \u2500\u2500 State \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const pairOn = {};        // key "ri|pi" -> bool
  RELS.forEach(r => r.pairs.forEach(p => pairOn[p.key] = true));
  const entOn = {};         // node type -> visible (view filter only)
  NODES.forEach(n => entOn[n.type] = true);
  const pos = {};
  let hoverNode = null;

  // \u2500\u2500 Editable positioning metadata per relationship (ri -> normalized object) \u2500\u2500
  const relPos = {}, relPosDirty = {};
  RELS.forEach(rel => { relPos[rel.ri] = normalizePos(SCHEMA.relationships[rel.ri].positioning); });
  function normalizePos(p) {
    p = p || {};
    return {
      role: p.role === 'sequencing' ? 'sequencing' : 'containment',
      containerEnd: p.containerEnd === 'from' ? 'from' : 'to',
      priority: (typeof p.priority === 'number') ? p.priority : undefined,
      emitParentRule: !!p.emitParentRule,
      forwardDirection: p.forwardDirection === 'before' ? 'before' : 'after',
      emitReverseRule: !!p.emitReverseRule,
      crossWsPositioning: !!p.crossWsPositioning,
      crossWsExcludedTypes: Array.isArray(p.crossWsExcludedTypes) ? p.crossWsExcludedTypes.slice() : [],
    };
  }
  // Emit only the role-relevant fields, matching the schema's positioning conventions.
  function cleanPos(P) {
    if (P.role === 'sequencing') {
      const o = { role: 'sequencing', forwardDirection: P.forwardDirection };
      if (P.emitReverseRule) o.emitReverseRule = true;
      if (P.crossWsPositioning) o.crossWsPositioning = true;
      if (P.crossWsExcludedTypes && P.crossWsExcludedTypes.length) o.crossWsExcludedTypes = P.crossWsExcludedTypes.slice();
      return o;
    }
    const o = { role: 'containment', containerEnd: P.containerEnd };
    if (typeof P.priority === 'number' && !isNaN(P.priority)) o.priority = P.priority;
    if (P.emitParentRule) o.emitParentRule = true;
    return o;
  }
  // Per-relationship positioning editor (role + role-conditional fields).
  function buildPosEditor(rel) {
    const ri = rel.ri, P = relPos[ri];
    const box = document.createElement('div');
    box.style.cssText = 'padding:5px 7px;margin:2px 0 7px;border-top:1px dashed #2a3038;display:flex;flex-wrap:wrap;gap:5px 10px;align-items:center';
    let html = '<span class="kv" style="width:100%;opacity:.65">positioning</span>' +
      \`<label class="kv">role <select data-f="role"><option value="containment"\${P.role === 'containment' ? ' selected' : ''}>containment</option><option value="sequencing"\${P.role === 'sequencing' ? ' selected' : ''}>sequencing</option></select></label>\`;
    if (P.role === 'containment') {
      html += \`<label class="kv">container <select data-f="containerEnd"><option value="to"\${P.containerEnd === 'to' ? ' selected' : ''}>to</option><option value="from"\${P.containerEnd === 'from' ? ' selected' : ''}>from</option></select></label>\` +
        \`<label class="kv">priority <input data-f="priority" type="number" style="width:42px" value="\${P.priority == null ? '' : P.priority}"></label>\` +
        \`<label class="kv"><input data-f="emitParentRule" type="checkbox"\${P.emitParentRule ? ' checked' : ''}> parent rule</label>\`;
    } else {
      html += \`<label class="kv">order <select data-f="forwardDirection"><option value="after"\${P.forwardDirection === 'after' ? ' selected' : ''}>after</option><option value="before"\${P.forwardDirection === 'before' ? ' selected' : ''}>before</option></select></label>\` +
        \`<label class="kv"><input data-f="emitReverseRule" type="checkbox"\${P.emitReverseRule ? ' checked' : ''}> reverse rule</label>\` +
        \`<label class="kv"><input data-f="crossWsPositioning" type="checkbox"\${P.crossWsPositioning ? ' checked' : ''}> cross-ws</label>\` +
        \`<label class="kv" style="width:100%">exclude <input data-f="crossWsExcludedTypes" type="text" style="width:130px" value="\${esc(P.crossWsExcludedTypes.join(','))}" placeholder="task,\u2026"></label>\`;
    }
    box.innerHTML = html;
    box.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('change', () => {
      const f = inp.dataset.f; relPosDirty[ri] = true;
      if (f === 'role') { P.role = inp.value; rel.role = inp.value; refresh(); return; }
      if (f === 'priority') P.priority = inp.value === '' ? undefined : Number(inp.value);
      else if (f === 'crossWsExcludedTypes') P.crossWsExcludedTypes = inp.value.split(',').map(s => s.trim()).filter(Boolean);
      else if (inp.type === 'checkbox') P[f] = inp.checked;
      else P[f] = inp.value;
      updatePreview();
    }));
    return box;
  }

  const svg = document.getElementById('svg');
  const tooltip = document.getElementById('tooltip');
  const toast = document.getElementById('toast');
  const W = 980, H = 720, CX = W / 2 + 40, CY = H / 2, NR = 34;
  const R = Math.min(300, Math.max(170, 70 + NODES.length * 22));
  NODES.forEach((n, i) => {
    const a = -Math.PI / 2 + i * (2 * Math.PI / NODES.length);
    pos[n.type] = { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
  });
  // Preset hexagon slots for the core types: execution hierarchy on the LEFT
  // half (milestone/story/task), knowledge entities on the RIGHT half
  // (feature/document/decision). Flat-top hexagon angles; unknown/extra types
  // keep their computed circle slot; everything stays draggable.
  const PRESET_ANGLES = {
    milestone: 240, story: 180, task: 120,      // up-left, left, down-left
    feature: 300, document: 0, decision: 60,    // up-right, right, down-right
  };
  NODES.forEach(n => {
    const deg = PRESET_ANGLES[n.type];
    if (deg !== undefined) {
      const a = deg * Math.PI / 180;
      pos[n.type] = { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
    }
  });

  // \u2500\u2500 Sidebar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function buildSidebar() {
    const rl = document.getElementById('rel-list'); rl.innerHTML = '';
    RELS.forEach(rel => {
      const keys = rel.pairs.map(p => p.key);
      const on = keys.filter(k => pairOn[k]).length, total = keys.length;
      const g = document.createElement('div'); g.className = 'group';
      const head = document.createElement('div'); head.className = 'ghead';
      head.innerHTML =
        \`<input type="checkbox"><span class="rline" style="border-top:3px \${rel.role === 'containment' ? 'solid' : 'dashed'} \${rel.color}"></span>\` +
        \`<span class="name">\${esc(rel.label)}</span><span class="roleTag role-\${rel.role}">\${rel.role}</span><span class="cnt">\${on}/\${total}</span>\`;
      const cb = head.querySelector('input');
      cb.checked = total > 0 && on === total; cb.indeterminate = on > 0 && on < total;
      cb.addEventListener('click', e => { e.stopPropagation(); keys.forEach(k => pairOn[k] = e.target.checked); refresh(); });
      g.appendChild(head);
      const box = document.createElement('div'); box.className = 'pairs';
      if (rel.card) { const n = document.createElement('div'); n.className = 'hint'; n.style.padding = '2px 6px'; n.textContent = 'cardinality: ' + rel.card; box.appendChild(n); }
      rel.pairs.forEach(p => {
        const row = document.createElement('label'); row.className = 'pair' + (pairOn[p.key] ? '' : ' off');
        const anyF = p.from === '*' ? '<span class="anytag">any</span> ' : '';
        const anyT = p.to === '*' ? ' <span class="anytag">any</span>' : '';
        row.innerHTML =
          \`<input type="checkbox" \${pairOn[p.key] ? 'checked' : ''}>\` +
          \`<span class="fromto"><b>\${anyF}\${esc(endLabel(p.from))}</b> \u2192 <b>\${esc(endLabel(p.to))}\${anyT}</b>\` +
          \`<br><span class="fld">\${esc(p.forward || '')} \xB7 \u21A9 \${esc(p.reverse || '')}</span></span>\`;
        row.querySelector('input').addEventListener('change', ev => { pairOn[p.key] = ev.target.checked; refresh(); });
        box.appendChild(row);
      });
      g.appendChild(box);
      g.appendChild(buildPosEditor(rel));
      rl.appendChild(g);
    });
    const el = document.getElementById('ent-list'); el.innerHTML = '';
    NODES.forEach(n => {
      const it = document.createElement('label'); it.className = 'item' + (entOn[n.type] ? '' : ' off');
      it.innerHTML = \`<input type="checkbox" \${entOn[n.type] ? 'checked' : ''}><span class="swatch" style="background:\${n.color}"></span><span><b>\${esc(n.label)}</b> <code>\${esc(n.prefix)}\${n.isAny ? '' : '-'}</code></span>\`;
      it.querySelector('input').addEventListener('change', ev => { entOn[n.type] = ev.target.checked; refresh(); });
      el.appendChild(it);
    });
  }

  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'all-on') Object.keys(pairOn).forEach(k => pairOn[k] = true);
    if (a === 'all-off') Object.keys(pairOn).forEach(k => pairOn[k] = false);
    if (a === 'con-only') RELS.forEach(r => r.pairs.forEach(p => pairOn[p.key] = r.role === 'containment'));
    refresh();
  }));
  ['opt-labels', 'opt-hideDisabled'].forEach(id => document.getElementById(id).addEventListener('change', render));

  // \u2500\u2500 Graph \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function computeEdges() {
    const edges = []; const hide = document.getElementById('opt-hideDisabled').checked;
    RELS.forEach(rel => rel.pairs.forEach(p => {
      const from = (p.from === '*' || !nodeById[p.from]) ? (p.from === '*' ? '*' : p.from) : p.from;
      const to = (p.to === '*' || !nodeById[p.to]) ? (p.to === '*' ? '*' : p.to) : p.to;
      if (!nodeById[from] || !nodeById[to]) return; // unresolvable endpoint \u2014 skip drawing
      const en = pairOn[p.key]; if (!en && hide) return;
      if (!entOn[from] || !entOn[to]) return;
      edges.push({ rel, from, to, fwd: p.forward, rev: p.reverse, enabled: en, key: p.key });
    }));
    return edges;
  }
  function assignCurves(edges) {
    const g = {};
    edges.forEach(e => { const k = [e.from, e.to].sort().join('|'); (g[k] = g[k] || []).push(e); });
    Object.values(g).forEach(a => { const n = a.length; a.forEach((e, i) => e.curv = (i - (n - 1) / 2) * 30); });
  }
  function trim(p, q, d) { const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1; return { x: p.x + dx / l * d, y: p.y + dy / l * d }; }
  function edgeGeom(e) {
    const a = pos[e.from], b = pos[e.to];
    if (e.from === e.to) {
      const p = pos[e.from], o = 54; const s = { x: p.x - 14, y: p.y - NR + 4 }, en = { x: p.x + 14, y: p.y - NR + 4 };
      return { d: \`M \${s.x} \${s.y} C \${p.x - o} \${p.y - NR - o}, \${p.x + o} \${p.y - NR - o}, \${en.x} \${en.y}\`, lx: p.x, ly: p.y - NR - o - 4 };
    }
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    const c = { x: mx - dy / l * e.curv, y: my + dx / l * e.curv }; const s = trim(a, c, NR + 2), en = trim(b, c, NR + 11);
    return { d: \`M \${s.x} \${s.y} Q \${c.x} \${c.y} \${en.x} \${en.y}\`, lx: (s.x + 2 * c.x + en.x) / 4, ly: (s.y + 2 * c.y + en.y) / 4 };
  }

  function render() {
    const edges = computeEdges(); assignCurves(edges);
    const showLabels = document.getElementById('opt-labels').checked;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const defs = document.createElementNS(SVGNS, 'defs');
    [...new Set(RELS.map(r => r.color))].forEach(c => {
      const m = document.createElementNS(SVGNS, 'marker'); m.setAttribute('id', 'arw-' + c.replace('#', ''));
      m.setAttribute('viewBox', '0 0 10 10'); m.setAttribute('refX', '9'); m.setAttribute('refY', '5');
      m.setAttribute('markerWidth', '7'); m.setAttribute('markerHeight', '7'); m.setAttribute('orient', 'auto-start-reverse');
      const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', 'M0,0 L10,5 L0,10 z'); p.setAttribute('fill', c);
      m.appendChild(p); defs.appendChild(m);
    });
    svg.appendChild(defs);
    const gE = document.createElementNS(SVGNS, 'g'), gL = document.createElementNS(SVGNS, 'g'), gN = document.createElementNS(SVGNS, 'g');
    svg.appendChild(gE); svg.appendChild(gL); svg.appendChild(gN);
    edges.forEach(e => {
      const geo = edgeGeom(e); const g = document.createElementNS(SVGNS, 'g'); g.setAttribute('class', 'edge' + (e.enabled ? '' : ' disabled'));
      if (hoverNode && e.from !== hoverNode && e.to !== hoverNode) g.classList.add('dim');
      const path = document.createElementNS(SVGNS, 'path'); path.setAttribute('d', geo.d); path.setAttribute('fill', 'none'); path.setAttribute('stroke', e.rel.color);
      path.setAttribute('stroke-width', 2.3); path.setAttribute('stroke-dasharray', styleFor(e.rel.role)); path.setAttribute('opacity', .95);
      if (e.enabled) path.setAttribute('marker-end', 'url(#arw-' + e.rel.color.replace('#', '') + ')');
      path.addEventListener('mousemove', ev => showTip(ev, e)); path.addEventListener('mouseleave', hideTip);
      path.addEventListener('click', () => { pairOn[e.key] = !pairOn[e.key]; refresh(); });
      g.appendChild(path); gE.appendChild(g);
      if (showLabels && e.fwd) {
        const t = document.createElementNS(SVGNS, 'text'); t.setAttribute('x', geo.lx); t.setAttribute('y', geo.ly); t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'elabel'); t.textContent = e.fwd;
        const bg = document.createElementNS(SVGNS, 'rect'); bg.setAttribute('class', 'elabel-bg'); gL.appendChild(bg); gL.appendChild(t);
        const bb = t.getBBox(); bg.setAttribute('x', bb.x - 3); bg.setAttribute('y', bb.y - 1); bg.setAttribute('width', bb.width + 6); bg.setAttribute('height', bb.height + 2); bg.setAttribute('rx', 3);
      }
    });
    NODES.forEach(n => {
      if (!entOn[n.type]) return; const p = pos[n.type]; const g = document.createElementNS(SVGNS, 'g'); g.setAttribute('class', 'node'); if (hoverNode && hoverNode !== n.type) g.classList.add('dim');
      const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', NR); c.setAttribute('fill', n.color); c.setAttribute('stroke', '#0f1216'); c.setAttribute('stroke-width', '3');
      if (n.isAny) c.setAttribute('stroke-dasharray', '4 4');
      const pre = document.createElementNS(SVGNS, 'text'); pre.setAttribute('x', p.x); pre.setAttribute('y', p.y + 5); pre.setAttribute('text-anchor', 'middle'); pre.setAttribute('class', 'nprefix'); pre.textContent = n.prefix;
      const lb = document.createElementNS(SVGNS, 'text'); lb.setAttribute('x', p.x); lb.setAttribute('y', p.y + NR + 16); lb.setAttribute('text-anchor', 'middle'); lb.setAttribute('class', 'nlabel'); lb.textContent = n.label;
      g.appendChild(c); g.appendChild(pre); g.appendChild(lb);
      g.addEventListener('mouseenter', () => { hoverNode = n.type; render(); }); g.addEventListener('mouseleave', () => { hoverNode = null; render(); });
      enableDrag(c, n.type); gN.appendChild(g);
    });
    const kept = Object.values(pairOn).filter(Boolean).length, tot = Object.keys(pairOn).length;
    document.getElementById('count').textContent = \`keeping \${kept}/\${tot} pairs \xB7 \${edges.filter(e => e.enabled).length} active edges\`;
    document.getElementById('legend').innerHTML =
      \`<span class="k"><span class="ln" style="border-top:3px solid var(--con)"></span> Containment (solid)</span>\` +
      \`<span class="k"><span class="ln" style="border-top:3px dashed var(--seq)"></span> Sequencing (dashed)</span><br>\` +
      \`Arrows point <b style="color:var(--text)">from \u2192 to</b>. Click an edge/pair to toggle \xB7 hover a node to isolate \xB7 drag to rearrange.\`;
    updatePreview();
  }

  function showTip(ev, e) {
    tooltip.innerHTML =
      \`<b>\${esc(e.rel.label)}</b> <span class="roleTag role-\${e.rel.role}">\${e.rel.role}</span>\${e.enabled ? '' : ' <span class="kv">(off)</span>'}<br>\` +
      \`<span class="kv">from</span> \${esc(endLabel(e.from))} <span class="kv">\u2192 to</span> \${esc(endLabel(e.to))}<br>\` +
      \`<span class="kv">forward:</span> <b>\${esc(e.fwd || '')}</b> \xB7 <span class="kv">reverse:</span> \${esc(e.rev || '')}<br>\` +
      \`<span class="kv">click to \${e.enabled ? 'disable' : 'enable'}</span>\`;
    const r = svg.getBoundingClientRect(); tooltip.style.left = (ev.clientX - r.left + 14) + 'px'; tooltip.style.top = (ev.clientY - r.top + 14) + 'px'; tooltip.style.opacity = 1;
  }
  function hideTip() { tooltip.style.opacity = 0; }
  function enableDrag(circle, type) {
    circle.addEventListener('mousedown', e => {
      e.preventDefault(); const rect = svg.getBoundingClientRect(); const sx = W / rect.width, sy = H / rect.height;
      function mv(ev) { pos[type] = { x: (ev.clientX - rect.left) * sx, y: (ev.clientY - rect.top) * sy }; render(); }
      function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
  }

  // \u2500\u2500 EXPORT \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Full Schema object = deep copy of ACTIVE_SCHEMA with \`relationships\` filtered
  // to only the ENABLED pairs. Relationships with zero enabled pairs are dropped;
  // every other field (name,label,cardinality,canvas,graph,positioning) and each
  // kept pair is preserved verbatim, as are entityTypes/settings/workstreams.
  function buildExport() {
    const out = JSON.parse(JSON.stringify(SCHEMA)); // deep copy of everything
    out.relationships = [];
    SCHEMA.relationships.forEach((rel, ri) => {
      const keptPairs = (rel.pairs || []).filter((p, pi) => pairOn[ri + '|' + pi]);
      if (keptPairs.length === 0) return;                 // drop relationships with no enabled pairs
      const relCopy = JSON.parse(JSON.stringify(rel));    // preserve every field verbatim
      relCopy.pairs = JSON.parse(JSON.stringify(keptPairs));
      // Apply edited positioning (or re-serialize the original if it had one).
      if (relPosDirty[ri] || SCHEMA.relationships[ri].positioning) relCopy.positioning = cleanPos(relPos[ri]);
      out.relationships.push(relCopy);
    });
    return out;
  }

  function updatePreview() { const pre = document.getElementById('preview'); if (pre.style.display !== 'none') pre.textContent = JSON.stringify(buildExport(), null, 2); }
  document.getElementById('previewToggle').addEventListener('click', () => {
    const pre = document.getElementById('preview'); const show = pre.style.display === 'none'; pre.style.display = show ? 'block' : 'none';
    document.getElementById('previewToggle').textContent = show ? 'Hide preview' : 'Show preview'; updatePreview();
  });
  document.getElementById('copyBtn').addEventListener('click', async () => {
    const exp = buildExport(); const txt = JSON.stringify(exp, null, 2);
    try { await navigator.clipboard.writeText(txt); }
    catch (_) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    const pairs = exp.relationships.reduce((a, r) => a + (r.pairs ? r.pairs.length : 0), 0);
    toast.textContent = \`Copied schema \u2014 \${exp.relationships.length} relationships, \${pairs} pairs\`;
    toast.style.opacity = 1; setTimeout(() => toast.style.opacity = 0, 2200);
  });

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function refresh() { buildSidebar(); render(); }

  document.getElementById('meta').textContent =
    \`\${SCHEMA.entityTypes.length} entity types \xB7 \${SCHEMA.relationships.length} relationships\`;
  refresh();
}
</script>
<div class="app">
  <aside class="sidebar">
    <h1>Schema Relationship Designer</h1>
    <p class="sub"><span id="meta"></span>. <b>Containment</b> builds the tree (where a node sits); <b>Sequencing</b> orders siblings. Toggle relationships per entity pair <b>and edit each relationship's positioning</b>, then copy the resulting schema.</p>
    <button class="btn primary" id="copyBtn">&#128203; Copy schema (enabled pairs only)</button>
    <div class="applynote">Paste into the <code>set_schema</code> MCP tool to apply: <code>set_schema { "schema": &lt;pasted&gt; }</code>. The copied object is your full schema with only the toggled-on pairs kept.</div>
    <div class="btnrow">
      <button class="btn" data-act="all-on">All on</button>
      <button class="btn" data-act="all-off">All off</button>
      <button class="btn" data-act="con-only">Containment only</button>
      <button class="btn" id="previewToggle">Show preview</button>
    </div>
    <pre id="preview"></pre>
    <div class="section">Relationships \u2014 enable per entity pair</div>
    <div id="rel-list"></div>
    <p class="hint">Click a pair (or an edge) to toggle it. Header toggles the whole group. <b style="color:var(--con)">Solid</b> = containment \xB7 <b style="color:var(--seq)">dashed</b> = sequencing. A dashed-outline node marked <code>*</code> means "Any".</p>
    <div class="section">View filter (does not affect export)</div>
    <div id="ent-list"></div>
    <label class="item"><input type="checkbox" id="opt-labels" checked><span>Show edge labels</span></label>
    <label class="item"><input type="checkbox" id="opt-hideDisabled"><span>Hide disabled edges</span></label>
  </aside>
  <main class="stage">
    <div class="count" id="count"></div>
    <svg id="svg" viewBox="0 0 980 720" preserveAspectRatio="xMidYMid meet"></svg>
    <div class="legend" id="legend"></div>
    <div id="tooltip"></div>
    <div id="toast"></div>
  </main>
</div>
</body>
</html>
`;

// src/entity-core/parser.ts
import YAML from "yaml";
var ParseError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ParseError";
  }
};
var EntityParser = class {
  constructor(schema2) {
    this.schema = schema2;
  }
  parse(content, filePath) {
    const { frontmatter } = this.extractFrontmatter(content);
    if (!frontmatter.id || typeof frontmatter.id !== "string") {
      throw new ParseError("Missing or invalid id field");
    }
    if (!frontmatter.type || typeof frontmatter.type !== "string") {
      throw new ParseError("Missing or invalid type field");
    }
    const id = frontmatter.id;
    const type = frontmatter.type;
    const entity = {
      id,
      type,
      title: frontmatter.title || "Untitled",
      status: frontmatter.status || this.schema.getDefaultStatus(type),
      workstream: frontmatter.workstream || this.schema.getDefaultWorkstream(),
      created_at: frontmatter.created_at || (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: frontmatter.updated_at || (/* @__PURE__ */ new Date()).toISOString(),
      archived: Boolean(frontmatter.archived),
      vault_path: frontmatter.vault_path || filePath,
      canvas_source: frontmatter.canvas_source || "",
      fields: {},
      relationships: {}
    };
    const typeFields = this.schema.getFields(type);
    const systemFields = new Set(this.schema.getSystemFields());
    for (const field of typeFields) {
      const value = frontmatter[field.name];
      if (value !== void 0 && value !== null) {
        entity.fields[field.name] = value;
      }
    }
    const relationships = this.schema.getRelationshipsForType(type);
    const relationshipFieldNames = /* @__PURE__ */ new Set();
    for (const rel of relationships) {
      for (const pair of rel.pairs) {
        if (pair.from === type || pair.from === "*") {
          relationshipFieldNames.add(pair.forward);
          const value = frontmatter[pair.forward];
          if (value !== void 0 && value !== null) {
            entity.relationships[pair.forward] = value;
          }
        }
        if (pair.to === type || pair.to === "*") {
          relationshipFieldNames.add(pair.reverse);
          const value = frontmatter[pair.reverse];
          if (value !== void 0 && value !== null) {
            entity.relationships[pair.reverse] = value;
          }
        }
      }
    }
    const customFieldNames = new Set(typeFields.map((f) => f.name));
    const passthrough = {};
    for (const [key, value] of Object.entries(frontmatter)) {
      if (!systemFields.has(key) && !customFieldNames.has(key) && !relationshipFieldNames.has(key) && value !== void 0 && value !== null) {
        passthrough[key] = value;
      }
    }
    if (Object.keys(passthrough).length > 0) {
      entity.passthrough = passthrough;
    }
    return entity;
  }
  extractFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) {
      return { frontmatter: {}, body: content };
    }
    const yamlContent = match[1];
    const body = match[2] || "";
    try {
      const frontmatter = YAML.parse(yamlContent);
      return { frontmatter: frontmatter || {}, body };
    } catch (err) {
      throw new ParseError(`Failed to parse YAML frontmatter: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
};

// src/entity-core/serializer.ts
import YAML2 from "yaml";
var EntitySerializer = class {
  constructor(schema2) {
    this.schema = schema2;
  }
  serialize(entity) {
    const frontmatter = {};
    frontmatter.id = entity.id;
    frontmatter.type = entity.type;
    frontmatter.title = entity.title;
    frontmatter.status = entity.status;
    frontmatter.workstream = entity.workstream;
    frontmatter.created_at = entity.created_at;
    frontmatter.updated_at = entity.updated_at;
    if (entity.archived) {
      frontmatter.archived = entity.archived;
    }
    frontmatter.vault_path = entity.vault_path;
    if (entity.canvas_source) {
      frontmatter.canvas_source = entity.canvas_source;
    }
    const typeFields = this.schema.getFields(entity.type);
    for (const field of typeFields) {
      const value = entity.fields[field.name];
      if (value !== void 0 && value !== null) {
        frontmatter[field.name] = value;
      }
    }
    const relationships = this.schema.getRelationshipsForType(entity.type);
    for (const rel of relationships) {
      for (const pair of rel.pairs) {
        if (pair.from === entity.type || pair.from === "*") {
          const value = entity.relationships[pair.forward];
          if (value !== void 0 && value !== null) {
            frontmatter[pair.forward] = value;
          }
        }
        if (pair.to === entity.type || pair.to === "*") {
          const value = entity.relationships[pair.reverse];
          if (value !== void 0 && value !== null) {
            frontmatter[pair.reverse] = value;
          }
        }
      }
    }
    if (entity.passthrough) {
      for (const [key, value] of Object.entries(entity.passthrough)) {
        if (!(key in frontmatter) && value !== void 0 && value !== null) {
          frontmatter[key] = value;
        }
      }
    }
    const yaml = YAML2.stringify(frontmatter, {
      lineWidth: 0,
      // Don't wrap lines
      // Quote-when-needed: plain/unquoted scalars, auto-quoted only when a value
      // would otherwise misparse (colons, ambiguous numbers/bools, special leads).
      defaultStringType: "PLAIN",
      defaultKeyType: "PLAIN"
    });
    return `---
${yaml}---
`;
  }
};

// src/entity-core/id-allocator.ts
var IDAllocator = class {
  constructor(schema2, index2) {
    this.schema = schema2;
    this.index = index2;
  }
  /** Next free id for a type: per-type max+1 over ACTIVE and ARCHIVED ids. */
  async allocate(type) {
    const typeDef = this.schema.getEntityType(type);
    if (!typeDef) {
      throw new Error(`Unknown entity type: ${type}`);
    }
    const prefix = typeDef.idPrefix;
    const padding = this.schema.getIdPadding();
    const allIds = this.index.getAllIds(true);
    const numbers = [];
    for (const id of allIds) {
      if (id.startsWith(prefix + "-")) {
        const numPart = id.substring(prefix.length + 1);
        const num = parseInt(numPart, 10);
        if (!isNaN(num)) {
          numbers.push(num);
        }
      }
    }
    const max = numbers.length > 0 ? Math.max(...numbers) : 0;
    const next = max + 1;
    const formatted = String(next).padStart(padding, "0");
    return `${prefix}-${formatted}`;
  }
  reserve(id) {
    this.index.reserveId(id);
  }
  validate(id) {
    const type = getEntityTypeFromId(id, this.schema);
    if (!type) return false;
    const typeDef = this.schema.getEntityType(type);
    if (!typeDef) return false;
    const match = id.match(/^([A-Z]+)-(\d+)$/);
    if (!match) return false;
    const [, prefix, digits] = match;
    if (prefix !== typeDef.idPrefix) return false;
    const padding = this.schema.getIdPadding();
    if (digits.length < padding) return false;
    return true;
  }
  /**
   * Repair duplicate ids of last resort: keep the active entity's id, reassign
   * the other to the next free per-type id, rewrite all inbound references.
   * Returns the reassigned ids.
   */
  async repairDuplicates(fs2, pathResolver2) {
    const duplicates = this.index.findDuplicateIds();
    if (duplicates.length === 0) {
      return [];
    }
    const reassigned = [];
    for (const { id, paths } of duplicates) {
      let activeIndex = 0;
      for (let i = 0; i < paths.length; i++) {
        if (!paths[i].includes("archive/")) {
          activeIndex = i;
          break;
        }
      }
      const keepPath = paths[activeIndex];
      const reassignPaths = paths.filter((_, i) => i !== activeIndex);
      for (const path2 of reassignPaths) {
        try {
          const content = await fs2.readFile(path2);
          const type = getEntityTypeFromId(id, this.schema);
          if (!type) continue;
          const newId = await this.allocate(type);
          const updated = content.replace(
            /^id:\s*(.+)$/m,
            `id: ${newId}`
          );
          await fs2.writeFile(path2, updated);
          reassigned.push(newId);
        } catch (error) {
          console.error(`Failed to repair duplicate ${id} at ${path2}:`, error);
        }
      }
    }
    return reassigned;
  }
};
function getEntityTypeFromId(id, schema2) {
  const match = id.match(/^([A-Z]+)-/);
  if (!match) return null;
  const prefix = match[1];
  for (const type of schema2.getAllEntityTypes()) {
    if (type.idPrefix === prefix) {
      return type.type;
    }
  }
  return null;
}

// src/entity-core/validator.ts
var EntityValidator = class {
  constructor(schema2) {
    this.schema = schema2;
  }
  /** Returns validation errors, or [] if valid. */
  validate(entity) {
    const errors = [];
    const validStatuses = this.schema.getStatuses(entity.type);
    if (!validStatuses.includes(entity.status)) {
      errors.push({
        field: "status",
        code: "invalid_status",
        message: `Invalid status "${entity.status}" for type ${entity.type}. Valid: ${validStatuses.join(", ")}`
      });
    }
    if (!entity.title || entity.title.trim() === "") {
      errors.push({
        field: "title",
        code: "required_field",
        message: "Title is required"
      });
    }
    const typeFields = this.schema.getFields(entity.type);
    for (const field of typeFields) {
      if (field.required) {
        const value = entity.fields[field.name];
        if (value === void 0 || value === null || value === "") {
          errors.push({
            field: field.name,
            code: "required_field",
            message: `Required field "${field.name}" is missing`
          });
        }
      }
    }
    for (const [fieldName, value] of Object.entries(entity.relationships)) {
      if (value === void 0 || value === null) continue;
      const rel = this.schema.getRelationshipForField(fieldName);
      if (!rel) continue;
      const applicablePairs = rel.pairs.filter((p) => {
        if (p.forward === fieldName) {
          return p.from === entity.type || p.from === "*";
        }
        if (p.reverse === fieldName) {
          return p.to === entity.type || p.to === "*";
        }
        return false;
      });
      if (applicablePairs.length === 0) continue;
      const isForward = applicablePairs[0].forward === fieldName;
      const cardinality = this.schema.getCardinalityForField(fieldName);
      if (cardinality === "one" && Array.isArray(value)) {
        errors.push({
          field: fieldName,
          code: "cardinality_violation",
          message: `Field "${fieldName}" expects a single value, got array`
        });
      } else if (cardinality === "many" && !Array.isArray(value)) {
        errors.push({
          field: fieldName,
          code: "cardinality_violation",
          message: `Field "${fieldName}" expects an array, got single value`
        });
      }
      const validTargetTypes = /* @__PURE__ */ new Set();
      for (const pair of applicablePairs) {
        const targetType = isForward ? pair.to : pair.from;
        if (targetType === "*") {
          validTargetTypes.add("*");
          break;
        }
        validTargetTypes.add(targetType);
      }
      if (!validTargetTypes.has("*")) {
        const targets = Array.isArray(value) ? value : [value];
        for (const targetId of targets) {
          const targetType = getEntityTypeFromId(targetId, this.schema);
          if (targetType && !validTargetTypes.has(targetType)) {
            errors.push({
              field: fieldName,
              code: "invalid_relationship_target",
              message: `Field "${fieldName}" points to ${targetId} (type: ${targetType}), but expected one of: ${Array.from(validTargetTypes).join(", ")}`
            });
          }
        }
      }
    }
    return errors;
  }
  /**
   * Validate including cross-entity reference existence (relationship targets
   * must resolve to an entity in the provided set).
   */
  validateWithReferences(entity, known) {
    const errors = this.validate(entity);
    for (const [field, value] of Object.entries(entity.relationships)) {
      const targets = Array.isArray(value) ? value : [value];
      for (const targetId of targets) {
        if (typeof targetId === "string" && !known.has(targetId)) {
          errors.push({
            field,
            code: "dangling_reference",
            message: `Relationship "${field}" references non-existent entity: ${targetId}`
          });
        }
      }
    }
    return errors;
  }
};

// src/entity-core/path-resolver.ts
function sanitizeTitleForFilename(title, mode = "snake") {
  if (mode === "preserve") {
    return title.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  }
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function buildEntityFilename(id, title, pattern, mode = "snake") {
  return pattern.replace("{id}", id).replace("{title}", sanitizeTitleForFilename(title, mode)) + ".md";
}
function joinPath(...segments) {
  return segments.filter((s) => s !== "" && s != null).join("/");
}
var PathResolver = class {
  constructor(schema2, config2) {
    this.schema = schema2;
    this.config = config2;
  }
  getTypeFolderPath(type) {
    const typeDef = this.schema.getEntityType(type);
    if (!typeDef) {
      throw new Error(`Unknown entity type: ${type}`);
    }
    return joinPath(this.config.entitiesFolder, typeDef.folder);
  }
  getEntityPath(id, title) {
    const type = this.getTypeFromId(id);
    const folder = this.getTypeFolderPath(type);
    const filename = this.generateFilename(id, title);
    return `${folder}/${filename}`;
  }
  generateFilename(id, title) {
    return buildEntityFilename(
      id,
      title,
      this.schema.getFilenamePattern(),
      this.schema.getFilenameCase()
    );
  }
  getArchiveFolderPath(id) {
    const type = this.getTypeFromId(id);
    const typeDef = this.schema.getEntityType(type);
    if (!typeDef) {
      throw new Error(`Unknown entity type: ${type}`);
    }
    return joinPath(this.config.archiveFolder, typeDef.folder);
  }
  getArchivePath(id, title) {
    const folder = this.getArchiveFolderPath(id);
    const filename = this.generateFilename(id, title);
    return `${folder}/${filename}`;
  }
  getCanvasFolderPath() {
    return this.config.canvasFolder;
  }
  extractIdFromPath(filePath) {
    const match = filePath.match(/([A-Z]+-\d+)/);
    return match ? match[1] : null;
  }
  getTypeFromPath(filePath) {
    const id = this.extractIdFromPath(filePath);
    if (!id) return null;
    return this.getTypeFromId(id);
  }
  isArchivePath(filePath) {
    return filePath.startsWith(`${this.config.archiveFolder}/`);
  }
  isEntityPath(filePath) {
    if (this.isArchivePath(filePath)) return false;
    if (!this.config.entitiesFolder) return true;
    return filePath.startsWith(`${this.config.entitiesFolder}/`);
  }
  getTypeFromId(id) {
    const type = getEntityTypeFromId(id, this.schema);
    if (!type) {
      throw new Error(`Cannot determine type from id: ${id}`);
    }
    return type;
  }
  toVaultPath(absolutePath) {
    const prefix = this.config.vaultPath + "/";
    if (absolutePath.startsWith(prefix)) {
      return absolutePath.substring(prefix.length);
    }
    return absolutePath.startsWith("/") ? absolutePath.substring(1) : absolutePath;
  }
  toAbsolutePath(vaultPath) {
    const cleaned = vaultPath.startsWith("/") ? vaultPath.substring(1) : vaultPath;
    return `${this.config.vaultPath}/${cleaned}`;
  }
};

// src/entity-core/project-index.ts
init_default_schema();
var ProjectIndex = class {
  constructor(reverseRelationMap) {
    this.primary = /* @__PURE__ */ new Map();
    this._version = 0;
    this.lastRebuild = 0;
    this.reservedIds = /* @__PURE__ */ new Set();
    this.secondary = this.createEmptySecondaryIndexes();
    this.relationships = this.createEmptyRelationshipGraph();
    this.files = this.createEmptyFileMappings();
    this.reverseRelMap = reverseRelationMap ?? buildReverseRelationMap(DEFAULT_SCHEMA);
  }
  /**
   * Replace the field→inverse map (e.g. after loading a custom schema.json), so the
   * reverse relationship graph stays consistent with the active schema. Call before
   * (re)building the index.
   */
  setReverseRelationMap(map) {
    this.reverseRelMap = map;
  }
  createEmptySecondaryIndexes() {
    return {
      by_type: /* @__PURE__ */ new Map(),
      by_status: /* @__PURE__ */ new Map(),
      by_workstream: /* @__PURE__ */ new Map(),
      by_parent: /* @__PURE__ */ new Map(),
      by_canvas: /* @__PURE__ */ new Map(),
      archived: /* @__PURE__ */ new Set(),
      in_progress: /* @__PURE__ */ new Set(),
      by_priority: /* @__PURE__ */ new Map()
    };
  }
  createEmptyRelationshipGraph() {
    return { forward: /* @__PURE__ */ new Map(), reverse: /* @__PURE__ */ new Map() };
  }
  createEmptyFileMappings() {
    return {
      path_to_id: /* @__PURE__ */ new Map(),
      id_to_path: /* @__PURE__ */ new Map(),
      file_mtimes: /* @__PURE__ */ new Map()
    };
  }
  // Primary Index Operations
  get(id) {
    return this.primary.get(id);
  }
  has(id) {
    return this.primary.has(id);
  }
  getAllIds() {
    return Array.from(this.primary.keys());
  }
  getAll() {
    return Array.from(this.primary.values());
  }
  get size() {
    return this.primary.size;
  }
  getVersion() {
    return this._version;
  }
  set(metadata) {
    const existing = this.primary.get(metadata.id);
    if (existing) this.removeFromSecondaryIndexes(existing);
    this.primary.set(metadata.id, metadata);
    this.addToSecondaryIndexes(metadata);
    this.files.path_to_id.set(metadata.vault_path, metadata.id);
    this.files.id_to_path.set(metadata.id, metadata.vault_path);
    this.files.file_mtimes.set(metadata.vault_path, metadata.file_mtime);
    this._version++;
  }
  delete(id) {
    const metadata = this.primary.get(id);
    if (!metadata) return false;
    this.primary.delete(id);
    this.removeFromSecondaryIndexes(metadata);
    this.files.path_to_id.delete(metadata.vault_path);
    this.files.id_to_path.delete(id);
    this.files.file_mtimes.delete(metadata.vault_path);
    this.removeFromRelationships(id);
    this._version++;
    return true;
  }
  /** Remove a stale path mapping without deleting the entity (for duplicate cleanup) */
  removePathMapping(path2) {
    this.files.path_to_id.delete(path2);
    this.files.file_mtimes.delete(path2);
    this._version++;
  }
  clear() {
    this.primary.clear();
    this.secondary = this.createEmptySecondaryIndexes();
    this.relationships = this.createEmptyRelationshipGraph();
    this.files = this.createEmptyFileMappings();
    this._version++;
    this.lastRebuild = Date.now();
  }
  // Helper to add to set-based index
  addToSetIndex(map, key, id) {
    let set = map.get(key);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      map.set(key, set);
    }
    set.add(id);
  }
  // Helper to remove from set-based index
  removeFromSetIndex(map, key, id) {
    const set = map.get(key);
    if (set) {
      set.delete(id);
      if (set.size === 0) map.delete(key);
    }
  }
  addToSecondaryIndexes(metadata) {
    this.addToSetIndex(this.secondary.by_type, metadata.type, metadata.id);
    this.addToSetIndex(this.secondary.by_status, metadata.status, metadata.id);
    this.addToSetIndex(this.secondary.by_workstream, metadata.workstream, metadata.id);
    if (metadata.parent_id) this.addToSetIndex(this.secondary.by_parent, metadata.parent_id, metadata.id);
    this.addToSetIndex(this.secondary.by_canvas, metadata.canvas_source, metadata.id);
    if (metadata.archived) this.secondary.archived.add(metadata.id);
    if (metadata.in_progress) this.secondary.in_progress.add(metadata.id);
    if (metadata.priority) this.addToSetIndex(this.secondary.by_priority, metadata.priority, metadata.id);
  }
  removeFromSecondaryIndexes(metadata) {
    this.removeFromSetIndex(this.secondary.by_type, metadata.type, metadata.id);
    this.removeFromSetIndex(this.secondary.by_status, metadata.status, metadata.id);
    this.removeFromSetIndex(this.secondary.by_workstream, metadata.workstream, metadata.id);
    if (metadata.parent_id) this.removeFromSetIndex(this.secondary.by_parent, metadata.parent_id, metadata.id);
    this.removeFromSetIndex(this.secondary.by_canvas, metadata.canvas_source, metadata.id);
    this.secondary.archived.delete(metadata.id);
    this.secondary.in_progress.delete(metadata.id);
    if (metadata.priority) this.removeFromSetIndex(this.secondary.by_priority, metadata.priority, metadata.id);
  }
  removeFromRelationships(id) {
    const forwardRels = this.relationships.forward.get(id);
    if (forwardRels) {
      for (const [relType, targets] of forwardRels) {
        for (const target of targets) {
          const reverseRels2 = this.relationships.reverse.get(target);
          if (reverseRels2) {
            const reverseType = this.getReverseRelationType(relType);
            reverseRels2.get(reverseType)?.delete(id);
          }
        }
      }
      this.relationships.forward.delete(id);
    }
    const reverseRels = this.relationships.reverse.get(id);
    if (reverseRels) {
      for (const [relType, sources] of reverseRels) {
        for (const source of sources) {
          const forwardRels2 = this.relationships.forward.get(source);
          if (forwardRels2) {
            const forwardType = this.getReverseRelationType(relType);
            forwardRels2.get(forwardType)?.delete(id);
          }
        }
      }
      this.relationships.reverse.delete(id);
    }
  }
  /**
   * Remove only forward relationships for an entity (relationships where this entity is the source).
   * This is used when re-indexing an entity's relationships without losing relationships
   * where this entity is the target (e.g., parent_of relationships from children).
   *
   * @param excludeTypes - Relationship types to exclude from removal. Use this to preserve
   *                       relationships that are "owned" by other entities (e.g., parent_of
   *                       is owned by children, not parents).
   */
  removeForwardRelationships(id, excludeTypes) {
    const forwardRels = this.relationships.forward.get(id);
    if (forwardRels) {
      const excludeSet = new Set(excludeTypes || []);
      for (const [relType, targets] of forwardRels) {
        if (excludeSet.has(relType)) continue;
        for (const target of targets) {
          const reverseRels = this.relationships.reverse.get(target);
          if (reverseRels) {
            const reverseType = this.getReverseRelationType(relType);
            reverseRels.get(reverseType)?.delete(id);
          }
        }
        forwardRels.delete(relType);
      }
      if (forwardRels.size === 0) {
        this.relationships.forward.delete(id);
      }
    }
  }
  getReverseRelationType(type) {
    return this.reverseRelMap[type] || type;
  }
  // Secondary Index Query Methods
  getByType(type) {
    const ids = this.secondary.by_type.get(type);
    return ids ? Array.from(ids).map((id) => this.primary.get(id)).filter(Boolean) : [];
  }
  getByStatus(status) {
    const ids = this.secondary.by_status.get(status);
    return ids ? Array.from(ids).map((id) => this.primary.get(id)).filter(Boolean) : [];
  }
  getByWorkstream(workstream) {
    const ids = this.secondary.by_workstream.get(workstream);
    return ids ? Array.from(ids).map((id) => this.primary.get(id)).filter(Boolean) : [];
  }
  getByParent(parentId) {
    const ids = this.secondary.by_parent.get(parentId);
    return ids ? Array.from(ids).map((id) => this.primary.get(id)).filter(Boolean) : [];
  }
  getByCanvas(canvasPath) {
    const ids = this.secondary.by_canvas.get(canvasPath);
    return ids ? Array.from(ids).map((id) => this.primary.get(id)).filter(Boolean) : [];
  }
  getArchived() {
    return Array.from(this.secondary.archived).map((id) => this.primary.get(id)).filter(Boolean);
  }
  getInProgress() {
    return Array.from(this.secondary.in_progress).map((id) => this.primary.get(id)).filter(Boolean);
  }
  // Relationship Operations
  addRelationship(from, type, to) {
    let forwardRels = this.relationships.forward.get(from);
    if (!forwardRels) {
      forwardRels = /* @__PURE__ */ new Map();
      this.relationships.forward.set(from, forwardRels);
    }
    let targets = forwardRels.get(type);
    if (!targets) {
      targets = /* @__PURE__ */ new Set();
      forwardRels.set(type, targets);
    }
    targets.add(to);
    const reverseType = this.getReverseRelationType(type);
    let reverseRels = this.relationships.reverse.get(to);
    if (!reverseRels) {
      reverseRels = /* @__PURE__ */ new Map();
      this.relationships.reverse.set(to, reverseRels);
    }
    let sources = reverseRels.get(reverseType);
    if (!sources) {
      sources = /* @__PURE__ */ new Set();
      reverseRels.set(reverseType, sources);
    }
    sources.add(from);
  }
  getRelated(id, type) {
    const rels = this.relationships.forward.get(id);
    return rels?.get(type) ? Array.from(rels.get(type)) : [];
  }
  getRelatedReverse(id, type) {
    const rels = this.relationships.reverse.get(id);
    return rels?.get(type) ? Array.from(rels.get(type)) : [];
  }
  // File Mapping Operations
  getIdByPath(path2) {
    return this.files.path_to_id.get(path2);
  }
  getPathById(id) {
    return this.files.id_to_path.get(id) ?? null;
  }
  getFileMtime(path2) {
    return this.files.file_mtimes.get(path2);
  }
  getAllPaths() {
    return Array.from(this.files.path_to_id.keys());
  }
  // Index Maintenance
  findDuplicateIds() {
    const idToPaths = /* @__PURE__ */ new Map();
    for (const [path2, id] of this.files.path_to_id) {
      if (!idToPaths.has(id)) idToPaths.set(id, []);
      idToPaths.get(id).push(path2);
    }
    const duplicates = [];
    for (const [id, paths] of idToPaths) {
      if (paths.length > 1) duplicates.push({ id, paths });
    }
    return duplicates;
  }
  buildAdjacency(relationshipName, direction = "forward") {
    const adjacency = /* @__PURE__ */ new Map();
    const graph = direction === "forward" ? this.relationships.forward : this.relationships.reverse;
    for (const [id, rels] of graph) {
      const targets = rels.get(relationshipName);
      if (targets && targets.size > 0) {
        adjacency.set(id, Array.from(targets));
      }
    }
    return adjacency;
  }
  reserveId(id) {
    this.reservedIds.add(id);
  }
  isReserved(id) {
    return this.reservedIds.has(id);
  }
};

// mcp.ts
import { MsrlEngine } from "@ostanlabs/md-retriever";
var VAULT_PATH = process.env.VAULT_PATH;
if (!VAULT_PATH) {
  console.error("ERROR: VAULT_PATH environment variable is required");
  console.error("Usage: VAULT_PATH=/path/to/vault npm run dev:mcp");
  process.exit(1);
}
var adapter = new NodeFsAdapter(VAULT_PATH);
var schema = new SchemaRegistry(DEFAULT_SCHEMA);
var parser = new EntityParser(schema);
var serializer = new EntitySerializer(schema);
var validator = new EntityValidator(schema);
var VALIDATION_ALLOWLIST = buildValidationAllowList(schema.getSchema());
var activeSchema = DEFAULT_SCHEMA;
var schemaSource = "default";
var schemaErrors = [];
function applySchema(s) {
  schema = new SchemaRegistry(s);
  parser = new EntityParser(schema);
  serializer = new EntitySerializer(schema);
  validator = new EntityValidator(schema);
  VALIDATION_ALLOWLIST = buildValidationAllowList(s);
  index.setReverseRelationMap(buildReverseRelationMap(s));
  activeSchema = s;
}
function getRelationshipFieldNamesForType(type) {
  const names = /* @__PURE__ */ new Set();
  for (const rel of schema.getRelationshipsForType(type)) {
    for (const pair of rel.pairs) {
      if (pair.from === type || pair.from === "*") names.add(pair.forward);
      if (pair.to === type || pair.to === "*") names.add(pair.reverse);
    }
  }
  for (const f of schema.getFields(type)) names.delete(f.name);
  return names;
}
function splitFlatRelationshipKeys(type, input) {
  const relNames = getRelationshipFieldNamesForType(type);
  const relationships = {};
  const rest = {};
  for (const [key, value] of Object.entries(input)) {
    if (relNames.has(key)) relationships[key] = value;
    else rest[key] = value;
  }
  return { relationships, rest };
}
function extractBody(content) {
  const m = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return m ? m[1] : "";
}
function normalizeBody(body) {
  if (body === "") return "";
  return `
${body.replace(/^\n+/, "").replace(/\n*$/, "")}
`;
}
function isClearValue(v) {
  return v === null || Array.isArray(v) && v.length === 0;
}
function explicitUpdatedAtMs(content) {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^updated_at:\s*["']?([^"'\n]+?)["']?\s*$/m);
  if (!m) return null;
  const t = Date.parse(m[1]);
  return Number.isFinite(t) ? t : null;
}
var config = {
  vaultPath: VAULT_PATH,
  entitiesFolder: "",
  // Scan top-level type folders (tasks/, stories/, etc.)
  archiveFolder: "archive",
  canvasFolder: "projects"
};
async function listFilesRecursive(folder) {
  const out = [];
  const walk = async (dir) => {
    for (const entry of await adapter.readDir(dir)) {
      if (entry.isDirectory) await walk(entry.path);
      else out.push(entry.path);
    }
  };
  await walk(folder);
  return out;
}
var pathResolver = new PathResolver(schema, config);
var index = new ProjectIndex();
function buildMetadata(entity, filePath, mtimeMs) {
  const parentRel = entity.relationships?.parent;
  const parent_id = Array.isArray(parentRel) ? parentRel[0] : parentRel;
  const childrenRel = entity.relationships?.children;
  const children_count = Array.isArray(childrenRel) ? childrenRel.length : childrenRel ? 1 : 0;
  const in_progress = entity.status === "In Progress" || entity.status === "In-progress";
  return {
    id: entity.id,
    type: entity.type,
    title: entity.title,
    workstream: entity.workstream || "",
    status: entity.status,
    archived: entity.archived,
    in_progress,
    parent_id,
    children_count,
    priority: entity.fields?.priority,
    canvas_source: "",
    // Not applicable for MCP
    vault_path: filePath,
    file_mtime: mtimeMs,
    created_at: entity.created_at,
    updated_at: entity.updated_at
  };
}
async function scanIndex() {
  index.clear();
  const entityTypes = ["task", "story", "milestone", "decision", "document", "feature"];
  const folders = [config.archiveFolder];
  for (const type of entityTypes) {
    let typeFolderName;
    if (type === "decision") {
      typeFolderName = "decisions";
    } else if (type === "story") {
      typeFolderName = "stories";
    } else {
      typeFolderName = `${type}s`;
    }
    folders.push(typeFolderName);
  }
  for (const folder of folders) {
    try {
      const files = folder === config.archiveFolder ? await listFilesRecursive(folder) : await adapter.listFiles(folder);
      for (const filePath of files) {
        if (!filePath.endsWith(".md")) continue;
        try {
          const content = await adapter.readFile(filePath);
          const entity = parser.parse(content, filePath);
          const stat2 = await adapter.stat(filePath);
          const metadata = buildMetadata(entity, filePath, stat2.mtimeMs);
          index.set(metadata);
          if (entity.relationships) {
            for (const [relType, targets] of Object.entries(entity.relationships)) {
              const targetIds = Array.isArray(targets) ? targets : [targets];
              for (const targetId of targetIds) {
                index.addRelationship(entity.id, relType, targetId);
              }
            }
          }
        } catch (err) {
          if (process.env.DEBUG) {
            console.error(`Failed to parse ${filePath}:`, err);
          }
        }
      }
    } catch (err) {
      if (process.env.DEBUG) {
        console.error(`Folder not found: ${folder}`, err);
      }
    }
  }
}
var msrlEngine = null;
async function getMsrlEngine() {
  if (!msrlEngine) {
    console.error("Initializing MSRL engine...");
    msrlEngine = await MsrlEngine.create({
      vaultRoot: VAULT_PATH,
      logLevel: "info"
    });
    console.error("MSRL engine initialized");
  }
  return msrlEngine;
}
var server = new Server(
  {
    name: "obsidian-unified",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);
function featurePhaseEnumValues() {
  const phaseField = schema.getFields("feature").find((f) => f.name === "phase");
  if (phaseField?.values && phaseField.values.length > 0) {
    return phaseField.values;
  }
  return ["MVP", "0", "1", "2", "3", "4", "5"];
}
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_entity",
      description: "Create a new entity (milestone, story, task, decision, document, or feature)",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["milestone", "story", "task", "decision", "document", "feature"],
            description: "The type of entity to create"
          },
          title: {
            type: "string",
            description: "The title of the entity"
          },
          properties: {
            type: "object",
            description: "Additional entity properties (status, workstream, relationships, etc.)"
          }
        },
        required: ["type", "title"]
      }
    },
    {
      name: "list_entities",
      description: "List all entities or filter by type",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["milestone", "story", "task", "decision", "document", "feature"],
            description: "Optional: filter by entity type"
          }
        }
      }
    },
    {
      name: "get_entity",
      description: "Get an entity by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Entity ID (e.g., M-001, S-035, T-127)"
          }
        },
        required: ["id"]
      }
    },
    {
      name: "update_entity",
      description: "Update an existing entity",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Entity ID to update"
          },
          updates: {
            type: "object",
            description: 'Fields to update (title, status, workstream, relationships, etc.). A string "body" key replaces the markdown body below the frontmatter ("" clears it). Setting a passthrough-only key (a field not valid for this type) to null or [] deletes it from the file.'
          }
        },
        required: ["id", "updates"]
      }
    },
    {
      name: "get_schema",
      description: "Get the active schema (from schema.json or the codified default), its source, and any validation errors.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "set_schema",
      description: `Configure the vault's relationships/schema. Writes <vault>/schema.json (the single source of truth for both the MCP validator and the plugin positioning) and hot-reloads. Provide a full "schema" object, or a "relationships" array to merge into the current schema. Invalid schemas are rejected and not saved.`,
      inputSchema: {
        type: "object",
        properties: {
          schema: { type: "object", description: "Full Schema object (entityTypes, relationships, settings, workstreams)." },
          relationships: { type: "array", description: "Relationships array to merge into the current schema (relationships-only edit)." }
        }
      }
    },
    {
      name: "get_schema_designer",
      description: "Return a self-contained HTML relationship designer, pre-populated with this vault's schema. Toggle relationships/pairs, then copy the result and apply it with set_schema.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "search_entities",
      description: `Search, list, or navigate structured project entities.

USE FOR: Finding entities by text, listing by type/status, traversing relationships.

MODES:
1. SEARCH: query="text" - Full-text search
2. LIST: filters={type:["task"], status:["Blocked"]} - List matching entities
3. NAVIGATE: from_id="M-001", direction="down" - Traverse hierarchy

EXAMPLES:
- "Find blocked tasks" \u2192 filters: {type: ["task"], status: ["Blocked"]}
- "List all tasks in api-server" \u2192 filters: {type: ["task"], workstream: ["api-server"]}`,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (search mode)" },
          from_id: { type: "string", description: "Starting entity ID (navigation mode)" },
          direction: { type: "string", enum: ["up", "down", "siblings", "dependencies"], description: "Navigation direction" },
          depth: { type: "number", description: "Traversal depth (default: 1)" },
          filters: {
            type: "object",
            properties: {
              type: { type: "array", items: { type: "string", enum: ["milestone", "story", "task", "decision", "document", "feature"] } },
              status: { type: "array", items: { type: "string" } },
              workstream: { type: "array", items: { type: "string" } },
              archived: { type: "boolean", description: "Include archived (default: false)" }
            }
          },
          limit: { type: "number", description: "Max results (default: 20)" }
        }
      }
    },
    {
      name: "get_project_overview",
      description: `Get high-level project status summary across workstreams.

INCLUDES: Entity counts by type and status, workstream breakdowns.

EXAMPLES:
- "What's the overall project status?"
- "Show me the engineering workstream progress"
- "How many tasks are blocked?"`,
      inputSchema: {
        type: "object",
        properties: {
          include_completed: { type: "boolean", description: "Include completed items" },
          include_archived: { type: "boolean", description: "Include archived items" },
          workstream: { type: "string", description: "Filter by specific workstream" }
        }
      }
    },
    {
      name: "reconcile_relationships",
      description: `Fix inconsistent bidirectional relationships across all entities.

USE FOR: Fixing broken relationships, ensuring consistency after manual edits.

SYNCS: every bidirectional pair in the active schema (parent\u2194children,
depends_on\u2194blocks, implements\u2194implemented_by, documents\u2194documented_by,
affects\u2194decided_by, supersedes\u2194superseded_by, previous_version\u2194next_version):
missing inverse edges are filled in BOTH directions, and entries pointing at
entities that no longer exist are pruned.

STALENESS RULE (forward side is authoritative when newer): a reverse-only edge
(e.g. a document's decided_by with no matching affects on the decision) fills
the missing FORWARD only when the reverse-side file's frontmatter updated_at is
newer or equal \u2014 or when either timestamp is absent (reverse-only-authored
vaults keep working). If the forward-side file is STRICTLY newer, its missing
edge is treated as an explicit removal and the stale reverse entry is pruned
instead, so editing a forward list then reconciling never resurrects removed
links.

EXAMPLES:
- "Check for broken relationships" \u2192 dry_run: true
- "Fix all relationship inconsistencies" \u2192 dry_run: false`,
      inputSchema: {
        type: "object",
        properties: {
          dry_run: { type: "boolean", description: "Preview changes without executing", default: false }
        }
      }
    },
    {
      name: "rebuild_index",
      description: `Rebuild the in-memory entity index from scratch by re-scanning all vault files.

USE FOR: Fixing index inconsistencies, recovering from corrupted state.

RETURNS: entities_before, entities_after, duration_ms`,
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "read_docs",
      description: `Read workspace documents (README, guides, specs).

NOT FOR: Reading entity files (use get_entity or search_entities instead).

EXAMPLES:
- "Read the README" \u2192 path: "README.md"
- "Show the API spec" \u2192 path: "docs/api-spec.md"`,
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Document path relative to vault root" }
        },
        required: ["path"]
      }
    },
    {
      name: "update_doc",
      description: `Update workspace documents.

NOT FOR: Updating entities (use update_entity instead).

EXAMPLES:
- Update README \u2192 path: "README.md", content: "..."`,
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Document path" },
          content: { type: "string", description: "New content" }
        },
        required: ["path", "content"]
      }
    },
    {
      name: "list_files",
      description: `List files in the vault or a specific directory.

EXAMPLES:
- "List all markdown files" \u2192 pattern: "*.md"
- "List files in docs/" \u2192 directory: "docs"`,
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory to list (default: vault root)" },
          pattern: { type: "string", description: "File pattern (e.g., *.md)" },
          recursive: { type: "boolean", description: "Search recursively", default: false }
        }
      }
    },
    {
      name: "analyze_project_state",
      description: `Deep analysis of project state identifying blockers and suggesting actions.

USE FOR: Finding blockers, getting actionable recommendations.

EXAMPLES:
- "What's blocking progress?"
- "What actions should I take?"`,
      inputSchema: {
        type: "object",
        properties: {
          workstream: { type: "string", description: "Filter by workstream" },
          focus: { type: "string", enum: ["blockers", "actions", "both"], description: "Analysis focus" }
        }
      }
    },
    {
      name: "get_feature_coverage",
      description: `Analyze feature implementation and documentation coverage.

USE FOR: Coverage reports, gap analysis, finding undocumented features.

EXAMPLES:
- "How many features have documentation?"
- "What features are missing implementation?"`,
      inputSchema: {
        type: "object",
        properties: {
          phase: { type: "string", enum: featurePhaseEnumValues(), description: "Filter by phase" },
          tier: { type: "string", enum: ["OSS", "Premium"], description: "Filter by tier" }
        }
      }
    },
    {
      name: "validate_project",
      description: `Validate project entities against relationship rules.

USE FOR: Finding missing relationships, ensuring entities are properly connected.

Returns hard "violations" (invalid relationships/targets, orphans) plus soft
"advisories" \u2014 fan-out guidelines that are NOT enforced on writes: a document
should document \u22642 features, a decision should affect \u22642 documents, a feature
should have \u22643 implementers, a feature should be documented by \u22642 documents.
Each advisory carries a concrete reorganization
suggestion; reconcile them gradually rather than treating them as errors.

EXAMPLES:
- "Are there any orphaned documents?"
- "Validate backend workstream"`,
      inputSchema: {
        type: "object",
        properties: {
          workstream: { type: "string", description: "Filter by workstream" },
          entity_types: {
            type: "array",
            items: { type: "string", enum: ["milestone", "story", "task", "decision", "document", "feature"] },
            description: "Filter to specific entity types"
          }
        }
      }
    },
    {
      name: "cleanup_completed",
      description: `Archive completed stories/tasks under completed milestones.

USE FOR: Archiving completed work, cleaning up the vault.

FLOW:
1. Find completed milestones
2. Archive their completed stories/tasks
3. Return summary

EXAMPLES:
- "Clean up all completed milestones" \u2192 {}
- "Preview cleanup" \u2192 dry_run: true`,
      inputSchema: {
        type: "object",
        properties: {
          milestone_id: { type: "string", description: "Optional milestone ID to clean up" },
          dry_run: { type: "boolean", description: "Preview without making changes", default: false }
        }
      }
    },
    {
      name: "manage_documents",
      description: `Manage documents and decisions: history, versioning, freshness checks.

ACTIONS:
- get_decision_history: List decisions
- check_freshness: Check if document is stale

EXAMPLES:
- "What decisions have we made about auth?" \u2192 action: "get_decision_history", topic: "auth"`,
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["get_decision_history", "check_freshness"],
            description: "The action to perform"
          },
          topic: { type: "string", description: "Filter by topic (for get_decision_history)" },
          workstream: { type: "string", description: "Filter by workstream (for get_decision_history)" },
          document_id: { type: "string", description: "Document ID (for check_freshness)" }
        },
        required: ["action"]
      }
    },
    {
      name: "search_docs",
      description: `Semantic search across all documents in the vault using hybrid vector + keyword search.

USE FOR: Finding relevant documents by meaning, not just keywords.
NOT FOR: Listing all files (use list_files), getting specific entity (use get_entity).

FEATURES:
- Hybrid search: combines semantic (vector) and keyword (BM25) matching
- Relevance-weighted excerpt budgets: higher-scoring results get more context
- Score threshold filtering: drop low-relevance results
- Budget feedback: know when excerpts were truncated to adjust queries

BUDGET BEHAVIOR:
- Total budget (default 8000 chars) is distributed across results based on relevance scores
- Higher-scoring results get proportionally more characters
- If a result's content is smaller than its allocation, surplus is redistributed
- budget_info in response tells you if content was truncated

EXAMPLES:
- "Search for authentication implementation details"
- "Find documents about Kubernetes deployment" with min_score: 0.5 to filter noise
- Large budget search: excerpt_budget: { total_chars: 15000 }`,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language search query"
          },
          top_k: {
            type: "number",
            description: "Maximum number of results to return (default: 10, max: 100)"
          },
          min_score: {
            type: "number",
            description: "Minimum relevance score threshold (default: 0.2, floor: 0.2). Results below this are dropped."
          },
          excerpt_budget: {
            type: "object",
            description: "Configure how character budget is allocated across results",
            properties: {
              total_chars: {
                type: "number",
                description: "Total character budget across all results (default: 8000)"
              },
              min_per_result: {
                type: "number",
                description: "Minimum characters per result (default: 200)"
              },
              max_per_result: {
                type: "number",
                description: "Maximum characters per result (default: 3000)"
              }
            }
          },
          max_excerpt_chars: {
            type: "number",
            description: "[DEPRECATED] Use excerpt_budget.max_per_result instead"
          },
          filters: {
            type: "object",
            properties: {
              doc_uri_prefix: {
                type: "string",
                description: 'Filter to documents starting with this path prefix (e.g., "stories/")'
              },
              doc_uris: {
                type: "array",
                items: { type: "string" },
                description: "Filter to specific document URIs"
              },
              heading_path_contains: {
                type: "string",
                description: "Filter to sections containing this heading path segment"
              }
            }
          },
          include_scores: {
            type: "boolean",
            description: "Include detailed scores (vector_score, bm25_score) in results"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "msrl_status",
      description: `Get the status of the MSRL semantic search index.

USE FOR: Checking if the index is ready, viewing index statistics.
NOT FOR: Searching (use search_docs).

RETURNS:
- state: 'ready', 'building', or 'error'
- snapshot_id: Current snapshot identifier
- stats: Document, node, leaf, and shard counts
- watcher: File watcher status`,
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      }
    },
    {
      name: "entities",
      description: `Unified bulk operations tool. Fetch multiple entities or perform batch operations.

ACTIONS:
- get: Fetch multiple entities by IDs (more efficient than multiple entity calls)
- batch: Perform multiple create/update/archive operations in a single call

USE FOR:
- Fetching 2+ entities at once
- Batch status updates across multiple items
- Creating related entities together
- Any operation touching multiple entities

EXAMPLES:
- { action: "get", ids: ["M-001", "S-001", "T-001"] }
- { action: "batch", ops: [...], options: { dry_run: true } }`,
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["get", "batch"],
            description: "Action to perform"
          },
          // For 'get' action
          ids: {
            type: "array",
            items: { type: "string" },
            description: "Entity IDs to fetch (for get action)"
          },
          fields: {
            type: "array",
            items: { type: "string" },
            description: "Fields to include in response (default: all)"
          },
          // For 'batch' action
          ops: {
            type: "array",
            items: {
              type: "object",
              properties: {
                client_id: { type: "string", description: "Client-provided ID for idempotency" },
                op: { type: "string", enum: ["create", "update", "archive"], description: "Operation type" },
                type: { type: "string", enum: ["milestone", "story", "task", "decision", "document", "feature"], description: "Entity type (for create)" },
                id: { type: "string", description: "Entity ID (for update/archive)" },
                payload: { type: "object", description: "Operation payload (title, workstream, relationships, etc.)" }
              },
              required: ["client_id", "op", "payload"]
            },
            description: "Operations to perform (for batch action)"
          },
          options: {
            type: "object",
            properties: {
              atomic: { type: "boolean", description: "Rollback all on any failure (default: false)" },
              dry_run: { type: "boolean", description: "Preview changes without executing (default: false)" },
              include_entities: { type: "boolean", description: "Include full entity data in results (default: false)" }
            },
            description: "Options for batch action"
          }
        },
        required: ["action"]
      }
    }
  ]
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "create_entity": {
        const { type, title, properties = {} } = args;
        await scanIndex();
        const allocator = new IDAllocator(schema, index);
        const id = await allocator.allocate(type);
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const typeDef = schema.getEntityType(type);
        const { workstream, status, relationships, ...customFields } = properties;
        const split = splitFlatRelationshipKeys(type, customFields);
        const mergedRelationships = {
          ...split.relationships,
          ...relationships ?? {}
        };
        const sanitizedTitle = title.replace(/:/g, " -").replace(/\s{2,}/g, " ").trim();
        const sanitizedCustomFields = {};
        for (const [key, value] of Object.entries(split.rest)) {
          if (typeof value === "string") {
            sanitizedCustomFields[key] = value.replace(/:/g, " -").replace(/\s{2,}/g, " ").trim();
          } else {
            sanitizedCustomFields[key] = value;
          }
        }
        const entity = {
          id,
          type,
          title: sanitizedTitle,
          status: status ?? typeDef?.statuses[0] ?? "Not Started",
          workstream: workstream ?? "engineering",
          created_at: now,
          updated_at: now,
          archived: false,
          vault_path: "",
          // Will be set after write
          canvas_source: "",
          fields: sanitizedCustomFields,
          // Sanitized custom fields
          relationships: mergedRelationships
        };
        const errors = validator.validate(entity);
        if (errors.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: `Validation failed:
${errors.map((e) => `- ${e.field}: ${e.message}`).join("\n")}`
              }
            ],
            isError: true
          };
        }
        const content = serializer.serialize(entity);
        const filename = pathResolver.generateFilename(id, title);
        const folder = pathResolver.getTypeFolderPath(type);
        const filePath = `${folder}/${filename}`;
        await adapter.writeFile(filePath, content);
        return {
          content: [
            {
              type: "text",
              text: `Created ${type} ${id}: ${title}
Path: ${filePath}`
            }
          ]
        };
      }
      case "list_entities": {
        const { type } = args;
        await scanIndex();
        const allIds = index.getAllIds();
        let filteredIds = allIds;
        if (type) {
          filteredIds = allIds.filter((id) => {
            try {
              return getEntityTypeFromId(id, schema) === type;
            } catch {
              return false;
            }
          });
        }
        const entities = [];
        for (const id of filteredIds) {
          const path2 = index.getPathById(id);
          if (!path2) continue;
          try {
            const content = await adapter.readFile(path2);
            const entity = parser.parse(content, path2);
            entities.push(entity);
          } catch (err) {
          }
        }
        const summary = entities.map((e) => `- [${e.id}] ${e.title} (${e.status})`).join("\n");
        return {
          content: [
            {
              type: "text",
              text: `Found ${entities.length} entit${entities.length === 1 ? "y" : "ies"}${type ? ` of type ${type}` : ""}:

${summary}`
            }
          ]
        };
      }
      case "get_entity": {
        const { id } = args;
        await scanIndex();
        const path2 = index.getPathById(id);
        if (!path2) {
          return {
            content: [
              {
                type: "text",
                text: `Entity ${id} not found`
              }
            ],
            isError: true
          };
        }
        const content = await adapter.readFile(path2);
        const entity = parser.parse(content, path2);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(entity, null, 2)
            }
          ]
        };
      }
      case "update_entity": {
        const { id, updates } = args;
        await scanIndex();
        const path2 = index.getPathById(id);
        if (!path2) {
          return {
            content: [
              {
                type: "text",
                text: `Entity ${id} not found`
              }
            ],
            isError: true
          };
        }
        const content = await adapter.readFile(path2);
        const entity = parser.parse(content, path2);
        const { body: bodyUpdate, ...frontmatterUpdates } = updates;
        const sanitizedUpdates = {};
        for (const [key, value] of Object.entries(frontmatterUpdates)) {
          if (typeof value === "string") {
            sanitizedUpdates[key] = value.replace(/:/g, " -").replace(/\s{2,}/g, " ").trim();
          } else if (value && typeof value === "object" && !Array.isArray(value)) {
            const nested = {};
            for (const [nkey, nvalue] of Object.entries(value)) {
              if (typeof nvalue === "string") {
                nested[nkey] = nvalue.replace(/:/g, " -").replace(/\s{2,}/g, " ").trim();
              } else {
                nested[nkey] = nvalue;
              }
            }
            sanitizedUpdates[key] = nested;
          } else {
            sanitizedUpdates[key] = value;
          }
        }
        const errorsBefore = validator.validate(entity);
        const beforeKeys = new Set(errorsBefore.map((e) => `${e.code}:${e.field}`));
        const relNames = getRelationshipFieldNamesForType(entity.type);
        const customNames = new Set(schema.getFields(entity.type).map((f) => f.name));
        const touched = /* @__PURE__ */ new Set();
        const topLevel = {};
        const relPatch = {};
        const fieldPatch = {};
        const passthroughPatch = {};
        for (const [key, value] of Object.entries(sanitizedUpdates)) {
          if ((key === "relationships" || key === "fields") && value && typeof value === "object" && !Array.isArray(value)) {
            for (const k of Object.keys(value)) touched.add(k);
            topLevel[key] = value;
          } else if (relNames.has(key)) {
            relPatch[key] = value;
            touched.add(key);
          } else if (customNames.has(key)) {
            fieldPatch[key] = value;
            touched.add(key);
          } else if (entity.passthrough && key in entity.passthrough) {
            passthroughPatch[key] = value;
            touched.add(key);
          } else {
            topLevel[key] = value;
            touched.add(key);
          }
        }
        Object.assign(entity, topLevel);
        if (Object.keys(relPatch).length > 0) {
          entity.relationships = {
            ...entity.relationships ?? {},
            ...relPatch
          };
        }
        if (Object.keys(fieldPatch).length > 0) {
          entity.fields = { ...entity.fields ?? {}, ...fieldPatch };
        }
        for (const [key, value] of Object.entries(passthroughPatch)) {
          if (isClearValue(value)) delete entity.passthrough[key];
          else entity.passthrough[key] = value;
        }
        entity.updated_at = (/* @__PURE__ */ new Date()).toISOString();
        const errorsAfter = validator.validate(entity);
        const blocking = errorsAfter.filter(
          (e) => touched.has(e.field) || !beforeKeys.has(`${e.code}:${e.field}`)
        );
        if (blocking.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: `Validation failed:
${blocking.map((e) => `- ${e.field}: ${e.message}`).join("\n")}`
              }
            ],
            isError: true
          };
        }
        const warnings = errorsAfter.filter((e) => !blocking.includes(e)).map((e) => `${e.field}: ${e.message}`);
        const body = typeof bodyUpdate === "string" ? normalizeBody(bodyUpdate) : extractBody(content);
        const newContent = serializer.serialize(entity) + body;
        await adapter.writeFile(path2, newContent);
        return {
          content: [
            {
              type: "text",
              text: warnings.length > 0 ? `Updated ${id}: ${entity.title}
${JSON.stringify({ warnings }, null, 2)}` : `Updated ${id}: ${entity.title}`
            }
          ]
        };
      }
      case "get_schema": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                source: schemaSource,
                path: `${VAULT_PATH}/${SCHEMA_FILENAME}`,
                errors: schemaErrors,
                schema: activeSchema
              }, null, 2)
            }
          ]
        };
      }
      case "set_schema": {
        const { schema: fullSchema, relationships } = args;
        let candidate;
        if (fullSchema) {
          candidate = fullSchema;
        } else if (Array.isArray(relationships)) {
          candidate = { ...activeSchema, relationships };
        } else {
          return {
            content: [{ type: "text", text: 'set_schema requires "schema" (full Schema object) or "relationships" (array).' }],
            isError: true
          };
        }
        const errors = validateSchema(candidate);
        if (errors.length > 0) {
          return {
            content: [{ type: "text", text: `Schema is invalid \u2014 NOT saved:
- ${errors.join("\n- ")}` }],
            isError: true
          };
        }
        await adapter.writeFile(SCHEMA_FILENAME, serializeSchema(candidate));
        applySchema(candidate);
        schemaSource = "file";
        schemaErrors = [];
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              saved: true,
              path: `${VAULT_PATH}/${SCHEMA_FILENAME}`,
              entityTypes: candidate.entityTypes.length,
              relationships: candidate.relationships.length
            }, null, 2)
          }]
        };
      }
      case "get_schema_designer": {
        const html = schema_designer_default.replaceAll(
          '"__SCHEMA_PLACEHOLDER__"',
          JSON.stringify(activeSchema)
        );
        return { content: [{ type: "text", text: html }] };
      }
      case "search_entities": {
        const { query, from_id, direction, depth = 1, filters = {}, limit = 20 } = args;
        await scanIndex();
        let results = [];
        if (from_id && direction) {
          const startPath = index.getPathById(from_id);
          const startEntity = startPath ? parser.parse(await adapter.readFile(startPath), startPath) : null;
          if (!startEntity) {
            return {
              content: [{ type: "text", text: `Entity ${from_id} not found` }],
              isError: true
            };
          }
          if (direction === "down") {
            results = index.getAll().filter(
              (e) => e.parent_id === from_id && !e.archived
            );
          } else if (direction === "up") {
            const parentId = startEntity.relationships?.parent;
            if (parentId) {
              const parent = index.get(parentId);
              if (parent) results = [parent];
            }
          } else if (direction === "siblings") {
            const parentId = startEntity.relationships?.parent;
            if (parentId) {
              results = index.getAll().filter(
                (e) => e.parent_id === parentId && e.id !== from_id && !e.archived
              );
            }
          } else if (direction === "dependencies") {
            const depsIds = startEntity.relationships?.depends_on || [];
            results = depsIds.map((id) => index.get(id)).filter(Boolean);
          }
        } else if (query) {
          const lowerQuery = query.toLowerCase();
          const matched = [];
          for (const e of index.getAll()) {
            if (e.archived && !filters.archived) continue;
            let match = e.title.toLowerCase().includes(lowerQuery) || e.id.toLowerCase().includes(lowerQuery);
            if (!match) {
              const p = index.getPathById(e.id);
              const ent = p ? parser.parse(await adapter.readFile(p), p) : null;
              match = !!(ent?.fields && Object.values(ent.fields).some(
                (v) => typeof v === "string" && v.toLowerCase().includes(lowerQuery)
              ));
            }
            if (match) matched.push(e);
          }
          results = matched;
        } else {
          results = index.getAll().filter((e) => {
            if (e.archived && !filters.archived) return false;
            return true;
          });
        }
        if (filters.type && filters.type.length > 0) {
          results = results.filter((e) => filters.type.includes(e.type));
        }
        if (filters.status && filters.status.length > 0) {
          results = results.filter((e) => filters.status.includes(e.status));
        }
        if (filters.workstream && filters.workstream.length > 0) {
          results = results.filter((e) => filters.workstream.includes(e.workstream));
        }
        results = results.slice(0, limit);
        const formatted = results.map((e) => ({
          id: e.id,
          type: e.type,
          title: e.title,
          status: e.status,
          workstream: e.workstream,
          parent: e.parent_id
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                total: results.length,
                results: formatted
              }, null, 2)
            }
          ]
        };
      }
      case "get_project_overview": {
        const { include_completed = false, include_archived = false, workstream: filterWorkstream } = args;
        await scanIndex();
        const entities = index.getAll();
        const summary = {
          milestones: { total: 0, completed: 0, in_progress: 0, blocked: 0, not_started: 0 },
          stories: { total: 0, completed: 0, in_progress: 0, blocked: 0, not_started: 0 },
          tasks: { total: 0, completed: 0, in_progress: 0, blocked: 0, not_started: 0 },
          decisions: { total: 0, pending: 0, decided: 0, superseded: 0 },
          documents: { total: 0, draft: 0, approved: 0 },
          features: { total: 0 }
        };
        const workstreams = {};
        for (const entity of entities) {
          if (entity.archived && !include_archived) continue;
          if (entity.status === "Completed" && !include_completed) continue;
          if (filterWorkstream && entity.workstream !== filterWorkstream) continue;
          if (!workstreams[entity.workstream]) {
            workstreams[entity.workstream] = {
              milestones: 0,
              stories: 0,
              tasks: 0,
              decisions: 0,
              documents: 0,
              features: 0
            };
          }
          workstreams[entity.workstream][entity.type + "s"] = (workstreams[entity.workstream][entity.type + "s"] || 0) + 1;
          switch (entity.type) {
            case "milestone":
              summary.milestones.total++;
              if (entity.status === "Completed") summary.milestones.completed++;
              else if (entity.status === "In Progress") summary.milestones.in_progress++;
              else if (entity.status === "Blocked") summary.milestones.blocked++;
              else if (entity.status === "Not Started") summary.milestones.not_started++;
              break;
            case "story":
              summary.stories.total++;
              if (entity.status === "Completed") summary.stories.completed++;
              else if (entity.status === "In Progress") summary.stories.in_progress++;
              else if (entity.status === "Blocked") summary.stories.blocked++;
              else if (entity.status === "Not Started") summary.stories.not_started++;
              break;
            case "task":
              summary.tasks.total++;
              if (entity.status === "Completed") summary.tasks.completed++;
              else if (entity.status === "In Progress") summary.tasks.in_progress++;
              else if (entity.status === "Blocked") summary.tasks.blocked++;
              else if (entity.status === "Not Started") summary.tasks.not_started++;
              break;
            case "decision":
              summary.decisions.total++;
              if (entity.status === "Pending") summary.decisions.pending++;
              else if (entity.status === "Decided") summary.decisions.decided++;
              else if (entity.status === "Superseded") summary.decisions.superseded++;
              break;
            case "document":
              summary.documents.total++;
              if (entity.status === "Draft") summary.documents.draft++;
              else if (entity.status === "Approved") summary.documents.approved++;
              break;
            case "feature":
              summary.features.total++;
              break;
          }
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ summary, workstreams }, null, 2)
            }
          ]
        };
      }
      case "reconcile_relationships": {
        const { dry_run = false } = args;
        await scanIndex();
        const metas = index.getAll();
        const changes = [];
        const pending = /* @__PURE__ */ new Map();
        const bodies = /* @__PURE__ */ new Map();
        const stamps = /* @__PURE__ */ new Map();
        const loadEntity = async (id) => {
          const buffered = pending.get(id);
          if (buffered) return buffered;
          const p = index.getPathById(id);
          if (!p) return null;
          try {
            const raw = await adapter.readFile(p);
            const parsed = parser.parse(raw, p);
            bodies.set(id, extractBody(raw));
            stamps.set(id, explicitUpdatedAtMs(raw));
            return parsed;
          } catch {
            return null;
          }
        };
        const touch = (e) => pending.set(e.id, e);
        const asIds = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : typeof v === "string" && v !== "" ? [v] : [];
        const danglingMsg = (id, field, target) => field === "parent" ? `${id}: Parent ${target} not found - removing` : field === "depends_on" ? `${id}: Dependency ${target} not found - removing` : `${id}: ${field} entry ${target} not found - removing`;
        const relNamesByType = /* @__PURE__ */ new Map();
        const relNamesFor = (type) => {
          let names = relNamesByType.get(type);
          if (!names) {
            names = getRelationshipFieldNamesForType(type);
            relNamesByType.set(type, names);
          }
          return names;
        };
        const reconcileSide = async (entity, field, inverseField, inverseCard, sideIsForward) => {
          const val = entity.relationships?.[field];
          if (val === void 0 || val === null) return;
          const ids = asIds(val);
          const keep = [];
          for (const targetId of ids) {
            const targetMeta = index.get(targetId);
            if (!targetMeta) {
              changes.push(danglingMsg(entity.id, field, targetId));
              continue;
            }
            if (!relNamesFor(targetMeta.type).has(inverseField)) {
              keep.push(targetId);
              continue;
            }
            const target = await loadEntity(targetId);
            if (!target) {
              keep.push(targetId);
              continue;
            }
            target.relationships = target.relationships || {};
            const inverseVal = target.relationships[inverseField];
            const inverseIds = asIds(inverseVal);
            if (inverseIds.includes(entity.id)) {
              keep.push(targetId);
              continue;
            }
            if (!sideIsForward) {
              const forwardStamp = stamps.get(targetId);
              const reverseStamp = stamps.get(entity.id);
              if (typeof forwardStamp === "number" && typeof reverseStamp === "number" && forwardStamp > reverseStamp) {
                changes.push(
                  `${entity.id}: Stale ${field} entry ${targetId} (${targetId} was updated more recently and does not list ${entity.id} in ${inverseField}) - removing`
                );
                continue;
              }
            }
            keep.push(targetId);
            if (inverseCard === "many") {
              changes.push(`${target.id}: Add ${entity.id} to ${inverseField}`);
              target.relationships[inverseField] = [...inverseIds, entity.id];
              touch(target);
            } else if (inverseVal === void 0 || inverseVal === null || inverseVal === "") {
              changes.push(`${target.id}: Add ${entity.id} to ${inverseField}`);
              target.relationships[inverseField] = entity.id;
              touch(target);
            }
          }
          if (keep.length !== ids.length) {
            if (Array.isArray(val)) {
              entity.relationships[field] = keep;
            } else if (keep.length === 0) {
              delete entity.relationships[field];
            }
            touch(entity);
          }
        };
        const relationshipDefs = schema.getAllRelationships();
        for (const meta of metas) {
          const entity = await loadEntity(meta.id);
          if (!entity || !entity.relationships) continue;
          for (const rel of relationshipDefs) {
            for (const pair of rel.pairs) {
              if (pair.from === entity.type || pair.from === "*") {
                await reconcileSide(entity, pair.forward, pair.reverse, rel.cardinality.reverse, true);
              }
              if (pair.to === entity.type || pair.to === "*") {
                await reconcileSide(entity, pair.reverse, pair.forward, rel.cardinality.forward, false);
              }
            }
          }
        }
        if (!dry_run && pending.size > 0) {
          for (const entity of pending.values()) {
            const content = serializer.serialize(entity) + (bodies.get(entity.id) ?? "");
            const existingPath = index.getPathById(entity.id);
            const filePath = existingPath ?? `${pathResolver.getTypeFolderPath(entity.type)}/${pathResolver.generateFilename(entity.id, entity.title)}`;
            await adapter.writeFile(filePath, content);
          }
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                dry_run,
                changes_count: changes.length,
                changes: changes.slice(0, 50)
                // Limit output
              }, null, 2)
            }
          ]
        };
      }
      case "rebuild_index": {
        const before = index.getAll().length;
        const startTime = Date.now();
        await scanIndex();
        const after = index.getAll().length;
        const duration = Date.now() - startTime;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                entities_before: before,
                entities_after: after,
                duration_ms: duration
              }, null, 2)
            }
          ]
        };
      }
      case "read_docs": {
        const { path: path2 } = args;
        try {
          const content = await adapter.readFile(path2);
          return {
            content: [
              {
                type: "text",
                text: content
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `File not found: ${path2}`
              }
            ],
            isError: true
          };
        }
      }
      case "update_doc": {
        const { path: path2, content } = args;
        try {
          await adapter.writeFile(path2, content);
          return {
            content: [
              {
                type: "text",
                text: `Updated ${path2}`
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error updating ${path2}: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }
      case "list_files": {
        const { directory = "", pattern, recursive = false } = args;
        try {
          const files = [];
          async function scan(dir) {
            const entries = await adapter.readDir(dir);
            for (const entry of entries) {
              if (entry.isDirectory && recursive) {
                await scan(entry.path);
              } else if (!entry.isDirectory) {
                const relativePath = entry.path;
                if (!pattern) {
                  files.push(relativePath);
                } else {
                  const filename = relativePath.split("/").pop() || "";
                  const regexPattern = pattern.replace(/\*/g, ".*").replace(/\?/g, ".");
                  if (filename.match(new RegExp(`^${regexPattern}$`))) {
                    files.push(relativePath);
                  }
                }
              }
            }
          }
          await scan(directory);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  directory,
                  pattern,
                  count: files.length,
                  files: files.slice(0, 100)
                  // Limit output
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error listing files: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }
      case "analyze_project_state": {
        const { workstream: filterWorkstream, focus = "both" } = args;
        await scanIndex();
        const entities = index.getAll().filter((e) => !e.archived);
        const blockers = [];
        const suggestions = [];
        for (const entity of entities) {
          if (filterWorkstream && entity.workstream !== filterWorkstream) continue;
          if (entity.status === "Blocked") {
            const p = index.getPathById(entity.id);
            const full = p ? parser.parse(await adapter.readFile(p), p) : null;
            const blockedBy = full?.relationships?.depends_on || [];
            blockers.push({
              id: entity.id,
              title: entity.title,
              type: entity.type,
              blocked_by: blockedBy
            });
          }
        }
        if (focus === "actions" || focus === "both") {
          const notStarted = entities.filter(
            (e) => e.status === "Not Started" && (!filterWorkstream || e.workstream === filterWorkstream)
          );
          if (notStarted.length > 0) {
            suggestions.push(`${notStarted.length} entities are not started - consider prioritizing`);
          }
          const inProgress = entities.filter(
            (e) => e.status === "In Progress" && (!filterWorkstream || e.workstream === filterWorkstream)
          );
          if (inProgress.length > 5) {
            suggestions.push(`${inProgress.length} entities in progress - consider reducing WIP`);
          }
          if (blockers.length > 0) {
            suggestions.push(`${blockers.length} entities are blocked - resolve dependencies`);
          }
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                health: blockers.length === 0 ? "good" : blockers.length < 5 ? "fair" : "poor",
                blockers_count: blockers.length,
                blockers: blockers.slice(0, 20),
                suggested_actions: suggestions
              }, null, 2)
            }
          ]
        };
      }
      case "get_feature_coverage": {
        const { phase, tier } = args;
        await scanIndex();
        const featureMeta = index.getAll().filter((e) => e.type === "feature" && !e.archived);
        const features = [];
        for (const meta of featureMeta) {
          const p = index.getPathById(meta.id);
          if (!p) continue;
          try {
            features.push(parser.parse(await adapter.readFile(p), p));
          } catch {
            continue;
          }
        }
        let filtered = features;
        if (phase !== void 0 && phase !== null) {
          filtered = filtered.filter((f) => String(f.fields?.phase) === String(phase));
        }
        if (tier) {
          filtered = filtered.filter((f) => f.fields?.tier === tier);
        }
        let withImpl = 0;
        let withDoc = 0;
        const featureRows = filtered.map((f) => {
          const implIds = f.relationships?.implemented_by || [];
          const docIds = f.relationships?.documented_by || [];
          const hasImpl = implIds.length > 0;
          const hasDoc = docIds.length > 0;
          if (hasImpl) withImpl++;
          if (hasDoc) withDoc++;
          return {
            id: f.id,
            title: f.title,
            phase: f.fields?.phase,
            tier: f.fields?.tier,
            has_implementation: hasImpl,
            has_documentation: hasDoc,
            implementation_count: implIds.length,
            documentation_count: docIds.length
          };
        });
        const coverage = {
          total: filtered.length,
          with_implementation: withImpl,
          with_documentation: withDoc,
          features: featureRows
        };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(coverage, null, 2)
            }
          ]
        };
      }
      case "validate_project": {
        const { workstream: filterWorkstream, entity_types } = args;
        await scanIndex();
        let entities = index.getAll().filter((e) => !e.archived);
        if (filterWorkstream) {
          entities = entities.filter((e) => e.workstream === filterWorkstream);
        }
        if (entity_types && entity_types.length > 0) {
          entities = entities.filter((e) => entity_types.includes(e.type));
        }
        const violations = [];
        const FANOUT_LIMITS = {
          document_documents: 2,
          // a document should document at most 2 features
          decision_affects: 2,
          // a decision should affect at most 2 documents
          feature_implemented_by: 3,
          // a feature should have at most 3 implementers
          feature_documented_by: 2
          // a feature should be documented by at most 2 documents
        };
        const advisories = [];
        const hasRel = (v) => Array.isArray(v) ? v.length > 0 : v != null && v !== "";
        const asList = (v) => Array.isArray(v) ? v : v != null && v !== "" ? [v] : [];
        const ALLOWED = VALIDATION_ALLOWLIST;
        const REL_FIELDS = [
          "parent",
          "children",
          "depends_on",
          "blocks",
          "implements",
          "implemented_by",
          "documents",
          "documented_by",
          "affects",
          "decided_by",
          "supersedes",
          "superseded_by",
          "previous_version",
          "next_version"
        ];
        for (const meta of entities) {
          const path2 = index.getPathById(meta.id);
          if (!path2) continue;
          let entity;
          try {
            entity = parser.parse(await adapter.readFile(path2), path2);
          } catch {
            continue;
          }
          if ((entity.type === "story" || entity.type === "task") && !hasRel(entity.relationships?.parent)) {
            violations.push({
              entity: `${entity.id} (${entity.title})`,
              rule: "ORPHANED_ENTITY",
              message: `${entity.type} missing parent`
            });
          }
          const allowedForType = ALLOWED[entity.type] || {};
          const relView = {
            ...entity.passthrough || {},
            ...entity.relationships || {}
          };
          for (const field of REL_FIELDS) {
            const val = relView[field];
            if (!hasRel(val)) continue;
            if (!(field in allowedForType)) {
              violations.push({
                entity: `${entity.id} (${entity.title})`,
                rule: "INVALID_RELATIONSHIP",
                message: `${entity.type} should not have "${field}" relationship`
              });
              continue;
            }
            const okTypes = allowedForType[field];
            const badTargets = [];
            for (const targetId of asList(val)) {
              const target = index.get(targetId);
              if (target && !okTypes.includes(target.type)) {
                badTargets.push(`${targetId} (${target.type})`);
              }
            }
            if (badTargets.length > 0) {
              violations.push({
                entity: `${entity.id} (${entity.title})`,
                rule: "INVALID_RELATIONSHIP_TARGET",
                message: `${entity.type} "${field}" must target ${okTypes.join("/")} \u2014 invalid: ${badTargets.join(", ")}`
              });
            }
          }
          if (entity.type === "document") {
            const targets = asList(relView["documents"]);
            if (targets.length > FANOUT_LIMITS.document_documents) {
              advisories.push({
                entity: `${entity.id} (${entity.title})`,
                rule: "DOCUMENT_FANOUT",
                message: `document documents ${targets.length} features (limit ${FANOUT_LIMITS.document_documents}): ${targets.join(", ")}`,
                suggestion: `Split into focused documents so each documents at most ${FANOUT_LIMITS.document_documents} features: keep the ${FANOUT_LIMITS.document_documents} features this document is primarily about in \`documents\`, and move the rest into new per-feature (or per-cohesive-pair) documents that can carry \`previous_version\`/body links back to this one. On the canvas a document anchors to its FIRST documents-target, so wide fan-out also strands the document between distant feature clusters.`
              });
            }
          }
          if (entity.type === "decision") {
            const targets = asList(relView["affects"]);
            if (targets.length > FANOUT_LIMITS.decision_affects) {
              advisories.push({
                entity: `${entity.id} (${entity.title})`,
                rule: "DECISION_FANOUT",
                message: `decision affects ${targets.length} documents (limit ${FANOUT_LIMITS.decision_affects}): ${targets.join(", ")}`,
                suggestion: `Point \`affects\` at the ${FANOUT_LIMITS.decision_affects} documents that materially change because of this decision; for the others, record the impact in each document's body or split the decision into narrower per-scope decisions linked via \`supersedes\`/body references. Decisions position next to their first affected document, so long affects lists scatter meaning.`
              });
            }
          }
          if (entity.type === "feature") {
            const targets = asList(relView["documented_by"]);
            if (targets.length > FANOUT_LIMITS.feature_documented_by) {
              advisories.push({
                entity: `${entity.id} (${entity.title})`,
                rule: "FEATURE_DOC_FANOUT",
                message: `feature documented_by ${targets.length} documents (limit ${FANOUT_LIMITS.feature_documented_by}): ${targets.join(", ")}`,
                suggestion: `Unify the documentation into at most ${FANOUT_LIMITS.feature_documented_by} documents: merge overlapping/partial specs into one current document, chain superseded versions via \`previous_version\` (a superseded document should drop its \`documents\` link to this feature), and keep only the documents this feature genuinely relies on (e.g. current spec + guide). Wide doc fan-in usually signals stale or duplicated specs rather than thorough coverage.`
              });
            }
          }
          if (entity.type === "feature") {
            const targets = asList(relView["implemented_by"]);
            if (targets.length > FANOUT_LIMITS.feature_implemented_by) {
              advisories.push({
                entity: `${entity.id} (${entity.title})`,
                rule: "FEATURE_IMPLEMENTER_FANOUT",
                message: `feature implemented_by ${targets.length} implementers (limit ${FANOUT_LIMITS.feature_implemented_by}): ${targets.join(", ")}`,
                suggestion: `Consolidate to at most ${FANOUT_LIMITS.feature_implemented_by} implementers: either designate one umbrella story/milestone as the primary implementer (demote the others' \`implements\` to \`affects\` or body references), or split the feature into sub-features so each has a small, honest implementer set. Only the first implementer positions the feature on the canvas; the rest are edge-only.`
              });
            }
          }
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                entities_checked: entities.length,
                violations_count: violations.length,
                violations: violations.slice(0, 500),
                advisories_count: advisories.length,
                advisories: advisories.slice(0, 200),
                advisory_note: advisories.length > 0 ? "Advisories are non-blocking fan-out guidelines (not enforced on writes). Reconcile them over time using each suggestion \u2014 prefer small, reviewable re-organizations over bulk edits." : void 0
              }, null, 2)
            }
          ]
        };
      }
      case "cleanup_completed": {
        const { milestone_id, dry_run = false } = args;
        await scanIndex();
        let milestones = index.getAll().filter(
          (e) => e.type === "milestone" && e.status === "Completed" && !e.archived
        );
        if (milestone_id) {
          milestones = milestones.filter((m) => m.id === milestone_id);
        }
        const toArchive = [];
        const stats = {
          milestones_processed: milestones.length,
          stories_archived: 0,
          tasks_archived: 0
        };
        for (const milestone of milestones) {
          const children = index.getAll().filter(
            (e) => (e.type === "story" || e.type === "task") && e.parent_id === milestone.id && !e.archived
          );
          for (const child of children) {
            if (child.status === "Completed") {
              const cp = index.getPathById(child.id);
              const raw = cp ? await adapter.readFile(cp) : null;
              const full = raw && cp ? parser.parse(raw, cp) : null;
              if (!full || !raw) continue;
              toArchive.push({ entity: full, body: extractBody(raw) });
              if (child.type === "story") stats.stories_archived++;
              if (child.type === "task") stats.tasks_archived++;
            }
          }
        }
        if (!dry_run && toArchive.length > 0) {
          for (const { entity, body } of toArchive) {
            const updated = { ...entity, archived: true };
            const content = serializer.serialize(updated) + body;
            const archiveFolder = "archive";
            const typeFolder = pathResolver.getTypeFolderPath(entity.type);
            const filename = pathResolver.generateFilename(entity.id, entity.title);
            const archivePath = `${archiveFolder}/${typeFolder.split("/").pop()}/${filename}`;
            await adapter.writeFile(archivePath, content);
            const originalPath = `${typeFolder}/${filename}`;
            try {
            } catch (e) {
            }
          }
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                dry_run,
                ...stats,
                entities_to_archive: toArchive.length
              }, null, 2)
            }
          ]
        };
      }
      case "manage_documents": {
        const { action, topic, workstream: filterWorkstream, document_id } = args;
        await scanIndex();
        if (action === "get_decision_history") {
          const decisionMetas = index.getAll().filter(
            (e) => e.type === "decision" && !e.archived
          );
          let decisions = [];
          for (const meta of decisionMetas) {
            const p = index.getPathById(meta.id);
            const ent = p ? parser.parse(await adapter.readFile(p), p) : null;
            if (ent) decisions.push(ent);
          }
          if (topic) {
            const lowerTopic = topic.toLowerCase();
            decisions = decisions.filter(
              (d) => d.title.toLowerCase().includes(lowerTopic) || d.fields?.context && String(d.fields.context).toLowerCase().includes(lowerTopic)
            );
          }
          if (filterWorkstream) {
            decisions = decisions.filter((d) => d.workstream === filterWorkstream);
          }
          const history = decisions.map((d) => ({
            id: d.id,
            title: d.title,
            status: d.status,
            workstream: d.workstream,
            created: d.created_at,
            affects: d.relationships?.affects || []
          }));
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  total: history.length,
                  decisions: history
                }, null, 2)
              }
            ]
          };
        } else if (action === "check_freshness") {
          if (!document_id) {
            return {
              content: [{ type: "text", text: "document_id required for check_freshness" }],
              isError: true
            };
          }
          const doc = index.get(document_id);
          if (!doc) {
            return {
              content: [{ type: "text", text: `Document ${document_id} not found` }],
              isError: true
            };
          }
          const docUpdated = new Date(doc.updated_at);
          const decisions = index.getAll().filter(
            (e) => e.type === "decision" && e.status === "Decided" && new Date(e.created_at) > docUpdated
          );
          const stale = decisions.length > 0;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  document_id,
                  last_updated: doc.updated_at,
                  is_stale: stale,
                  newer_decisions_count: decisions.length,
                  newer_decisions: decisions.slice(0, 5).map((d) => ({
                    id: d.id,
                    title: d.title,
                    created: d.created_at
                  }))
                }, null, 2)
              }
            ]
          };
        }
        return {
          content: [{ type: "text", text: "Invalid action" }],
          isError: true
        };
      }
      case "search_docs": {
        const {
          query,
          top_k,
          max_excerpt_chars,
          min_score,
          excerpt_budget,
          filters,
          include_scores
        } = args;
        const engine = await getMsrlEngine();
        const result = await engine.query({
          query,
          topK: top_k,
          maxExcerptChars: max_excerpt_chars,
          minScore: min_score,
          excerptBudget: excerpt_budget ? {
            totalChars: excerpt_budget.total_chars,
            minPerResult: excerpt_budget.min_per_result,
            maxPerResult: excerpt_budget.max_per_result
          } : void 0,
          filters: filters ? {
            docUriPrefix: filters.doc_uri_prefix,
            docUris: filters.doc_uris,
            headingPathContains: filters.heading_path_contains
          } : void 0,
          debug: include_scores ? { includeScores: true } : void 0
        });
        const output = {
          results: result.results.map((r) => ({
            doc_uri: r.docUri,
            heading_path: r.headingPath,
            excerpt: r.excerpt,
            excerpt_truncated: r.excerptTruncated,
            content_length: r.contentLength,
            allocated_budget: r.allocatedBudget,
            ...include_scores && {
              score: r.score,
              vector_score: r.vectorScore,
              bm25_score: r.bm25Score
            }
          })),
          total_results: result.results.length,
          took_ms: result.meta.tookMs,
          budget_info: {
            total_chars_returned: result.meta.totalCharsReturned,
            total_chars_available: result.meta.totalCharsAvailable,
            budget_exhausted: result.meta.budgetExhausted,
            results_dropped_by_score: result.meta.resultsDroppedByScore,
            results_dropped_by_limit: result.meta.resultsDroppedByLimit
          }
        };
        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }]
        };
      }
      case "msrl_status": {
        const engine = await getMsrlEngine();
        const status = engine.getStatus();
        const output = {
          state: status.state,
          snapshot_id: status.snapshotId,
          snapshot_timestamp: status.snapshotTimestamp,
          stats: status.stats,
          watcher: {
            enabled: status.watcher.enabled,
            debounce_ms: status.watcher.debounceMs
          },
          ...status.buildProgress && {
            build_progress: {
              phase: status.buildProgress.phase,
              files_processed: status.buildProgress.filesProcessed,
              total_files: status.buildProgress.totalFiles,
              chunks_processed: status.buildProgress.chunksProcessed,
              percent: status.buildProgress.percent,
              current_file: status.buildProgress.currentFile
            }
          }
        };
        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }]
        };
      }
      case "entities": {
        const { action, ids, fields, ops, options } = args;
        if (action === "get") {
          if (!ids || ids.length === 0) {
            return {
              content: [{ type: "text", text: "Error: ids is required for get action" }],
              isError: true
            };
          }
          await scanIndex();
          const entities = [];
          const notFound = [];
          for (const id of ids) {
            const path2 = index.getPathById(id);
            if (!path2) {
              notFound.push(id);
              continue;
            }
            try {
              const content = await adapter.readFile(path2);
              const entity = parser.parse(content, path2);
              if (fields && fields.length > 0) {
                const filtered = { id: entity.id, type: entity.type };
                for (const field of fields) {
                  if (field in entity) {
                    filtered[field] = entity[field];
                  }
                }
                entities.push(filtered);
              } else {
                entities.push(entity);
              }
            } catch (err) {
              notFound.push(id);
            }
          }
          const output = {
            entities,
            count: entities.length,
            ...notFound.length > 0 && { not_found: notFound }
          };
          return {
            content: [{ type: "text", text: JSON.stringify(output, null, 2) }]
          };
        } else if (action === "batch") {
          if (!ops || ops.length === 0) {
            return {
              content: [{ type: "text", text: "Error: ops is required for batch action" }],
              isError: true
            };
          }
          const atomic = options?.atomic ?? false;
          const dryRun = options?.dry_run ?? false;
          const includeEntities = options?.include_entities ?? false;
          const clientIdMap = /* @__PURE__ */ new Map();
          const processedClientIds = /* @__PURE__ */ new Set();
          const results = [];
          let succeeded = 0;
          let failed = 0;
          for (const operation of ops) {
            const { client_id, op, type, id, payload } = operation;
            if (processedClientIds.has(client_id)) {
              results.push({
                client_id,
                success: true,
                id: clientIdMap.get(client_id)
              });
              continue;
            }
            try {
              if (op === "create") {
                if (!type || !payload.title) {
                  throw new Error("type and payload.title are required for create operation");
                }
                if (dryRun) {
                  await scanIndex();
                  const allocator = new IDAllocator(schema, index);
                  const newId = await allocator.allocate(type);
                  results.push({
                    client_id,
                    success: true,
                    id: newId,
                    changes: [
                      { field: "op", before: null, after: "create" },
                      { field: "type", before: null, after: type },
                      { field: "title", before: null, after: payload.title }
                    ]
                  });
                  succeeded++;
                } else {
                  await scanIndex();
                  const allocator = new IDAllocator(schema, index);
                  const newId = await allocator.allocate(type);
                  const now = (/* @__PURE__ */ new Date()).toISOString();
                  const typeDef = schema.getEntityType(type);
                  const resolvedPayload = { ...payload };
                  for (const [key, value] of Object.entries(resolvedPayload)) {
                    if (typeof value === "string" && value.startsWith("{{") && value.endsWith("}}")) {
                      const refClientId = value.slice(2, -2);
                      const refId = clientIdMap.get(refClientId);
                      if (refId) {
                        resolvedPayload[key] = refId;
                      }
                    }
                  }
                  const { workstream, status, relationships, ...customFields } = resolvedPayload;
                  const split = splitFlatRelationshipKeys(type, customFields);
                  const mergedRelationships = {
                    ...split.relationships,
                    ...relationships ?? {}
                  };
                  const sanitizedTitle = String(payload.title).replace(/:/g, " -").replace(/\s{2,}/g, " ").trim();
                  const sanitizedCustomFields = {};
                  for (const [key, value] of Object.entries(split.rest)) {
                    if (typeof value === "string") {
                      sanitizedCustomFields[key] = value.replace(/:/g, " -").replace(/\s{2,}/g, " ").trim();
                    } else {
                      sanitizedCustomFields[key] = value;
                    }
                  }
                  const entity = {
                    id: newId,
                    type,
                    title: sanitizedTitle,
                    status: status ?? typeDef?.statuses[0] ?? "Not Started",
                    workstream: workstream ?? "engineering",
                    created_at: now,
                    updated_at: now,
                    archived: false,
                    vault_path: "",
                    canvas_source: "",
                    fields: sanitizedCustomFields,
                    relationships: mergedRelationships
                  };
                  const errors = validator.validate(entity);
                  if (errors.length > 0) {
                    throw new Error(`Validation failed: ${errors.map((e) => `${e.field}: ${e.message}`).join(", ")}`);
                  }
                  const content = serializer.serialize(entity);
                  const filename = pathResolver.generateFilename(newId, sanitizedTitle);
                  const folder = pathResolver.getTypeFolderPath(type);
                  const filePath = `${folder}/${filename}`;
                  await adapter.writeFile(filePath, content);
                  clientIdMap.set(client_id, newId);
                  processedClientIds.add(client_id);
                  results.push({
                    client_id,
                    success: true,
                    id: newId,
                    ...includeEntities && { entity }
                  });
                  succeeded++;
                }
              } else if (op === "update") {
                if (!id) {
                  throw new Error("id is required for update operation");
                }
                await scanIndex();
                const path2 = index.getPathById(id);
                if (!path2) {
                  throw new Error(`Entity ${id} not found`);
                }
                const content = await adapter.readFile(path2);
                const entity = parser.parse(content, path2);
                const changes = [];
                const relNames = getRelationshipFieldNamesForType(entity.type);
                const customNames = new Set(schema.getFields(entity.type).map((f) => f.name));
                const currentValue = (key) => key === "body" ? extractBody(content) : key === "relationships" || key === "fields" ? entity[key] : relNames.has(key) ? entity.relationships?.[key] : customNames.has(key) ? entity.fields?.[key] : entity.passthrough && key in entity.passthrough ? entity.passthrough[key] : entity[key];
                if (dryRun) {
                  for (const [key, value] of Object.entries(payload)) {
                    const before = currentValue(key);
                    if (JSON.stringify(before) !== JSON.stringify(value)) {
                      changes.push({ field: key, before, after: value });
                    }
                  }
                  results.push({
                    client_id,
                    success: true,
                    id,
                    changes
                  });
                  succeeded++;
                } else {
                  const errorsBefore = validator.validate(entity);
                  const beforeKeys = new Set(errorsBefore.map((e) => `${e.code}:${e.field}`));
                  const touched = /* @__PURE__ */ new Set();
                  let bodyUpdate;
                  for (const [key, value] of Object.entries(payload)) {
                    if (value === void 0) continue;
                    if (key === "body") {
                      if (typeof value === "string") bodyUpdate = value;
                      continue;
                    }
                    if ((key === "relationships" || key === "fields") && value && typeof value === "object" && !Array.isArray(value)) {
                      for (const k of Object.keys(value)) touched.add(k);
                      entity[key] = value;
                    } else if (relNames.has(key)) {
                      entity.relationships = {
                        ...entity.relationships ?? {},
                        [key]: value
                      };
                      touched.add(key);
                    } else if (customNames.has(key)) {
                      entity.fields = { ...entity.fields ?? {}, [key]: value };
                      touched.add(key);
                    } else if (entity.passthrough && key in entity.passthrough) {
                      if (isClearValue(value)) delete entity.passthrough[key];
                      else entity.passthrough[key] = value;
                      touched.add(key);
                    } else {
                      entity[key] = value;
                      touched.add(key);
                    }
                  }
                  entity.updated_at = (/* @__PURE__ */ new Date()).toISOString();
                  const errorsAfter = validator.validate(entity);
                  const blocking = errorsAfter.filter(
                    (e) => touched.has(e.field) || !beforeKeys.has(`${e.code}:${e.field}`)
                  );
                  if (blocking.length > 0) {
                    throw new Error(`Validation failed: ${blocking.map((e) => `${e.field}: ${e.message}`).join(", ")}`);
                  }
                  const warnings = errorsAfter.filter((e) => !blocking.includes(e)).map((e) => `${e.field}: ${e.message}`);
                  const newBody = bodyUpdate !== void 0 ? normalizeBody(bodyUpdate) : extractBody(content);
                  const newContent = serializer.serialize(entity) + newBody;
                  await adapter.writeFile(path2, newContent);
                  results.push({
                    client_id,
                    success: true,
                    id,
                    ...warnings.length > 0 && { warnings },
                    ...includeEntities && { entity }
                  });
                  succeeded++;
                }
              } else if (op === "archive") {
                if (!id) {
                  throw new Error("id is required for archive operation");
                }
                if (dryRun) {
                  results.push({
                    client_id,
                    success: true,
                    id,
                    changes: [{ field: "archived", before: false, after: true }]
                  });
                  succeeded++;
                } else {
                  await scanIndex();
                  const path2 = index.getPathById(id);
                  if (!path2) {
                    throw new Error(`Entity ${id} not found`);
                  }
                  const content = await adapter.readFile(path2);
                  const entity = parser.parse(content, path2);
                  entity.archived = true;
                  entity.updated_at = (/* @__PURE__ */ new Date()).toISOString();
                  const newContent = serializer.serialize(entity) + extractBody(content);
                  await adapter.writeFile(path2, newContent);
                  results.push({
                    client_id,
                    success: true,
                    id,
                    ...includeEntities && { entity }
                  });
                  succeeded++;
                }
              } else {
                throw new Error(`Invalid operation: ${op}`);
              }
            } catch (error) {
              failed++;
              results.push({
                client_id,
                success: false,
                error: error instanceof Error ? error.message : String(error)
              });
              if (atomic) {
                return {
                  content: [
                    {
                      type: "text",
                      text: `Batch operation failed (atomic mode): ${error instanceof Error ? error.message : String(error)}
Rolled back all changes.`
                    }
                  ],
                  isError: true
                };
              }
            }
          }
          const output = {
            results,
            summary: {
              total: ops.length,
              succeeded,
              failed,
              dry_run: dryRun
            }
          };
          return {
            content: [{ type: "text", text: JSON.stringify(output, null, 2) }]
          };
        } else {
          return {
            content: [{ type: "text", text: `Error: Invalid action '${action}'. Valid actions: get, batch` }],
            isError: true
          };
        }
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
});
async function shutdown() {
  console.error("Shutting down...");
  if (msrlEngine) {
    await msrlEngine.shutdown();
    console.error("MSRL engine shut down");
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
var SCHEMA_ABS_PATH = `${VAULT_PATH}/${SCHEMA_FILENAME}`;
async function loadSchema() {
  const result = await loadOrBootstrapSchema(adapter, "");
  applySchema(result.schema);
  schemaSource = result.source;
  schemaErrors = result.errors;
  if (result.wroteDefault) {
    console.error(`Bootstrapped ${SCHEMA_ABS_PATH} from the default schema.`);
  }
  if (result.errors.length > 0) {
    console.error(`WARNING: ${SCHEMA_FILENAME} is invalid \u2014 falling back to the default schema. Errors:`);
    for (const e of result.errors) console.error(`  - ${e}`);
  } else {
    console.error(`Schema source: ${result.source} (${SCHEMA_ABS_PATH})`);
  }
}
async function main() {
  await loadSchema();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Obsidian Unified MCP Server started");
  console.error(`Vault path: ${VAULT_PATH}`);
  console.error("Waiting for requests...");
}
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

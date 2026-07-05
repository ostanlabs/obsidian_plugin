/**
 * RelationshipGraph — bidirectional sync, transitive reduction, cycle detection. (§9)
 *
 * STUB: every method throws NOT_IMPLEMENTED. Driven to green by suite D, which
 * encodes the CORRECTED behaviour (the spec's §9 stubs + additive-only sync must
 * NOT survive):
 *   - forward→inverse sync for all 7 pairs, both directions
 *     (depends_on→blocks NOT enables; affects→decided_by; documents→documented_by).
 *   - inverse REMOVAL on unlink (parity F8: additive-only is a regression).
 *   - cycle-closing write is REJECTED (not silently mutated).
 *   - transitive reduction removes A→C when A→B→C (port the MCP algos).
 */

import {
  notImplemented,
  type EntityId,
  type EntityIndex,
  type FileSystem,
  type RuntimeEntity,
} from './types.js';
import type { SchemaRegistry } from './schema-registry.js';
import type { PathResolver } from './path-resolver.js';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface CycleCheckResult {
  hasCycle: boolean;
  cyclePath?: EntityId[];
  message?: string;
}

export class CycleError extends Error {
  constructor(
    message: string,
    public readonly cyclePath: EntityId[]
  ) {
    super(message);
    this.name = 'CycleError';
  }
}

export class RelationshipGraph {
  constructor(
    private readonly schema: SchemaRegistry,
    private readonly index: EntityIndex
  ) {}

  /**
   * Recompute every inverse for `entity` from its source fields, ADDING to newly
   * referenced targets AND REMOVING from targets no longer referenced.
   * @param previous entity state before the update (null on create), for removal.
   */
  async syncBidirectional(
    entity: RuntimeEntity,
    previous: RuntimeEntity | null,
    fs: FileSystem,
    pathResolver: PathResolver
  ): Promise<void> {
    // Get all relationships for this entity type
    const relationships = this.schema.getAllRelationships();

    for (const rel of relationships) {
      // Process each pair in this relationship
      for (const pair of rel.pairs) {
        // Check if this pair applies to this entity type (entity is the "from" side)
        const isForward = pair.from === entity.type || pair.from === '*';
        if (!isForward) continue;

        const forwardField = pair.forward;
        const inverseField = pair.reverse;

        // Get current and previous IDs for this field
        const currentIds = this.getRelationshipIds(entity, forwardField);
        const previousIds = previous ? this.getRelationshipIds(previous, forwardField) : [];

        // Find added and removed targets
        const added = currentIds.filter((id) => !previousIds.includes(id));
        const removed = previousIds.filter((id) => !currentIds.includes(id));

        // Add inverse references on new targets
        for (const targetId of added) {
          await this.addInverseReference(targetId, inverseField, entity.id, fs, pathResolver);
        }

        // Remove inverse references from old targets
        for (const targetId of removed) {
          await this.removeInverseReference(targetId, inverseField, entity.id, fs, pathResolver);
        }
      }
    }
  }

  private getRelationshipIds(entity: RuntimeEntity, field: string): EntityId[] {
    const value = entity.relationships?.[field];
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  private async addInverseReference(
    targetId: EntityId,
    inverseField: string,
    sourceId: EntityId,
    fs: FileSystem,
    pathResolver: PathResolver
  ): Promise<void> {
    const targetPath = this.index.getPathById(targetId);
    if (!targetPath) return;

    // targetPath from index is already absolute in tests, but may be vault-relative in production
    // Try to normalize: if it starts with vaultPath, use as-is; otherwise prepend vaultPath
    const absolutePath = targetPath.startsWith('/') ? targetPath : pathResolver.toAbsolutePath(targetPath);
    const content = await fs.readFile(absolutePath);

    // Parse frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return;

    const frontmatter = parseYaml(fmMatch[1]) as Record<string, unknown>;
    const bodyMatch = content.match(/\n---\n([\s\S]*)$/);
    const body = bodyMatch ? bodyMatch[1] : '\n';

    // Get current values for this field
    const currentValue = frontmatter[inverseField];
    let updated: EntityId[];

    if (!currentValue) {
      updated = [sourceId];
    } else if (Array.isArray(currentValue)) {
      if (currentValue.includes(sourceId)) return; // Already present
      updated = [...currentValue, sourceId];
    } else {
      if (currentValue === sourceId) return; // Already present
      updated = [currentValue as EntityId, sourceId];
    }

    frontmatter[inverseField] = updated;

    // Rebuild file
    const newFrontmatter = stringifyYaml(frontmatter).trim();
    const newContent = `---\n${newFrontmatter}\n---${body}`;

    await fs.writeFile(absolutePath, newContent);
  }

  private async removeInverseReference(
    targetId: EntityId,
    inverseField: string,
    sourceId: EntityId,
    fs: FileSystem,
    pathResolver: PathResolver
  ): Promise<void> {
    const targetPath = this.index.getPathById(targetId);
    if (!targetPath) return;

    // targetPath from index is already absolute in tests, but may be vault-relative in production
    const absolutePath = targetPath.startsWith('/') ? targetPath : pathResolver.toAbsolutePath(targetPath);
    const content = await fs.readFile(absolutePath);

    // Parse frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return;

    const frontmatter = parseYaml(fmMatch[1]) as Record<string, unknown>;
    const bodyMatch = content.match(/\n---\n([\s\S]*)$/);
    const body = bodyMatch ? bodyMatch[1] : '\n';

    // Get current values
    const currentValue = frontmatter[inverseField];
    if (!currentValue) return; // Field doesn't exist

    if (Array.isArray(currentValue)) {
      const filtered = currentValue.filter((id) => id !== sourceId);
      if (filtered.length === 0) {
        delete frontmatter[inverseField];
      } else if (filtered.length === 1) {
        frontmatter[inverseField] = filtered[0];
      } else {
        frontmatter[inverseField] = filtered;
      }
    } else if (currentValue === sourceId) {
      delete frontmatter[inverseField];
    }

    // Rebuild file
    const newFrontmatter = stringifyYaml(frontmatter).trim();
    const newContent = `---\n${newFrontmatter}\n---${body}`;

    await fs.writeFile(absolutePath, newContent);
  }

  /**
   * Set `field` = `targetId` on `sourceId`, syncing the inverse and REJECTING
   * (throwing CycleError) if the link would close a cycle on a cyclePrevention
   * relationship. The engine prevents; it never destructively deletes edges.
   */
  async link(
    sourceId: EntityId,
    field: string,
    targetId: EntityId,
    fs: FileSystem,
    pathResolver: PathResolver
  ): Promise<void> {
    const rel = this.schema.getRelationshipForField(field);
    if (!rel) throw new Error(`Unknown relationship field: ${field}`);

    // Check for cycles if this relationship has cycle checking enabled
    if (rel.graph.cyclePrevention) {
      const check = this.wouldCreateCycle(rel.name, sourceId, targetId);
      if (check.hasCycle) {
        throw new CycleError(check.message || 'Cycle detected', check.cyclePath || []);
      }
    }

    // Add the relationship
    const sourcePath = this.index.getPathById(sourceId);
    if (!sourcePath) throw new Error(`Source entity not found: ${sourceId}`);

    const absolutePath = sourcePath.startsWith('/') ? sourcePath : pathResolver.toAbsolutePath(sourcePath);
    const content = await fs.readFile(absolutePath);

    // Update the field value
    const updated = content.replace(
      new RegExp(`^${field}:.*$`, 'm'),
      `${field}: ${targetId}`
    );

    await fs.writeFile(absolutePath, updated);

    // Sync the inverse
    const pair = rel.pairs.find((p) => p.forward === field);
    if (pair) {
      await this.addInverseReference(targetId, pair.reverse, sourceId, fs, pathResolver);
    }
  }

  /** Remove `targetId` from `field` on `sourceId`, cleaning up the stale inverse. */
  async unlink(
    sourceId: EntityId,
    field: string,
    targetId: EntityId,
    fs: FileSystem,
    pathResolver: PathResolver
  ): Promise<void> {
    const rel = this.schema.getRelationshipForField(field);
    if (!rel) throw new Error(`Unknown relationship field: ${field}`);

    // Remove from source
    const sourcePath = this.index.getPathById(sourceId);
    if (!sourcePath) return;

    const absolutePath = sourcePath.startsWith('/') ? sourcePath : pathResolver.toAbsolutePath(sourcePath);
    const content = await fs.readFile(absolutePath);

    // Remove the target from the field
    const updated = content.replace(new RegExp(`^  - ${targetId}\\s*$`, 'm'), '');
    await fs.writeFile(absolutePath, updated);

    // Remove the inverse
    const pair = rel.pairs.find((p) => p.forward === field);
    if (pair) {
      await this.removeInverseReference(targetId, pair.reverse, sourceId, fs, pathResolver);
    }
  }

  /** Would adding from→to close a cycle on the named relationship? */
  wouldCreateCycle(
    relationshipName: string,
    fromId: EntityId,
    toId: EntityId
  ): CycleCheckResult {
    // Build adjacency list for this relationship
    const adjacency = this.index.buildAdjacency(relationshipName, 'forward');

    // Check if there's a path from toId back to fromId
    const visited = new Set<EntityId>();
    const path: EntityId[] = [];

    const dfs = (current: EntityId): boolean => {
      if (current === fromId) {
        path.push(current);
        return true;
      }
      if (visited.has(current)) return false;
      visited.add(current);
      path.push(current);

      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (dfs(neighbor)) return true;
      }

      path.pop();
      return false;
    };

    if (dfs(toId)) {
      return {
        hasCycle: true,
        cyclePath: path,
        message: `Adding ${fromId} → ${toId} would create a cycle: ${path.join(' → ')}`,
      };
    }

    return { hasCycle: false };
  }

  /** All cycles currently present in the named relationship. */
  detectCycles(relationshipName: string): EntityId[][] {
    const adjacency = this.index.buildAdjacency(relationshipName, 'forward');
    const cycles: EntityId[][] = [];
    const visited = new Set<EntityId>();

    const dfs = (start: EntityId, path: EntityId[], pathSet: Set<EntityId>): void => {
      const neighbors = adjacency.get(start) || [];
      for (const neighbor of neighbors) {
        if (pathSet.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          const cycle = [...path.slice(cycleStart), neighbor];
          cycles.push(cycle);
        } else if (!visited.has(neighbor)) {
          path.push(neighbor);
          pathSet.add(neighbor);
          dfs(neighbor, path, pathSet);
          path.pop();
          pathSet.delete(neighbor);
        }
      }
    };

    for (const nodeId of adjacency.keys()) {
      if (!visited.has(nodeId)) {
        const path = [nodeId];
        const pathSet = new Set([nodeId]);
        dfs(nodeId, path, pathSet);
        visited.add(nodeId);
      }
    }

    return cycles;
  }

  /**
   * Direct targets of `entity` for `relationshipName` after transitive reduction
   * (A→C removed when A→B→C exists).
   */
  async applyTransitiveReduction(
    entity: RuntimeEntity,
    relationshipName: string
  ): Promise<EntityId[]> {
    const rel = this.schema.getRelationshipByName(relationshipName);
    if (!rel) return [];

    // Get the forward field for this relationship
    const pair = rel.pairs.find((p) => p.from === entity.type || p.from === '*');
    if (!pair) return [];

    const directTargets = this.getRelationshipIds(entity, pair.forward);
    if (directTargets.length <= 1) return directTargets;

    // Build adjacency for reachability check
    const adjacency = this.index.buildAdjacency(relationshipName, 'forward');

    // For each target, check if it's reachable via another target
    const redundant = new Set<EntityId>();

    for (const target of directTargets) {
      // Check if any OTHER direct target can reach this one
      for (const otherTarget of directTargets) {
        if (otherTarget === target) continue;
        if (this.isReachable(otherTarget, target, adjacency)) {
          redundant.add(target);
          break;
        }
      }
    }

    return directTargets.filter((t) => !redundant.has(t));
  }

  private isReachable(
    from: EntityId,
    to: EntityId,
    adjacency: Map<EntityId, EntityId[]>
  ): boolean {
    const visited = new Set<EntityId>();
    const queue = [from];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === to) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const neighbors = adjacency.get(current) || [];
      queue.push(...neighbors);
    }

    return false;
  }
}

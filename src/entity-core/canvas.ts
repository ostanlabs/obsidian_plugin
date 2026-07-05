/**
 * CanvasManager + canvas model types. (§10)
 *
 * STUB: every method throws NOT_IMPLEMENTED. Driven to green by suite G:
 *   - schema-driven node dimensions/colors per type.
 *   - layout invariants (no overlaps, parent/child ordering) — positioningV4 style.
 */

import {
  notImplemented,
  type CanvasPath,
  type EntityId,
  type EntityType,
  type FileSystem,
  type VaultPath,
} from './types.js';
import type { SchemaRegistry } from './schema-registry.js';
import type { PathResolver } from './path-resolver.js';

export interface CanvasNode {
  id: string;
  type: 'file' | 'text' | 'link' | 'group';
  file?: string;
  text?: string;
  url?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  label?: string;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toSide: 'top' | 'right' | 'bottom' | 'left';
  color?: string;
  label?: string;
}

export interface CanvasFile {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface Position {
  x: number;
  y: number;
}

export interface LayoutResult {
  success: boolean;
  nodesRepositioned: number;
  errors: string[];
}

export class CanvasManager {
  constructor(
    private readonly schema: SchemaRegistry,
    private readonly fs: FileSystem,
    private readonly pathResolver: PathResolver
  ) {}

  /** Build a schema-styled node for an entity (dimensions/color from schema). */
  createNode(entityId: EntityId, entityPath: VaultPath, position: Position): CanvasNode {
    const type = this.getTypeFromPath(entityPath);
    if (!type) {
      throw new Error(`Unable to determine entity type from path: ${entityPath}`);
    }

    const typeDef = this.schema.getEntityType(type);
    if (!typeDef) {
      throw new Error(`Unknown entity type: ${type}`);
    }

    const canvas = typeDef.canvas || { width: 400, height: 300, color: '3' };

    return {
      id: this.generateNodeId(),
      type: 'file',
      file: entityPath,
      x: position.x,
      y: position.y,
      width: canvas.width,
      height: canvas.height,
      color: canvas.color,
    };
  }

  createEdge(fromId: string, toId: string, relationshipName: string): CanvasEdge {
    const rel = this.schema.getRelationshipByName(relationshipName);
    const edgeStyle = rel?.canvas || { color: 'gray', style: 'solid' };

    return {
      id: this.generateEdgeId(),
      fromNode: fromId,
      toNode: toId,
      fromSide: 'right',
      toSide: 'left',
      color: edgeStyle.color,
    };
  }

  async addNode(canvasPath: CanvasPath, entityId: EntityId, position?: Position): Promise<void> {
    const canvas = await this.readCanvas(canvasPath);

    // Determine entity path (would need index in production)
    const type = entityId.split('-')[0];
    const folder = this.schema.getEntityType(type)?.folder || 'entities';
    const entityPath = `entities/${folder}/${entityId}.md` as VaultPath;

    const pos = position || this.calculateNextPosition(canvas);
    const node = this.createNode(entityId, entityPath, pos);

    canvas.nodes.push(node);
    await this.writeCanvas(canvasPath, canvas);
  }

  async autoLayout(canvasPath: CanvasPath): Promise<LayoutResult> {
    const canvas = await this.readCanvas(canvasPath);
    const result: LayoutResult = { success: true, nodesRepositioned: 0, errors: [] };

    // Simple grid layout to ensure no overlaps
    const GRID_SPACING = 50;
    const COLUMN_WIDTH = 600;
    const ROW_HEIGHT = 500;

    for (let i = 0; i < canvas.nodes.length; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);

      canvas.nodes[i].x = col * COLUMN_WIDTH;
      canvas.nodes[i].y = row * ROW_HEIGHT;
      result.nodesRepositioned++;
    }

    await this.writeCanvas(canvasPath, canvas);
    return result;
  }

  getTypeFromPath(filePath: VaultPath): EntityType | null {
    // Extract type from path pattern: entities/<folder>/<id>.md
    const match = filePath.match(/entities\/(\w+)\//);
    if (!match) return null;

    const folder = match[1];

    // Find entity type by folder
    const types = this.schema.getAllEntityTypes();
    for (const type of types) {
      if (type.folder === folder) {
        return type.type as EntityType;
      }
    }

    return null;
  }

  private async readCanvas(canvasPath: CanvasPath): Promise<CanvasFile> {
    const absolutePath = this.pathResolver.toAbsolutePath(canvasPath);
    const content = await this.fs.readFile(absolutePath);
    return JSON.parse(content) as CanvasFile;
  }

  private async writeCanvas(canvasPath: CanvasPath, canvas: CanvasFile): Promise<void> {
    const absolutePath = this.pathResolver.toAbsolutePath(canvasPath);
    await this.fs.writeFile(absolutePath, JSON.stringify(canvas, null, 2));
  }

  private calculateNextPosition(canvas: CanvasFile): Position {
    if (canvas.nodes.length === 0) {
      return { x: 0, y: 0 };
    }

    const lastNode = canvas.nodes[canvas.nodes.length - 1];
    return {
      x: lastNode.x + lastNode.width + 50,
      y: lastNode.y,
    };
  }

  private generateNodeId(): string {
    return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateEdgeId(): string {
    return `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

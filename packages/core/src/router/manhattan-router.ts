import { Position } from "../schema/geometry";
import { Component } from "../schema/component";
import { CircuitGraph } from "../graph/circuit-graph";
import { isPointsEqual, simplifyOrthogonalPoints } from "../graph/geometry-utils";

export interface RouterOptions {
  bendPenalty?: number; // Cost penalty for changing direction (defaults to 15)
  margin?: number; // Grid bounds margin around elements (defaults to 10)
  avoidComponents?: boolean; // Whether to route around component bodies (defaults to true)
  ignoredComponentIds?: string[]; // Components whose bodies are allowed to be traversed
}

type Direction = "none" | "h" | "v";

interface AStarNode {
  x: number;
  y: number;
  dir: Direction;
  g: number;
  f: number;
  parent?: AStarNode;
}

// Simple binary min-heap for A* priority queue
class MinHeap {
  private items: AStarNode[] = [];

  public get size(): number {
    return this.items.length;
  }

  public push(node: AStarNode): void {
    this.items.push(node);
    this.bubbleUp(this.items.length - 1);
  }

  public pop(): AStarNode | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0]!;
    const bottom = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    const element = this.items[index]!;
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      const parent = this.items[parentIndex]!;
      if (element.f >= parent.f) break;
      this.items[index] = parent;
      this.items[parentIndex] = element;
      index = parentIndex;
    }
  }

  private sinkDown(index: number): void {
    const length = this.items.length;
    const element = this.items[index]!;
    while (true) {
      const leftChildIndex = (index << 1) + 1;
      const rightChildIndex = leftChildIndex + 1;
      let swapIndex = -1;
      let minF = element.f;

      if (leftChildIndex < length) {
        const leftChild = this.items[leftChildIndex]!;
        if (leftChild.f < minF) {
          minF = leftChild.f;
          swapIndex = leftChildIndex;
        }
      }

      if (rightChildIndex < length) {
        const rightChild = this.items[rightChildIndex]!;
        if (rightChild.f < minF) {
          swapIndex = rightChildIndex;
        }
      }

      if (swapIndex === -1) break;
      this.items[index] = this.items[swapIndex]!;
      this.items[swapIndex] = element;
      index = swapIndex;
    }
  }
}

export class ManhattanRouter {
  /**
   * Computes an optimal orthogonal wire route between start and end on the integer grid,
   * avoiding component bodies and minimizing bends (turns).
   */
  public static route(
    start: Position,
    end: Position,
    graph?: CircuitGraph,
    options: RouterOptions = {},
  ): Position[] {
    if (isPointsEqual(start, end)) {
      return [{ ...start }, { ...end }];
    }

    // Direct single segment if on the same horizontal or vertical line and no obstacles
    if ((start.x === end.x || start.y === end.y) && !graph) {
      return [{ ...start }, { ...end }];
    }

    const bendPenalty = options.bendPenalty ?? 15;
    const margin = options.margin ?? 10;
    const avoidComponents = options.avoidComponents ?? true;
    const ignoredIds = new Set(options.ignoredComponentIds ?? []);

    // Build obstacle set from components
    const obstacles = new Set<string>();
    if (graph && avoidComponents) {
      for (const comp of graph.getAllComponents()) {
        if (ignoredIds.has(comp.id)) continue;
        ManhattanRouter.addComponentObstacles(comp, obstacles, start, end);
      }
    }

    // Determine grid search bounds
    const minX = Math.min(start.x, end.x) - margin;
    const maxX = Math.max(start.x, end.x) + margin;
    const minY = Math.min(start.y, end.y) - margin;
    const maxY = Math.max(start.y, end.y) + margin;

    const keyOf = (x: number, y: number, dir: Direction) => `${x},${y},${dir}`;
    const coordKey = (x: number, y: number) => `${x},${y}`;

    const heuristic = (x: number, y: number) => Math.abs(end.x - x) + Math.abs(end.y - y);

    const openSet = new MinHeap();
    const closedG = new Map<string, number>();

    const startNode: AStarNode = {
      x: start.x,
      y: start.y,
      dir: "none",
      g: 0,
      f: heuristic(start.x, start.y),
    };

    openSet.push(startNode);
    closedG.set(keyOf(start.x, start.y, "none"), 0);

    let goalNode: AStarNode | undefined;

    const neighbors: Array<{ dx: number; dy: number; dir: Direction }> = [
      { dx: 1, dy: 0, dir: "h" },
      { dx: -1, dy: 0, dir: "h" },
      { dx: 0, dy: 1, dir: "v" },
      { dx: 0, dy: -1, dir: "v" },
    ];

    while (openSet.size > 0) {
      const current = openSet.pop()!;

      if (current.x === end.x && current.y === end.y) {
        goalNode = current;
        break;
      }

      for (const { dx, dy, dir } of neighbors) {
        const nx = current.x + dx;
        const ny = current.y + dy;

        // Check bounds
        if (nx < minX || nx > maxX || ny < minY || ny > maxY) {
          continue;
        }

        // Check obstacles (target point is always allowed)
        if (nx !== end.x || ny !== end.y) {
          if (obstacles.has(coordKey(nx, ny))) {
            continue;
          }
        }

        // Calculate step cost: base length (1) + bend penalty if direction changes
        const isTurn = current.dir !== "none" && current.dir !== dir;
        const stepCost = 1 + (isTurn ? bendPenalty : 0);
        const tentativeG = current.g + stepCost;

        const neighborKey = keyOf(nx, ny, dir);
        const recordedG = closedG.get(neighborKey);

        if (recordedG === undefined || tentativeG < recordedG) {
          closedG.set(neighborKey, tentativeG);
          const neighborNode: AStarNode = {
            x: nx,
            y: ny,
            dir,
            g: tentativeG,
            f: tentativeG + heuristic(nx, ny),
            parent: current,
          };
          openSet.push(neighborNode);
        }
      }
    }

    if (!goalNode) {
      // Fallback to simple L-route if search fails or is partitioned
      return [
        { ...start },
        { x: end.x, y: start.y },
        { ...end },
      ];
    }

    // Reconstruct path
    const rawPath: Position[] = [];
    let curr: AStarNode | undefined = goalNode;
    while (curr) {
      rawPath.push({ x: curr.x, y: curr.y });
      curr = curr.parent;
    }
    rawPath.reverse();

    return simplifyOrthogonalPoints(rawPath);
  }

  /**
   * Adds the grid area occupied by a component body to the obstacle set,
   * excluding the exact start and end positions.
   */
  private static addComponentObstacles(
    comp: Component,
    obstacles: Set<string>,
    start: Position,
    end: Position,
  ): void {
    // Body box radius around component center
    const rx = 1;
    const ry = 1;

    for (let x = comp.position.x - rx; x <= comp.position.x + rx; x++) {
      for (let y = comp.position.y - ry; y <= comp.position.y + ry; y++) {
        // Do not block start or end points
        if ((x === start.x && y === start.y) || (x === end.x && y === end.y)) {
          continue;
        }
        obstacles.add(`${x},${y}`);
      }
    }
  }
}

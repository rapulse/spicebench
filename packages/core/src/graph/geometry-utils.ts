import { Position } from "../schema/geometry";
import { Wire } from "../schema/wire";

/**
 * Checks if a point lies on an orthogonal line segment between p1 and p2 (inclusive).
 */
export function isPointOnOrthogonalSegment(
  point: Position,
  p1: Position,
  p2: Position,
): boolean {
  if (p1.y === p2.y) {
    // Horizontal segment
    if (point.y !== p1.y) return false;
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    return point.x >= minX && point.x <= maxX;
  } else if (p1.x === p2.x) {
    // Vertical segment
    if (point.x !== p1.x) return false;
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    return point.y >= minY && point.y <= maxY;
  }
  return false;
}

/**
 * Checks if a point lies strictly between endpoints of an orthogonal line segment (excluding p1 and p2).
 */
export function isPointStrictlyInsideSegment(
  point: Position,
  p1: Position,
  p2: Position,
): boolean {
  if (isPointsEqual(point, p1) || isPointsEqual(point, p2)) {
    return false;
  }
  return isPointOnOrthogonalSegment(point, p1, p2);
}

/**
 * Checks if two grid positions are identical.
 */
export function isPointsEqual(p1: Position, p2: Position): boolean {
  return p1.x === p2.x && p1.y === p2.y;
}

/**
 * Calculates Manhattan distance between two grid points.
 */
export function manhattanDistance(p1: Position, p2: Position): number {
  return Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
}

/**
 * Finds which segment of a wire contains the given point.
 */
export function findSegmentOnWire(
  wire: Wire,
  point: Position,
): { segmentIndex: number; p1: Position; p2: Position } | undefined {
  for (let i = 0; i < wire.points.length - 1; i++) {
    const p1 = wire.points[i]!;
    const p2 = wire.points[i + 1]!;
    if (isPointOnOrthogonalSegment(point, p1, p2)) {
      return { segmentIndex: i, p1, p2 };
    }
  }
  return undefined;
}

/**
 * Simplifies a polyline by removing redundant colinear intermediate points.
 * E.g., (0,0) -> (5,0) -> (10,0) becomes (0,0) -> (10,0).
 */
export function simplifyOrthogonalPoints(points: Position[]): Position[] {
  if (points.length <= 2) return [...points];

  const result: Position[] = [points[0]!];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;

    // Check if curr is colinear between prev and next
    const isColinearHorizontal = prev.y === curr.y && curr.y === next.y;
    const isColinearVertical = prev.x === curr.x && curr.x === next.x;

    if (!isColinearHorizontal && !isColinearVertical) {
      result.push(curr);
    }
  }

  result.push(points[points.length - 1]!);
  return result;
}

/**
 * Creates a basic orthogonal 2-segment L-route between two positions.
 */
export function createSimpleOrthogonalRoute(
  start: Position,
  end: Position,
  horizontalFirst: boolean = true,
): Position[] {
  if (isPointsEqual(start, end)) {
    return [{ ...start }, { ...end }];
  }

  if (start.x === end.x || start.y === end.y) {
    // Already orthogonal single segment
    return [{ ...start }, { ...end }];
  }

  const corner: Position = horizontalFirst
    ? { x: end.x, y: start.y }
    : { x: start.x, y: end.y };

  return [{ ...start }, corner, { ...end }];
}

import { z } from "zod";

export const PositionSchema = z.object({
  x: z.number().int({ message: "Coordinate x must be an integer on the grid" }),
  y: z.number().int({ message: "Coordinate y must be an integer on the grid" }),
});

export type Position = z.infer<typeof PositionSchema>;

export const RotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);

export type Rotation = z.infer<typeof RotationSchema>;

/**
 * Rotates a 2D point clockwise by the given rotation angle (0, 90, 180, 270)
 * around an optional origin (defaults to 0,0).
 */
export function rotatePoint(
  point: Position,
  rotation: Rotation,
  origin: Position = { x: 0, y: 0 },
): Position {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;

  let rx = dx;
  let ry = dy;

  switch (rotation) {
    case 0:
      rx = dx;
      ry = dy;
      break;
    case 90:
      // Clockwise in screen coordinates where y points down:
      // (1, 0) -> (0, 1), (0, 1) -> (-1, 0)
      rx = -dy;
      ry = dx;
      break;
    case 180:
      rx = -dx;
      ry = -dy;
      break;
    case 270:
      rx = dy;
      ry = -dx;
      break;
  }

  return {
    x: Math.round(origin.x + rx),
    y: Math.round(origin.y + ry),
  };
}

/**
 * Normalizes any angle in degrees to 0 | 90 | 180 | 270.
 */
export function normalizeRotation(deg: number): Rotation {
  const mod = ((deg % 360) + 360) % 360;
  if (mod >= 45 && mod < 135) return 90;
  if (mod >= 135 && mod < 225) return 180;
  if (mod >= 225 && mod < 315) return 270;
  return 0;
}

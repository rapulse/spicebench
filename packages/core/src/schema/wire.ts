import { z } from "zod";
import { PositionSchema } from "./geometry";

export const PinEndpointSchema = z.object({
  componentId: z.string().min(1, "componentId cannot be empty"),
  pinId: z.string().min(1, "pinId cannot be empty"),
});

export type PinEndpoint = z.infer<typeof PinEndpointSchema>;

export const JunctionEndpointSchema = z.object({
  junctionId: z.string().min(1, "junctionId cannot be empty"),
});

export type JunctionEndpoint = z.infer<typeof JunctionEndpointSchema>;

export const WireEndpointSchema = z.union([PinEndpointSchema, JunctionEndpointSchema]);

export type WireEndpoint = z.infer<typeof WireEndpointSchema>;

export function isPinEndpoint(ep: WireEndpoint): ep is PinEndpoint {
  return "componentId" in ep && "pinId" in ep;
}

export function isJunctionEndpoint(ep: WireEndpoint): ep is JunctionEndpoint {
  return "junctionId" in ep;
}

export const JunctionSchema = z.object({
  id: z.string().min(1, "Junction ID cannot be empty"),
  position: PositionSchema,
});

export type Junction = z.infer<typeof JunctionSchema>;

export const WireSchema = z.object({
  id: z.string().min(1, "Wire ID cannot be empty"),
  from: WireEndpointSchema,
  to: WireEndpointSchema,
  points: z.array(PositionSchema).min(2, "Wire must contain at least 2 points (start and end)"),
  color: z.string().optional(),
});

export type Wire = z.infer<typeof WireSchema>;

/**
 * Checks whether all segments of the wire polyline are strictly orthogonal
 * (horizontal or vertical, no diagonal segments).
 */
export function isOrthogonalWire(wire: Wire): boolean {
  for (let i = 0; i < wire.points.length - 1; i++) {
    const p1 = wire.points[i]!;
    const p2 = wire.points[i + 1]!;
    const isHorizontal = p1.y === p2.y;
    const isVertical = p1.x === p2.x;
    if (!isHorizontal && !isVertical) {
      return false;
    }
  }
  return true;
}

/**
 * Computes total Manhattan length of wire in grid units.
 */
export function getWireLength(wire: Wire): number {
  let length = 0;
  for (let i = 0; i < wire.points.length - 1; i++) {
    const p1 = wire.points[i]!;
    const p2 = wire.points[i + 1]!;
    length += Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
  }
  return length;
}

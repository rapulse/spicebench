import { z } from "zod";
import { Position, PositionSchema, Rotation, RotationSchema, rotatePoint } from "./geometry";
import {
  COMPONENT_CATALOG,
  ComponentType,
  ComponentTypeSchema,
  PinDefinition,
} from "./component-types";

export const ComponentSchema = z.object({
  id: z.string().min(1, "Component ID cannot be empty"),
  type: ComponentTypeSchema,
  label: z.string().default(""),
  params: z.record(z.string()).default({}),
  position: PositionSchema,
  rotation: RotationSchema.default(0),
});

export type Component = z.infer<typeof ComponentSchema>;

/**
 * Returns the pin definitions for the given component type from the catalog.
 */
export function getComponentPins(type: ComponentType): PinDefinition[] {
  const meta = COMPONENT_CATALOG[type];
  if (!meta) {
    throw new Error(`Unknown component type: "${type}"`);
  }
  return meta.pins;
}

/**
 * Finds a specific pin definition by its ID for the given component type.
 */
export function getComponentPin(type: ComponentType, pinId: string): PinDefinition | undefined {
  const pins = getComponentPins(type);
  return pins.find((p) => p.id === pinId);
}

/**
 * Computes the absolute integer grid coordinate of a component's pin,
 * taking into account the component's position and rotation angle.
 */
export function getAbsolutePinPosition(comp: Component, pinId: string): Position {
  const pin = getComponentPin(comp.type, pinId);
  if (!pin) {
    throw new Error(
      `Pin "${pinId}" does not exist on component "${comp.id}" of type "${comp.type}"`,
    );
  }

  const rotatedOffset = rotatePoint(pin.offset, comp.rotation);

  return {
    x: comp.position.x + rotatedOffset.x,
    y: comp.position.y + rotatedOffset.y,
  };
}

/**
 * Factory to create a valid component with default catalog parameters and label.
 */
export function createDefaultComponent(
  type: ComponentType,
  id: string,
  position: Position,
  rotation: Rotation = 0,
  label?: string,
): Component {
  const meta = COMPONENT_CATALOG[type];
  return {
    id,
    type,
    label: label ?? (meta ? `${meta.prefix}${id}` : id),
    params: { ...(meta?.defaultParams ?? {}) },
    position,
    rotation,
  };
}

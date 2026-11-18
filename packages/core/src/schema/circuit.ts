import { z } from "zod";
import { ComponentSchema } from "./component";
import { WireSchema, JunctionSchema } from "./wire";
import { InstrumentStateSchema } from "./instrument";

export const CURRENT_SCHEMA_VERSION = 1;

export const CircuitMetadataSchema = z.object({
  name: z.string().default("Untitled Circuit"),
  description: z.string().optional(),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().optional(),
});

export type CircuitMetadata = z.infer<typeof CircuitMetadataSchema>;

export const CircuitProjectSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION).default(CURRENT_SCHEMA_VERSION),
  meta: CircuitMetadataSchema.default(() => ({
    name: "Untitled Circuit",
    createdAt: new Date().toISOString(),
  })),
  components: z.array(ComponentSchema).default([]),
  wires: z.array(WireSchema).default([]),
  junctions: z.array(JunctionSchema).default([]),
  instruments: z.array(InstrumentStateSchema).default([]),
});

export type CircuitProject = z.infer<typeof CircuitProjectSchema>;

/**
 * Creates an empty, valid circuit project template.
 */
export function createEmptyCircuit(name: string = "Untitled Circuit"): CircuitProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: {
      name,
      createdAt: now,
      updatedAt: now,
    },
    components: [],
    wires: [],
    junctions: [],
    instruments: [],
  };
}

/**
 * Validates untrusted JSON/object against CircuitProjectSchema.
 * Throws ZodError on validation failure.
 */
export function parseCircuitProject(data: unknown): CircuitProject {
  return CircuitProjectSchema.parse(data);
}

/**
 * Safely validates untrusted JSON/object without throwing.
 */
export function safeParseCircuitProject(data: unknown): {
  success: boolean;
  data?: CircuitProject;
  error?: z.ZodError;
} {
  const result = CircuitProjectSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}

/**
 * Serializes circuit project into standard 2-space indented JSON string.
 */
export function serializeCircuitProject(project: CircuitProject): string {
  return JSON.stringify(project, null, 2);
}

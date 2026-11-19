import type { SimulationData, SimulationErrorDetails } from "../parser/types";

/** Normalized output of any SPICE engine. */
export interface EngineRunOutput {
  data: SimulationData;
  /** Non-fatal ngspice notes and warnings (e.g. "has no value, DC 0 assumed"). */
  warnings: string[];
  /** Raw engine log of this run (captured console output / stdout). */
  log: string;
}

export interface SpiceEngine {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  /** Runs a netlist. Must reject with SimulationError; must stop within timeoutMs. */
  run(netlist: string, timeoutMs: number): Promise<EngineRunOutput>;
  dispose(): Promise<void>;
}

/** Structured simulation error. Message format `[CODE] text` is kept for MCP clients. */
export class SimulationError extends Error {
  public readonly details: SimulationErrorDetails;

  constructor(details: SimulationErrorDetails) {
    const elems = [...(details.problematicComponents ?? []), ...(details.problematicNodes ?? [])];
    super(
      `[${details.code}] ${details.message}${elems.length > 0 ? `\nProblematic elements: ${elems.join(", ")}` : ""}`,
    );
    this.name = "SimulationError";
    this.details = details;
  }
}

/** Extracts SPICE element / node references from ngspice error lines. */
export function extractProblematicElements(lines: string[]): {
  problematicComponents: string[];
  problematicNodes: string[];
} {
  const comps = new Set<string>();
  const nodes = new Set<string>();
  for (const line of lines) {
    // Quoted instance line: "Warning: 'r1 n001' is not a valid resistor instance line"
    for (const m of line.matchAll(/'([A-Za-z][A-Za-z0-9_]*)[\s']/g)) {
      if (m[1]) comps.add(m[1].toLowerCase());
    }
    // Echoed source line after "Error on line N": "  abr1 [a b] [da db] adc1"
    const echo = /^\s+([A-Za-z][A-Za-z0-9_]*)\s/.exec(line);
    if (echo?.[1]) comps.add(echo[1].toLowerCase());
    for (const m of line.matchAll(/\b(?:device|element)\s+'?([A-Za-z][A-Za-z0-9_]*)/gi)) {
      if (m[1]) comps.add(m[1].toLowerCase());
    }
    for (const m of line.matchAll(/\bnode\s+'?([A-Za-z0-9_]+)/gi)) {
      if (m[1]) nodes.add(m[1].toLowerCase());
    }
  }
  return { problematicComponents: [...comps], problematicNodes: [...nodes] };
}

import {
  type CircuitGraph,
  type Component,
  type ElectricalNet,
  parseEngineeringValue,
} from "@spicebench/core";

/**
 * A pin is connected when its net is ground or contains at least one other pin.
 * NetExtractor creates a single-pin net for a dangling pin; treating it as a node would
 * produce floating sub-circuits (singular matrix) or fake 0 V readings.
 */
export function isPinConnected(nets: ElectricalNet[], componentId: string, pinId: string): boolean {
  const net = nets.find((n) => n.pins.some((p) => p.componentId === componentId && p.pinId === pinId));
  if (!net) return false;
  return net.isGround || net.pins.length > 1;
}

/**
 * Effective settings of virtual instruments (ADR-011).
 *
 * Instrument settings can be written from two places: the instrument window
 * (`circuit.instruments[]`, InstrumentState) and component params (MCP `update_component`).
 * CircuitSession keeps them in sync; here InstrumentState wins when present so that what the
 * user sees in the instrument window is exactly what gets simulated.
 */

export type MultimeterMode = "V" | "A" | "R" | "dB";

export interface MultimeterSettings {
  mode: MultimeterMode;
  coupling: "DC" | "AC";
}

export interface FunctionGeneratorSettings {
  waveform: "sine" | "square" | "triangle";
  frequencyHz: number;
  amplitudeV: number;
  offsetV: number;
  /** 1..99 % */
  dutyCycle: number;
}

export interface OscilloscopeSettings {
  timebaseSecPerDiv: number;
}

export interface BodePlotterSettings {
  fstartHz: number;
  fstopHz: number;
}

/** Oscilloscope screen width in divisions (EWB: 10). */
export const SCOPE_DIVISIONS = 10;
/** Ohmmeter test current (A). */
export const OHMMETER_TEST_CURRENT = 1e-3;

function num(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    try {
      // "1ms/div" -> "1ms", "5V/div" -> "5V"
      return parseEngineeringValue(value.replace(/\/div$/i, "")).value;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function merged(graph: CircuitGraph, comp: Component): Record<string, unknown> {
  const state = graph.getInstrument(comp.id) as Record<string, unknown> | undefined;
  return { ...comp.params, ...(state ?? {}) };
}

export function getMultimeterSettings(graph: CircuitGraph, comp: Component): MultimeterSettings {
  const s = merged(graph, comp);
  const rawMode = String(s["mode"] ?? "V");
  const mode: MultimeterMode =
    rawMode === "A" || rawMode === "R" || rawMode === "dB" ? rawMode : rawMode === "Omega" ? "R" : "V";
  const coupling = String(s["currentType"] ?? "DC").toUpperCase() === "AC" ? "AC" : "DC";
  return { mode, coupling };
}

export function getFunctionGeneratorSettings(
  graph: CircuitGraph,
  comp: Component,
): FunctionGeneratorSettings {
  const s = merged(graph, comp);
  const w = String(s["waveform"] ?? "sine");
  const waveform = w === "square" || w === "triangle" ? w : "sine";
  const duty = Math.min(99, Math.max(1, num(s["dutyCycle"], 50)));
  return {
    waveform,
    frequencyHz: Math.max(1e-6, num(s["frequency"], 1000)),
    amplitudeV: num(s["amplitude"], 5),
    offsetV: num(s["offset"], 0),
    dutyCycle: duty,
  };
}

export function getOscilloscopeSettings(graph: CircuitGraph, comp: Component): OscilloscopeSettings {
  const s = merged(graph, comp);
  return { timebaseSecPerDiv: Math.max(1e-9, num(s["timebase"], 1e-3)) };
}

export function getBodePlotterSettings(graph: CircuitGraph, comp: Component): BodePlotterSettings {
  const s = merged(graph, comp);
  let fstartHz = Math.max(1e-3, num(s["fstart"], 10));
  let fstopHz = Math.max(1e-3, num(s["fstop"], 100e3));
  if (fstopHz < fstartHz) [fstartHz, fstopHz] = [fstopHz, fstartHz];
  if (fstopHz === fstartHz) fstopHz = fstartHz * 10;
  return { fstartHz, fstopHz };
}

/**
 * Transient window derived from instruments when the caller did not specify one:
 * one oscilloscope screen (10 div × timebase); without a scope — 5 periods of the
 * slowest function generator; otherwise 10 ms. Step resolves ≥ 50 points per generator period.
 */
/** Frequencies of periodic sources (function generators, AC sources, pulse sources). */
export function signalFrequencies(graph: CircuitGraph): number[] {
  const out: number[] = [];
  for (const c of graph.getAllComponents()) {
    if (c.type === "FUNCTION_GENERATOR") out.push(getFunctionGeneratorSettings(graph, c).frequencyHz);
    else if (c.type === "AC_VOLTAGE_SOURCE") out.push(num(c.params["frequency"], 60));
    else if (c.type === "AC_CURRENT_SOURCE") out.push(num(c.params["frequency"], 1));
    else if (c.type === "PULSE_VOLTAGE_SOURCE") {
      const period = num(c.params["period"], 0);
      if (period > 0) out.push(1 / period);
    }
  }
  return out.filter((f) => f > 0 && Number.isFinite(f));
}

export function deriveTranWindow(graph: CircuitGraph): { tstop: number; tstep: number } {
  const comps = graph.getAllComponents();
  const scopes = comps.filter((c) => c.type === "OSCILLOSCOPE");
  const freqs = signalFrequencies(graph);

  let tstop: number;
  if (scopes.length > 0) {
    tstop = Math.max(...scopes.map((s) => getOscilloscopeSettings(graph, s).timebaseSecPerDiv)) * SCOPE_DIVISIONS;
  } else if (freqs.length > 0) {
    tstop = 5 / Math.min(...freqs);
  } else {
    tstop = 10e-3;
  }
  let tstep = tstop / 1000;
  if (freqs.length > 0) tstep = Math.min(tstep, 1 / (Math.max(...freqs) * 50));
  // Keep the point count bounded (≈ 100k) so a run stays well inside the timeout.
  tstep = Math.max(tstep, tstop / 100_000);
  return { tstop, tstep };
}

/** AC sweep derived from Bode plotters (union of their ranges), 50 points/decade. */
export function deriveAcSweep(graph: CircuitGraph): { fstart: number; fstop: number; points: number } {
  const bodes = graph.getAllComponents().filter((c) => c.type === "BODE_PLOTTER");
  if (bodes.length === 0) return { fstart: 10, fstop: 100e3, points: 50 };
  const ranges = bodes.map((b) => getBodePlotterSettings(graph, b));
  return {
    fstart: Math.min(...ranges.map((r) => r.fstartHz)),
    fstop: Math.max(...ranges.map((r) => r.fstopHz)),
    points: 50,
  };
}

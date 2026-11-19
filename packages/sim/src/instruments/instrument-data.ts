import type { CircuitGraph, Component } from "@spicebench/core";
import type { CompiledNetlist } from "../compiler/netlist-compiler";
import {
  OHMMETER_TEST_CURRENT,
  getBodePlotterSettings,
  getFunctionGeneratorSettings,
  getMultimeterSettings,
  getOscilloscopeSettings,
  isPinConnected,
  signalFrequencies,
  type MultimeterMode,
} from "../compiler/instrument-settings";
import type { AcResult, OpResult, SimulationResult, TranResult } from "../parser/types";

/**
 * Instrument readings computed in the backend from ngspice results (ADR-011).
 * The renderer only draws these; MCP `read_instrument` returns the same numbers.
 *
 * Rule: when a value cannot be measured (pin not connected, no suitable analysis,
 * ohmmeter in a powered circuit) the value is `null` with a `status`/`note`,
 * never a fake 0.
 */

export type InstrumentStatus =
  | "ok"
  | "not_connected"
  | "no_data" // required analysis was not run / did not produce the vectors
  | "invalid"; // measurement is not meaningful (e.g. ohmmeter with active sources)

export interface MultimeterData {
  type: "MULTIMETER";
  id: string;
  status: InstrumentStatus;
  mode: MultimeterMode;
  coupling: "DC" | "AC";
  /** V for V, A for A, Ohm for R, dB (re 1 V, see DB_REFERENCE_V) for dB. */
  value: number | null;
  unit: "V" | "A" | "Ohm" | "dB";
  /** Analysis the value was computed from. */
  source: "op" | "tran" | null;
  note?: string;
}

export interface OscilloscopeData {
  type: "OSCILLOSCOPE";
  id: string;
  status: InstrumentStatus;
  timebaseSecPerDiv: number;
  time: number[];
  /** Differential V(A+) - V(A-); null when the channel's "+" is not connected. */
  chA: number[] | null;
  chB: number[] | null;
  note?: string;
}

export interface BodePlotterData {
  type: "BODE_PLOTTER";
  id: string;
  status: InstrumentStatus;
  fstartHz: number;
  fstopHz: number;
  frequency: number[];
  /** 20·log10|H|, H = V(OUT+,OUT-) / V(IN+,IN-) */
  magnitudeDb: number[];
  /** arg(H) in degrees, unwrapped */
  phaseDeg: number[];
  note?: string;
}

export interface FunctionGeneratorData {
  type: "FUNCTION_GENERATOR";
  id: string;
  status: InstrumentStatus;
  waveform: "sine" | "square" | "triangle";
  frequencyHz: number;
  amplitudeV: number;
  offsetV: number;
  dutyCycle: number;
}

export type InstrumentData = MultimeterData | OscilloscopeData | BodePlotterData | FunctionGeneratorData;

/** Reference for the multimeter dB mode: 0 dB = 1 V. TODO(ui): confirm against EWB 5.12. */
export const DB_REFERENCE_V = 1;

export interface AnalysisResults {
  op?: SimulationResult;
  tran?: SimulationResult;
  ac?: SimulationResult;
}

interface Ctx {
  graph: CircuitGraph;
  compiled: CompiledNetlist;
}

/** SPICE node of a pin, or null if the pin is not wired to anything. */
function nodeOf(ctx: Ctx, compId: string, pinId: string): string | null {
  if (!isPinConnected(ctx.compiled.nets, compId, pinId)) return null;
  const n = ctx.compiled.nodeMap.get(`${compId}:${pinId}`);
  return n ? n.toLowerCase() : null;
}

function opVoltage(op: OpResult, node: string): number | undefined {
  return node === "0" ? 0 : op.nodeVoltages[node];
}

function tranVoltage(tran: TranResult, node: string): number[] | undefined {
  return node === "0" ? new Array<number>(tran.time.length).fill(0) : tran.variables[`v(${node})`];
}

/**
 * Settled part of the transient window: the second half, trimmed to a whole number of periods of
 * the slowest periodic source (so mean/RMS have no partial-period bias). Falls back to the second half.
 */
function settledRange(time: number[], graph: CircuitGraph): [number, number] {
  const tEnd = time.at(-1) ?? 0;
  const tBegin = time[0] ?? 0;
  let t0 = tBegin + (tEnd - tBegin) / 2;
  const freqs = signalFrequencies(graph);
  if (freqs.length > 0) {
    const T = 1 / Math.min(...freqs);
    const periods = Math.floor((tEnd - t0) / T + 1e-9);
    if (periods >= 1) t0 = tEnd - periods * T;
  }
  let start = time.findIndex((t) => t >= t0 - 1e-15);
  if (start < 0) start = 0;
  return [start, time.length];
}

/** Time-weighted mean and AC-RMS (RMS of v - mean) over [a, b). */
function timeStats(time: number[], v: number[], a: number, b: number): { mean: number; acRms: number } {
  if (b - a < 2) return { mean: v[a] ?? 0, acRms: 0 };
  let area = 0;
  let area2 = 0;
  for (let i = a + 1; i < b; i++) {
    const dt = time[i]! - time[i - 1]!;
    area += 0.5 * (v[i]! + v[i - 1]!) * dt;
    area2 += 0.5 * (v[i]! * v[i]! + v[i - 1]! * v[i - 1]!) * dt;
  }
  const T = time[b - 1]! - time[a]!;
  const mean = area / T;
  return { mean, acRms: Math.sqrt(Math.max(0, area2 / T - mean * mean)) };
}

function hasActiveSources(graph: CircuitGraph, except: string): boolean {
  const active = new Set([
    "DC_VOLTAGE_SOURCE",
    "AC_VOLTAGE_SOURCE",
    "DC_CURRENT_SOURCE",
    "PULSE_VOLTAGE_SOURCE",
    "FUNCTION_GENERATOR",
  ]);
  return graph.getAllComponents().some((c) => c.id !== except && active.has(c.type));
}

function multimeter(ctx: Ctx, comp: Component, r: AnalysisResults): MultimeterData {
  const { mode, coupling } = getMultimeterSettings(ctx.graph, comp);
  const unit = mode === "A" ? "A" : mode === "R" ? "Ohm" : mode === "dB" ? "dB" : "V";
  const base = { type: "MULTIMETER" as const, id: comp.id, mode, coupling, unit } as const;
  const pos = nodeOf(ctx, comp.id, "pos");
  const neg = nodeOf(ctx, comp.id, "neg");
  if (!pos || !neg) {
    return { ...base, status: "not_connected", value: null, source: null, note: "Both probes must be connected" };
  }

  if (mode === "R") {
    if (hasActiveSources(ctx.graph, comp.id)) {
      return {
        ...base,
        status: "invalid",
        value: null,
        source: null,
        note: "Ohmmeter needs a circuit without active sources",
      };
    }
    const op = r.op?.data as OpResult | undefined;
    const vp = op && opVoltage(op, pos);
    const vn = op && opVoltage(op, neg);
    if (vp === undefined || vn === undefined) return { ...base, status: "no_data", value: null, source: null };
    return { ...base, status: "ok", value: (vp - vn) / OHMMETER_TEST_CURRENT, source: "op" };
  }

  // Signal: voltage across probes or current through the sense source.
  const senseVec = `v_${comp.id.toLowerCase()}_sense`;
  const tran = r.tran?.data as TranResult | undefined;
  const op = r.op?.data as OpResult | undefined;
  const wantTran = coupling === "AC" || (!op && !!tran);

  let reading: number | undefined;
  let source: "op" | "tran" | null = null;
  if (wantTran && tran) {
    let sig: number[] | undefined;
    if (mode === "A") sig = tran.variables[`i(${senseVec})`];
    else {
      const a = tranVoltage(tran, pos);
      const b = tranVoltage(tran, neg);
      sig = a && b ? a.map((x, i) => x - b[i]!) : undefined;
    }
    if (sig) {
      const [i0, i1] = settledRange(tran.time, ctx.graph);
      const st = timeStats(tran.time, sig, i0, i1);
      reading = coupling === "AC" ? st.acRms : st.mean;
      source = "tran";
    }
  } else if (op) {
    if (mode === "A") reading = op.branchCurrents[senseVec];
    else {
      const a = opVoltage(op, pos);
      const b = opVoltage(op, neg);
      reading = a !== undefined && b !== undefined ? a - b : undefined;
    }
    if (reading !== undefined) source = "op";
    if (coupling === "AC" && reading !== undefined) reading = 0; // DC point has no AC component
  }

  if (reading === undefined) return { ...base, status: "no_data", value: null, source: null };
  if (mode === "dB") {
    const mag = Math.abs(reading);
    return {
      ...base,
      status: "ok",
      value: mag > 0 ? 20 * Math.log10(mag / DB_REFERENCE_V) : Number.NEGATIVE_INFINITY,
      source,
    };
  }
  return { ...base, status: "ok", value: reading, source };
}

function oscilloscope(ctx: Ctx, comp: Component, r: AnalysisResults): OscilloscopeData {
  const { timebaseSecPerDiv } = getOscilloscopeSettings(ctx.graph, comp);
  const base = { type: "OSCILLOSCOPE" as const, id: comp.id, timebaseSecPerDiv };
  const tran = r.tran?.data as TranResult | undefined;
  if (!tran) return { ...base, status: "no_data", time: [], chA: null, chB: null, note: "No transient analysis" };

  const channel = (p: string, n: string): number[] | null => {
    const pp = nodeOf(ctx, comp.id, p);
    if (!pp) return null;
    // Unconnected "-" input is referenced to ground, as on the EWB scope.
    const nn = nodeOf(ctx, comp.id, n) ?? "0";
    const a = tranVoltage(tran, pp);
    const b = tranVoltage(tran, nn);
    return a && b ? a.map((x, i) => x - b[i]!) : null;
  };
  const chA = channel("ch_a_pos", "ch_a_neg");
  const chB = channel("ch_b_pos", "ch_b_neg");
  return {
    ...base,
    status: chA || chB ? "ok" : "not_connected",
    time: tran.time,
    chA,
    chB,
  };
}

function bode(ctx: Ctx, comp: Component, r: AnalysisResults): BodePlotterData {
  const { fstartHz, fstopHz } = getBodePlotterSettings(ctx.graph, comp);
  const base = { type: "BODE_PLOTTER" as const, id: comp.id, fstartHz, fstopHz };
  const empty = { frequency: [], magnitudeDb: [], phaseDeg: [] };
  const ac = r.ac?.data as AcResult | undefined;
  const inP = nodeOf(ctx, comp.id, "in_pos");
  const outP = nodeOf(ctx, comp.id, "out_pos");
  if (!inP || !outP) return { ...base, ...empty, status: "not_connected", note: "IN+ and OUT+ must be connected" };
  if (!ac) return { ...base, ...empty, status: "no_data", note: "No AC analysis" };

  const inN = nodeOf(ctx, comp.id, "in_neg") ?? "0";
  const outN = nodeOf(ctx, comp.id, "out_neg") ?? "0";
  const vec = (node: string) =>
    node === "0" ? ac.frequency.map(() => ({ real: 0, imag: 0 })) : ac.complexValues[`v(${node})`];
  const [ip, inn, op, on] = [vec(inP), vec(inN), vec(outP), vec(outN)];
  if (!ip || !inn || !op || !on) return { ...base, ...empty, status: "no_data" };

  const frequency: number[] = [];
  const magnitudeDb: number[] = [];
  const phaseDeg: number[] = [];
  let prevPhase: number | undefined;
  let zeroInput = false;
  for (let i = 0; i < ac.frequency.length; i++) {
    const f = ac.frequency[i]!;
    if (f < fstartHz * (1 - 1e-9) || f > fstopHz * (1 + 1e-9)) continue;
    const ir = ip[i]!.real - inn[i]!.real;
    const ii = ip[i]!.imag - inn[i]!.imag;
    const or = op[i]!.real - on[i]!.real;
    const oi = op[i]!.imag - on[i]!.imag;
    const den = ir * ir + ii * ii;
    if (den < 1e-30) {
      zeroInput = true;
      continue;
    }
    const hr = (or * ir + oi * ii) / den;
    const hi = (oi * ir - or * ii) / den;
    const mag = Math.hypot(hr, hi);
    let ph = (Math.atan2(hi, hr) * 180) / Math.PI;
    if (prevPhase !== undefined) {
      while (ph - prevPhase > 180) ph -= 360;
      while (ph - prevPhase < -180) ph += 360;
    }
    prevPhase = ph;
    frequency.push(f);
    magnitudeDb.push(mag > 1e-15 ? 20 * Math.log10(mag) : -300);
    phaseDeg.push(ph);
  }
  if (frequency.length === 0) {
    return {
      ...base,
      ...empty,
      status: "no_data",
      note: zeroInput ? "Input signal is zero: the circuit needs an AC source" : "No points in range",
    };
  }
  return { ...base, status: "ok", frequency, magnitudeDb, phaseDeg };
}

function functionGenerator(ctx: Ctx, comp: Component): FunctionGeneratorData {
  const g = getFunctionGeneratorSettings(ctx.graph, comp);
  return { type: "FUNCTION_GENERATOR", id: comp.id, status: "ok", ...g };
}

/** Which analyses the instruments of this circuit need on "Power On". */
export function requiredAnalyses(graph: CircuitGraph): Array<"op" | "tran" | "ac"> {
  const comps = graph.getAllComponents();
  const set = new Set<"op" | "tran" | "ac">();
  const timeSources = comps.some((c) =>
    ["AC_VOLTAGE_SOURCE", "PULSE_VOLTAGE_SOURCE", "FUNCTION_GENERATOR", "TIMER_555"].includes(c.type),
  );
  for (const c of comps) {
    if (c.type === "BODE_PLOTTER") set.add("ac");
    if (c.type === "OSCILLOSCOPE") set.add("tran");
    if (c.type === "MULTIMETER") {
      const { mode, coupling } = getMultimeterSettings(graph, c);
      if (mode === "R") set.add("op");
      else if (coupling === "AC" || timeSources) set.add("tran");
      else set.add("op");
    }
  }
  if (set.size === 0) set.add(timeSources ? "tran" : "op");
  return [...set];
}

export function computeInstrumentData(
  graph: CircuitGraph,
  compiled: CompiledNetlist,
  results: AnalysisResults,
): Record<string, InstrumentData> {
  const ctx: Ctx = { graph, compiled };
  const out: Record<string, InstrumentData> = {};
  for (const comp of graph.getAllComponents()) {
    switch (comp.type) {
      case "MULTIMETER":
        out[comp.id] = multimeter(ctx, comp, results);
        break;
      case "OSCILLOSCOPE":
        out[comp.id] = oscilloscope(ctx, comp, results);
        break;
      case "BODE_PLOTTER":
        out[comp.id] = bode(ctx, comp, results);
        break;
      case "FUNCTION_GENERATOR":
        out[comp.id] = functionGenerator(ctx, comp);
        break;
    }
  }
  return out;
}

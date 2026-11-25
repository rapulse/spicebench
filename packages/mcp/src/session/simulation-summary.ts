import type {
  AcResult,
  CompiledNetlist,
  InstrumentData,
  OpResult,
  SimulationMode,
  SimulationResult,
  TranResult,
} from "@spicebench/sim";

/**
 * Compact, agent- and UI-friendly view of a simulation run.
 * Internal subcircuit vectors (names with ".", e.g. `v(x_u1.int)`, `i(b.x_u1.b_out)`) are
 * omitted from the summary; they remain available in `rawResult`.
 */
export interface SimulationSummary {
  mode: SimulationMode;
  /** All analyses executed in this run (Power On may run op + tran + ac). */
  analyses: SimulationMode[];
  success: boolean;
  durationMs: number;
  /** Simulator that produced the result, e.g. "ngspice-wasm". */
  engine: string;
  /** Non-fatal ngspice notes/warnings of all analyses. */
  warnings: string[];
  pinVoltages?: Record<string, number>;
  nodeVoltages?: Record<string, number>;
  branchCurrents?: Record<string, number>;
  timeRange?: { start: number; stop: number; points: number };
  signalsSummary?: Record<string, { min: number; max: number; avg: number; rms: number; last: number }>;
  samples?: {
    timeOrFreq: number[];
    values: Record<string, number[]>;
  };
  /** Peak over node voltages only (currents and internal nodes excluded). */
  acSummary?: {
    peakFrequency: number;
    peakMagnitudeDb: number;
    peakMagnitudeLinear: number;
    signal: string;
  };
  /** Per-instrument readings computed from ngspice results (ADR-011). Key = component id. */
  instruments: Record<string, InstrumentData>;
  /** Full result of the primary analysis (large; not sent to MCP clients). */
  rawResult?: SimulationResult;
}

export interface InstrumentReading {
  instrumentId: string;
  type: "MULTIMETER" | "OSCILLOSCOPE" | "BODE_PLOTTER" | "FUNCTION_GENERATOR" | "VOLTMETER" | "AMMETER";
  status: InstrumentData["status"];
  readings: Record<string, unknown>;
  formatted: string;
}

export const isInternalVector = (name: string): boolean => name.includes(".");

function stripInternal<T>(rec: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(rec).filter(([k]) => !isInternalVector(k)));
}

export function buildSimulationSummary(
  primary: SimulationResult,
  compiled: CompiledNetlist,
  all: SimulationResult[],
  instruments: Record<string, InstrumentData>,
): SimulationSummary {
  const summary: SimulationSummary = {
    mode: primary.mode,
    analyses: all.map((r) => r.mode),
    success: all.every((r) => r.success),
    durationMs: all.reduce((s, r) => s + r.durationMs, 0),
    engine: primary.engine,
    warnings: [...new Set(all.flatMap((r) => r.warnings))],
    instruments,
    rawResult: primary,
  };

  // Operating point (from any op run in this batch, else from the primary if it is op)
  const opRun = all.find((r) => r.mode === "op");
  if (opRun) {
    const op = opRun.data as OpResult;
    summary.nodeVoltages = stripInternal(op.nodeVoltages);
    summary.branchCurrents = stripInternal(op.branchCurrents);
    const pinVoltages: Record<string, number> = {};
    for (const [pinKey, spiceNode] of compiled.nodeMap.entries()) {
      const node = spiceNode.toLowerCase();
      const v = node === "0" ? 0 : op.nodeVoltages[node];
      // Unconnected pins (N_FLT_*) or missing vectors are omitted, never reported as 0 V.
      if (v !== undefined && !node.startsWith("n_flt_")) pinVoltages[pinKey] = v;
    }
    summary.pinVoltages = pinVoltages;
  }

  const tranRun = all.find((r) => r.mode === "tran");
  if (tranRun) {
    const tran = tranRun.data as TranResult;
    const signals = stripInternal(tran.variables);
    const n = tran.time.length;
    summary.timeRange = { start: tran.time[0] ?? 0, stop: tran.time[n - 1] ?? 0, points: n };

    const stats: NonNullable<SimulationSummary["signalsSummary"]> = {};
    for (const [sig, vals] of Object.entries(signals)) {
      if (vals.length === 0) continue;
      let min = vals[0]!;
      let max = vals[0]!;
      let sum = 0;
      let sumSq = 0;
      for (const v of vals) {
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
        sumSq += v * v;
      }
      stats[sig] = { min, max, avg: sum / vals.length, rms: Math.sqrt(sumSq / vals.length), last: vals.at(-1)! };
    }
    summary.signalsSummary = stats;

    const step = Math.max(1, Math.floor(n / 40));
    const t: number[] = [];
    const values: Record<string, number[]> = Object.fromEntries(Object.keys(signals).map((k) => [k, []]));
    for (let i = 0; i < n; i += step) {
      t.push(tran.time[i]!);
      for (const [sig, vals] of Object.entries(signals)) values[sig]!.push(vals[i]!);
    }
    summary.samples = { timeOrFreq: t, values };
  }

  const acRun = all.find((r) => r.mode === "ac");
  if (acRun) {
    const ac = acRun.data as AcResult;
    const voltages = Object.entries(ac.magnitudeDb).filter(([k]) => k.startsWith("v(") && !isInternalVector(k));
    let best = { db: Number.NEGATIVE_INFINITY, f: 0, sig: "" };
    for (const [sig, dbs] of voltages) {
      dbs.forEach((db, i) => {
        if (db > best.db) best = { db, f: ac.frequency[i]!, sig };
      });
    }
    if (best.sig) {
      summary.acSummary = {
        peakFrequency: best.f,
        peakMagnitudeDb: best.db,
        peakMagnitudeLinear: Math.pow(10, best.db / 20),
        signal: best.sig,
      };
    }
    if (!tranRun) {
      const n = ac.frequency.length;
      const step = Math.max(1, Math.floor(n / 30));
      const f: number[] = [];
      const values: Record<string, number[]> = Object.fromEntries(voltages.map(([k]) => [k, []]));
      for (let i = 0; i < n; i += step) {
        f.push(ac.frequency[i]!);
        for (const [sig, dbs] of voltages) values[sig]!.push(dbs[i]!);
      }
      summary.samples = { timeOrFreq: f, values };
    }
  }

  return summary;
}

const fmt = (v: number, unit: string): string => {
  if (!Number.isFinite(v)) return `${v < 0 ? "-" : ""}∞ ${unit}`;
  const a = Math.abs(v);
  const prefixes: Array<[number, string]> = [
    [1e9, "G"],
    [1e6, "M"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
    [1e-12, "p"],
  ];
  const [scale, p] = a === 0 ? [1, ""] : (prefixes.find(([s]) => a >= s) ?? [1e-12, "p"]);
  return `${(v / scale).toFixed(3)} ${p}${unit}`;
};

/** Human-readable reading for MCP `read_instrument`, built from the same InstrumentData as the UI. */
export function formatInstrumentReading(d: InstrumentData): InstrumentReading {
  const base = { instrumentId: d.id, type: d.type, status: d.status };
  switch (d.type) {
    case "MULTIMETER": {
      const unit = d.unit === "Ohm" ? "Ω" : d.unit;
      const formatted =
        d.value === null
          ? `${d.status}${d.note ? `: ${d.note}` : ""}`
          : d.unit === "dB"
            ? `${Number.isFinite(d.value) ? d.value.toFixed(2) : "-∞"} dB`
            : `${fmt(d.value, unit)} ${d.coupling}`;
      return { ...base, readings: { ...d }, formatted };
    }
    case "OSCILLOSCOPE": {
      const metrics = (v: number[] | null) => {
        if (!v || v.length === 0) return null;
        const min = Math.min(...v);
        const max = Math.max(...v);
        const rms = Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
        return { vpp: max - min, min, max, vrms: rms };
      };
      const a = metrics(d.chA);
      const b = metrics(d.chB);
      const ch = (name: string, m: ReturnType<typeof metrics>) =>
        m ? `${name}: Vpp=${fmt(m.vpp, "V")}, Vrms=${fmt(m.vrms, "V")}` : `${name}: not connected`;
      return {
        ...base,
        readings: { channelA: a, channelB: b, timebaseSecPerDiv: d.timebaseSecPerDiv, points: d.time.length },
        formatted: d.status === "no_data" ? `no_data: ${d.note ?? ""}` : `${ch("CH A", a)} | ${ch("CH B", b)}`,
      };
    }
    case "BODE_PLOTTER": {
      if (d.status !== "ok") {
        return { ...base, readings: { status: d.status }, formatted: `${d.status}${d.note ? `: ${d.note}` : ""}` };
      }
      let iPeak = 0;
      d.magnitudeDb.forEach((v, i) => {
        if (v > d.magnitudeDb[iPeak]!) iPeak = i;
      });
      const peak = { frequency: d.frequency[iPeak]!, gainDb: d.magnitudeDb[iPeak]!, phaseDeg: d.phaseDeg[iPeak]! };
      return {
        ...base,
        readings: { peakFrequency: peak.frequency, peakGainDb: peak.gainDb, phaseAtPeakDeg: peak.phaseDeg, points: d.frequency.length },
        formatted: `Peak: ${peak.gainDb.toFixed(2)} dB @ ${fmt(peak.frequency, "Hz")}, phase ${peak.phaseDeg.toFixed(1)}°`,
      };
    }
    case "FUNCTION_GENERATOR":
      return {
        ...base,
        readings: { ...d },
        formatted: `FuncGen: ${d.waveform.toUpperCase()} ${fmt(d.amplitudeV, "V")} @ ${fmt(d.frequencyHz, "Hz")}, offset ${fmt(d.offsetV, "V")}, duty ${d.dutyCycle}%`,
      };
    case "VOLTMETER":
    case "AMMETER": {
      const formatted =
        d.value === null
          ? `${d.status}${d.note ? `: ${d.note}` : ""}`
          : `${fmt(d.value, d.unit)} ${d.coupling}`;
      return { ...base, readings: { ...d }, formatted };
    }
  }
}

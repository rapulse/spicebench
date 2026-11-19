import type { ResultType } from "eecircuit-engine";
import type { AcResult, DcResult, OpResult, SimulationData, TranResult } from "./types";

/**
 * Converts the structured result of eecircuit-engine (ngspice WASM) into SimulationData.
 * Variable naming follows ngspice: `v(node)`, `i(vsource)`, all lowercase.
 */
export function convertNgspiceResult(result: ResultType): SimulationData {
  const plotname = /Plotname:\s*(.+)/i.exec(result.header)?.[1]?.trim().toLowerCase() ?? "";

  if (result.dataType === "complex") {
    const freqVar = result.data.find((d) => d.type === "frequency") ?? result.data[0];
    const ac: AcResult = {
      mode: "ac",
      frequency: freqVar ? freqVar.values.map((c) => c.real) : [],
      magnitudeDb: {},
      phaseDeg: {},
      complexValues: {},
    };
    for (const d of result.data) {
      if (d === freqVar) continue;
      const name = d.name.toLowerCase();
      ac.complexValues[name] = d.values.map((c) => ({ real: c.real, imag: c.img }));
      ac.magnitudeDb[name] = d.values.map((c) => {
        const mag = Math.hypot(c.real, c.img);
        return mag > 1e-12 ? 20 * Math.log10(mag) : -240;
      });
      ac.phaseDeg[name] = d.values.map((c) => (Math.atan2(c.img, c.real) * 180) / Math.PI);
    }
    return ac;
  }

  const timeVar = result.data.find((d) => d.type === "time");
  if (timeVar || plotname.startsWith("transient")) {
    const tran: TranResult = { mode: "tran", time: timeVar ? [...timeVar.values] : [], variables: {} };
    for (const d of result.data) {
      if (d === timeVar) continue;
      tran.variables[d.name.toLowerCase()] = [...d.values];
    }
    return tran;
  }

  if (plotname.startsWith("dc transfer")) {
    const [sweep, ...rest] = result.data;
    const dc: DcResult = {
      mode: "dc",
      sweepSource: sweep?.name.toLowerCase() ?? "sweep",
      sweepValues: sweep ? [...sweep.values] : [],
      variables: {},
    };
    for (const d of rest) dc.variables[d.name.toLowerCase()] = [...d.values];
    return dc;
  }

  const op: OpResult = { mode: "op", nodeVoltages: {}, branchCurrents: {} };
  for (const d of result.data) {
    const name = d.name.toLowerCase();
    const value = d.values[0] ?? 0;
    const v = /^v\((.+)\)$/.exec(name);
    const i = /^i\((.+)\)$/.exec(name);
    if (v?.[1]) op.nodeVoltages[v[1]] = value;
    else if (i?.[1]) op.branchCurrents[i[1]] = value;
    else if (d.type === "current") op.branchCurrents[name.replace(/#branch$/, "")] = value;
    else op.nodeVoltages[name] = value;
  }
  return op;
}

const FATAL_PATTERN =
  /(^|\s)error\b|fatal|circuit not parsed|simulation interrupted|unknown device|not a valid|no such|could not find|singular matrix|timestep too small|failed/i;

/**
 * Splits ngspice diagnostics into fatal errors and informational warnings/notes.
 * A dropped netlist line ("... ignored!") is fatal even if vectors were produced:
 * a silently missing element gives plausible but wrong numbers.
 */
export function classifyNgspiceMessages(
  messages: string[],
  hasData: boolean,
): { fatal: string[]; warnings: string[] } {
  const lines = messages.map((m) => m.trim()).filter((m) => m.length > 0);
  const fatal = lines.filter((l) => FATAL_PATTERN.test(l));
  const warnings = lines.filter((l) => !FATAL_PATTERN.test(l));
  if (!hasData && fatal.length === 0) {
    return { fatal: lines.length > 0 ? lines : ["ngspice produced no output vectors"], warnings: [] };
  }
  return { fatal, warnings };
}

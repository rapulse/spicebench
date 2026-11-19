import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CircuitGraph,
  createDefaultComponent,
  BodePlotterStateSchema,
  FunctionGeneratorStateSchema,
  MultimeterStateSchema,
  OscilloscopeStateSchema,
  type ComponentType,
} from "@spicebench/core";
import { NetlistCompiler } from "../src/compiler/netlist-compiler";
import { SpiceRunner } from "../src/runner/spice-runner";
import {
  computeInstrumentData,
  requiredAnalyses,
  type AnalysisResults,
  type BodePlotterData,
  type MultimeterData,
  type OscilloscopeData,
} from "../src/instruments/instrument-data";

/**
 * Instrument readings computed from real ngspice results (ADR-011).
 * Each case targets a false signal of the previous implementation.
 */

type Pin = [string, string];
function build(parts: Array<[ComponentType, string, Record<string, string>?]>, wires: Array<[Pin, Pin]>) {
  const g = new CircuitGraph();
  parts.forEach(([type, id, params], i) => {
    const c = createDefaultComponent(type, id, { x: 10 + i * 10, y: 10 });
    Object.assign(c.params, params ?? {});
    g.addComponent(c);
  });
  for (const [[a, ap], [b, bp]] of wires) g.connectPins({ componentId: a, pinId: ap }, { componentId: b, pinId: bp });
  return g;
}

describe("Instrument data on ngspice (Power On)", () => {
  let runner: SpiceRunner;
  beforeAll(() => {
    runner = new SpiceRunner();
  });
  afterAll(async () => {
    await runner.destroy();
  });

  /** Same flow as CircuitSession.runSimulation() without mode. */
  async function powerOn(g: CircuitGraph) {
    const results: AnalysisResults = {};
    let compiled = NetlistCompiler.compile(g, { mode: "op" });
    for (const mode of requiredAnalyses(g)) {
      compiled = NetlistCompiler.compile(g, { mode });
      results[mode] = await runner.run(compiled.netlist);
    }
    return { data: computeInstrumentData(g, compiled, results), compiled, modes: requiredAnalyses(g) };
  }

  it("Bode plotter reports H = Vout/Vin (independent of source amplitude), -3 dB / -45° at fc", async () => {
    // RC low-pass R=1k C=159.155n -> fc = 1 kHz; source amplitude 2 V
    const g = build(
      [
        ["AC_VOLTAGE_SOURCE", "V1", { voltage: "2V" }],
        ["RESISTOR", "R1", { resistance: "1k" }],
        ["CAPACITOR", "C1", { capacitance: "159.155n" }],
        ["BODE_PLOTTER", "XBP1"],
        ["GROUND", "GND1"],
      ],
      [
        [["V1", "pos"], ["R1", "1"]],
        [["R1", "2"], ["C1", "1"]],
        [["C1", "2"], ["GND1", "0"]],
        [["V1", "neg"], ["GND1", "0"]],
        [["XBP1", "in_pos"], ["V1", "pos"]],
        [["XBP1", "out_pos"], ["C1", "1"]],
        [["XBP1", "in_neg"], ["GND1", "0"]],
        [["XBP1", "out_neg"], ["GND1", "0"]],
      ],
    );
    g.setInstrument(BodePlotterStateSchema.parse({ instrumentId: "XBP1", fstart: "10Hz", fstop: "100kHz" }));
    const { data, modes } = await powerOn(g);
    expect(modes).toContain("ac");
    const b = data["XBP1"] as BodePlotterData;
    expect(b.status).toBe("ok");
    expect(b.frequency[0]).toBeCloseTo(10, 6);
    expect(b.frequency.at(-1)).toBeCloseTo(100e3, 0);

    const i = b.frequency.reduce((best, f, k) => (Math.abs(Math.log(f / 1000)) < Math.abs(Math.log(b.frequency[best]! / 1000)) ? k : best), 0);
    // Analytic H = Zp / (R + Zp), Zp = 10 MOhm (plotter OUT input) || 1/(jwC)
    const H = (f: number) => {
      const w = 2 * Math.PI * f;
      const C = 159.155e-9;
      const Rm = 10e6;
      // Zp = Rm / (1 + j w Rm C)
      const zr = Rm / (1 + (w * Rm * C) ** 2);
      const zi = (-w * Rm * Rm * C) / (1 + (w * Rm * C) ** 2);
      const dr = 1e3 + zr;
      const di = zi;
      const den = dr * dr + di * di;
      const hr = (zr * dr + zi * di) / den;
      const hi = (zi * dr - zr * di) / den;
      return { db: 20 * Math.log10(Math.hypot(hr, hi)), ph: (Math.atan2(hi, hr) * 180) / Math.PI };
    };
    for (const k of [0, i, b.frequency.length - 1]) {
      const ref = H(b.frequency[k]!);
      expect(Math.abs(b.magnitudeDb[k]! - ref.db)).toBeLessThan(1e-3);
      expect(Math.abs(b.phaseDeg[k]! - ref.ph)).toBeLessThan(1e-2);
    }
    // At fc: -3.01 dB / -45 deg; at 10 Hz ~0 dB, NOT +6 dB of the 2 V source amplitude
    expect(b.magnitudeDb[i]).toBeCloseTo(-10 * Math.log10(1 + (b.frequency[i]! / 1000) ** 2), 2);
    expect(Math.abs(b.magnitudeDb[0]!)).toBeLessThan(0.01);
  });

  it("Multimeter: V, A and R modes; unconnected probe is null, not 0", async () => {
    const divider = (mode: string, extra: Array<[Pin, Pin]> = []) => {
      const g = build(
        [
          ["DC_VOLTAGE_SOURCE", "V1", { voltage: "12V" }],
          ["RESISTOR", "R1", { resistance: "30k" }],
          ["RESISTOR", "R2", { resistance: "10k" }],
          ["MULTIMETER", "XMM1"],
          ["GROUND", "GND1"],
        ],
        [
          [["V1", "neg"], ["GND1", "0"]],
          [["R2", "2"], ["GND1", "0"]],
          ...extra,
        ],
      );
      g.setInstrument(MultimeterStateSchema.parse({ instrumentId: "XMM1", mode }));
      return g;
    };

    // Voltmeter across R2
    let g = divider("V", [
      [["V1", "pos"], ["R1", "1"]],
      [["R1", "2"], ["R2", "1"]],
      [["XMM1", "pos"], ["R2", "1"]],
      [["XMM1", "neg"], ["GND1", "0"]],
    ]);
    let m = (await powerOn(g)).data["XMM1"] as MultimeterData;
    // 10 MOhm meter loading: 12 * (10k||10M) / (30k + 10k||10M)
    const r2l = (10e3 * 10e6) / (10e3 + 10e6);
    expect(m.status).toBe("ok");
    expect(m.value!).toBeCloseTo((12 * r2l) / (30e3 + r2l), 6);

    // Ammeter in series between R1 and R2: 12 / 40k = 0.3 mA, positive into "+"
    g = divider("A", [
      [["V1", "pos"], ["R1", "1"]],
      [["R1", "2"], ["XMM1", "pos"]],
      [["XMM1", "neg"], ["R2", "1"]],
    ]);
    m = (await powerOn(g)).data["XMM1"] as MultimeterData;
    expect(m.unit).toBe("A");
    expect(m.value!).toBeCloseTo(0.3e-3, 9);

    // Ohmmeter in a powered circuit -> invalid (EWB requires a passive circuit)
    g = divider("R", [
      [["V1", "pos"], ["R1", "1"]],
      [["R1", "2"], ["R2", "1"]],
      [["XMM1", "pos"], ["R2", "1"]],
      [["XMM1", "neg"], ["GND1", "0"]],
    ]);
    m = (await powerOn(g)).data["XMM1"] as MultimeterData;
    expect(m.status).toBe("invalid");
    expect(m.value).toBeNull();

    // Unconnected "-" probe
    g = divider("V", [
      [["V1", "pos"], ["R1", "1"]],
      [["R1", "2"], ["R2", "1"]],
      [["XMM1", "pos"], ["R2", "1"]],
    ]);
    m = (await powerOn(g)).data["XMM1"] as MultimeterData;
    expect(m.status).toBe("not_connected");
    expect(m.value).toBeNull();
  });

  it("Ohmmeter measures a passive network: 1k + (2k || 2k) = 2k", async () => {
    const g = build(
      [
        ["RESISTOR", "R1", { resistance: "1k" }],
        ["RESISTOR", "R2", { resistance: "2k" }],
        ["RESISTOR", "R3", { resistance: "2k" }],
        ["MULTIMETER", "XMM1"],
        ["GROUND", "GND1"],
      ],
      [
        [["XMM1", "pos"], ["R1", "1"]],
        [["R1", "2"], ["R2", "1"]],
        [["R1", "2"], ["R3", "1"]],
        [["R2", "2"], ["GND1", "0"]],
        [["R3", "2"], ["GND1", "0"]],
        [["XMM1", "neg"], ["GND1", "0"]],
      ],
    );
    g.setInstrument(MultimeterStateSchema.parse({ instrumentId: "XMM1", mode: "R" }));
    const m = (await powerOn(g)).data["XMM1"] as MultimeterData;
    expect(m.unit).toBe("Ohm");
    expect(m.value!).toBeCloseTo(2000, 6);
  });

  it("Function generator settings from the instrument window drive the simulation; AC voltmeter reads RMS", async () => {
    const g = build(
      [
        ["FUNCTION_GENERATOR", "XFG1"],
        ["RESISTOR", "RL", { resistance: "1k" }],
        ["MULTIMETER", "XMM1"],
        ["GROUND", "GND1"],
      ],
      [
        [["XFG1", "pos"], ["RL", "1"]],
        [["RL", "2"], ["GND1", "0"]],
        [["XFG1", "com"], ["GND1", "0"]],
        [["XMM1", "pos"], ["RL", "1"]],
        [["XMM1", "neg"], ["GND1", "0"]],
      ],
    );
    // Window state differs from component defaults (5 V, 1 kHz, 0 V offset)
    g.setInstrument(
      FunctionGeneratorStateSchema.parse({
        instrumentId: "XFG1",
        waveform: "sine",
        frequency: "2kHz",
        amplitude: "2V",
        offset: "1V",
      }),
    );
    g.setInstrument(MultimeterStateSchema.parse({ instrumentId: "XMM1", mode: "V", currentType: "AC" }));
    const { data, compiled } = await powerOn(g);
    expect(compiled.netlist).toMatch(/SIN\(1 2 2k\)/);
    const m = data["XMM1"] as MultimeterData;
    expect(m.source).toBe("tran");
    expect(m.value!).toBeCloseTo(2 / Math.SQRT2, 2); // AC RMS ignores the 1 V offset

    g.setInstrument(MultimeterStateSchema.parse({ instrumentId: "XMM1", mode: "V", currentType: "DC" }));
    const dc = (await powerOn(g)).data["XMM1"] as MultimeterData;
    expect(dc.value!).toBeCloseTo(1, 2); // DC = mean = offset
  });

  it("Oscilloscope: one screen = 10 div x timebase; channels are differential; '-' output of the generator is inverted", async () => {
    const g = build(
      [
        ["FUNCTION_GENERATOR", "XFG1", { frequency: "1kHz", amplitude: "1V" }],
        ["RESISTOR", "RP", { resistance: "1k" }],
        ["RESISTOR", "RN", { resistance: "1k" }],
        ["OSCILLOSCOPE", "XSC1"],
        ["GROUND", "GND1"],
      ],
      [
        [["XFG1", "com"], ["GND1", "0"]],
        [["XFG1", "pos"], ["RP", "1"]],
        [["RP", "2"], ["GND1", "0"]],
        [["XFG1", "neg"], ["RN", "1"]],
        [["RN", "2"], ["GND1", "0"]],
        [["XSC1", "ch_a_pos"], ["XFG1", "pos"]],
        [["XSC1", "ch_b_pos"], ["XFG1", "neg"]],
      ],
    );
    g.setInstrument(OscilloscopeStateSchema.parse({ instrumentId: "XSC1", timebase: "0.5ms/div" }));
    const s = (await powerOn(g)).data["XSC1"] as OscilloscopeData;
    expect(s.status).toBe("ok");
    expect(s.time.at(-1)).toBeCloseTo(5e-3, 9);
    const a = s.chA!;
    const b = s.chB!;
    expect(Math.max(...a)).toBeCloseTo(1, 2);
    for (let i = 0; i < a.length; i += 97) expect(a[i]! + b[i]!).toBeCloseTo(0, 9);
    const k = s.time.findIndex((t) => t >= 0.25e-3); // quarter period of 1 kHz
    expect(a[k]!).toBeCloseTo(Math.sin(2 * Math.PI * 1e3 * s.time[k]!), 2);
  });

  it("Oscilloscope without connections reports not_connected (no fake flat 0 V trace)", async () => {
    const g = build(
      [
        ["DC_VOLTAGE_SOURCE", "V1", { voltage: "1V" }],
        ["RESISTOR", "R1", { resistance: "1k" }],
        ["OSCILLOSCOPE", "XSC1"],
        ["GROUND", "GND1"],
      ],
      [
        [["V1", "pos"], ["R1", "1"]],
        [["R1", "2"], ["GND1", "0"]],
        [["V1", "neg"], ["GND1", "0"]],
      ],
    );
    const s = (await powerOn(g)).data["XSC1"] as OscilloscopeData;
    expect(s.status).toBe("not_connected");
    expect(s.chA).toBeNull();
    expect(s.chB).toBeNull();
  });
});

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

  it("AC source value is RMS (EWB, ADR-012): 10 V / 1 kHz on 1.5k + 240 mH, AC meters", async () => {
    // Reference: electronics-workbench/Image-1 2.jpeg (EWB 5.12, ammeter ≈ 4.67 mA there).
    const g = build(
      [
        ["AC_VOLTAGE_SOURCE", "V1", { voltage: "10V", frequency: "1kHz" }],
        ["RESISTOR", "R1", { resistance: "1.5k" }],
        ["INDUCTOR", "L1", { inductance: "240m" }],
        ["MULTIMETER", "XMM_A", { mode: "A", currentType: "AC" }],
        ["MULTIMETER", "XMM_R", { mode: "V", currentType: "AC" }],
        ["MULTIMETER", "XMM_L", { mode: "V", currentType: "AC" }],
        ["GROUND", "GND1"],
      ],
      [
        [["V1", "pos"], ["R1", "1"]],
        [["R1", "2"], ["L1", "1"]],
        [["L1", "2"], ["XMM_A", "pos"]],
        [["XMM_A", "neg"], ["GND1", "0"]],
        [["V1", "neg"], ["GND1", "0"]],
        [["XMM_R", "pos"], ["R1", "1"]],
        [["XMM_R", "neg"], ["R1", "2"]],
        [["XMM_L", "pos"], ["L1", "1"]],
        [["XMM_L", "neg"], ["L1", "2"]],
      ],
    );
    for (const [id, mode] of [["XMM_A", "A"], ["XMM_R", "V"], ["XMM_L", "V"]] as const) {
      g.setInstrument(MultimeterStateSchema.parse({ instrumentId: id, mode, currentType: "AC" }));
    }
    const { data } = await powerOn(g);
    const xl = 2 * Math.PI * 1e3 * 0.24;
    const i = 10 / Math.hypot(1500, xl); // 4.701 mA RMS
    const val = (id: string) => (data[id] as MultimeterData).value!;
    expect(Math.abs(val("XMM_A") - i) / i).toBeLessThan(5e-3);
    expect(Math.abs(val("XMM_R") - i * 1500) / (i * 1500)).toBeLessThan(5e-3);
    expect(Math.abs(val("XMM_L") - i * xl) / (i * xl)).toBeLessThan(5e-3);
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

  it("Schematic indicators VOLTMETER & AMMETER measure DC and AC RMS (Image-1 2.jpeg)", async () => {
    const g = build(
      [
        ["AC_VOLTAGE_SOURCE", "V1", { voltage: "10V", frequency: "1kHz" }],
        ["RESISTOR", "R1", { resistance: "1.5k" }],
        ["INDUCTOR", "L1", { inductance: "240m" }],
        ["VOLTMETER", "VM1", { mode: "AC" }],
        ["VOLTMETER", "VM2", { mode: "AC" }],
        ["AMMETER", "AM1", { mode: "AC" }],
        ["VOLTMETER", "VM_NC", { mode: "DC" }],
        ["GROUND", "GND1"],
      ],
      [
        [["V1", "pos"], ["R1", "1"]],
        [["R1", "2"], ["L1", "1"]],
        [["L1", "2"], ["AM1", "pos"]],
        [["AM1", "neg"], ["GND1", "0"]],
        [["V1", "neg"], ["GND1", "0"]],
        [["VM1", "pos"], ["R1", "1"]],
        [["VM1", "neg"], ["R1", "2"]],
        [["VM2", "pos"], ["L1", "1"]],
        [["VM2", "neg"], ["L1", "2"]],
      ],
    );
    const { data } = await powerOn(g);
    const xl = 2 * Math.PI * 1e3 * 0.24;
    const iExpected = 10 / Math.hypot(1500, xl);
    const vm1 = data["VM1"];
    const vm2 = data["VM2"];
    const am1 = data["AM1"];
    const vmNc = data["VM_NC"];
    expect(vm1?.type === "VOLTMETER" && vm1.status === "ok").toBe(true);
    expect(vm2?.type === "VOLTMETER" && vm2.status === "ok").toBe(true);
    expect(am1?.type === "AMMETER" && am1.status === "ok").toBe(true);
    if (vm1?.type === "VOLTMETER" && vm2?.type === "VOLTMETER" && am1?.type === "AMMETER") {
      expect(Math.abs(am1.value! - iExpected) / iExpected).toBeLessThan(5e-3);
      expect(Math.abs(vm1.value! - iExpected * 1500) / (iExpected * 1500)).toBeLessThan(5e-3);
      expect(Math.abs(vm2.value! - iExpected * xl) / (iExpected * xl)).toBeLessThan(5e-3);
    }
    expect(vmNc?.type === "VOLTMETER" && vmNc.status === "not_connected" && vmNc.value === null).toBe(true);
  });

  it("VCC, VCVS, VCCS, CCVS, CCCS and AC_CURRENT_SOURCE match analytical values", async () => {
    // VCC (5V) -> R1 (1k) -> CCVS ctrl (5 mA) -> GND;
    // CCVS (Rm=2k) produces 10V across R_load1;
    // VCVS (gain=3) sensing VCC produces 15V across R_load2;
    // VCCS (gm=2m) sensing VCC drives 10mA through R_load3 (1k) -> -10V (or +10V by polarity).
    const g = build(
      [
        ["VCC", "VCC1", { voltage: "5V" }],
        ["RESISTOR", "R1", { resistance: "1k" }],
        ["CCVS", "H1", { transresistance: "2k" }],
        ["RESISTOR", "RL1", { resistance: "10k" }],
        ["VCVS", "E1", { gain: "3" }],
        ["RESISTOR", "RL2", { resistance: "10k" }],
        ["VOLTMETER", "VM_H", { mode: "DC" }],
        ["VOLTMETER", "VM_E", { mode: "DC" }],
        ["GROUND", "GND1"],
      ],
      [
        [["VCC1", "out"], ["R1", "1"]],
        [["R1", "2"], ["H1", "ctrl_pos"]],
        [["H1", "ctrl_neg"], ["GND1", "0"]],
        [["H1", "out_pos"], ["RL1", "1"]],
        [["H1", "out_neg"], ["GND1", "0"]],
        [["RL1", "2"], ["GND1", "0"]],
        [["VM_H", "pos"], ["RL1", "1"]],
        [["VM_H", "neg"], ["GND1", "0"]],
        [["E1", "ctrl_pos"], ["VCC1", "out"]],
        [["E1", "ctrl_neg"], ["GND1", "0"]],
        [["E1", "out_pos"], ["RL2", "1"]],
        [["E1", "out_neg"], ["GND1", "0"]],
        [["RL2", "2"], ["GND1", "0"]],
        [["VM_E", "pos"], ["RL2", "1"]],
        [["VM_E", "neg"], ["GND1", "0"]],
      ],
    );
    const { data } = await powerOn(g);
    const vmH = data["VM_H"];
    const vmE = data["VM_E"];
    expect(vmH?.type === "VOLTMETER" && vmH.value).toBeCloseTo(10, 3);
    expect(vmE?.type === "VOLTMETER" && vmE.value).toBeCloseTo(15, 3);
  });
});

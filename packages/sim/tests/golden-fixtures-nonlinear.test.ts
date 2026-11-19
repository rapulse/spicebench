import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CircuitGraph, createDefaultComponent, type ComponentType } from "@spicebench/core";
import { NetlistCompiler } from "../src/compiler/netlist-compiler";
import { SpiceRunner } from "../src/runner/spice-runner";
import type { AcResult, OpResult, TranResult } from "../src/parser/types";

/**
 * Nonlinear & long-run golden fixtures (ADR-007).
 * References are computed analytically in the test itself, independent of the engine.
 * These circuits were wrong on the former BuiltinMnaEngine (switch-model diodes/BJTs,
 * ignored op-amps in .ac, transient truncated at 2000 steps).
 */

const VT_27C = (1.380649e-23 * 300.15) / 1.602176634e-19; // thermal voltage at 27 °C

type Pin = [string, string];
function build(
  parts: Array<[ComponentType, string, Record<string, string>?]>,
  wires: Array<[Pin, Pin]>,
): CircuitGraph {
  const g = new CircuitGraph();
  parts.forEach(([type, id, params], i) => {
    const c = createDefaultComponent(type, id, { x: 10 + i * 10, y: 10 });
    Object.assign(c.params, params ?? {});
    g.addComponent(c);
  });
  for (const [[a, ap], [b, bp]] of wires) {
    g.connectPins({ componentId: a, pinId: ap }, { componentId: b, pinId: bp });
  }
  return g;
}

describe("Golden Fixtures: nonlinear devices on ngspice", () => {
  let runner: SpiceRunner;
  beforeAll(() => {
    runner = new SpiceRunner();
  });
  afterAll(async () => {
    await runner.destroy();
  });

  it("Fixture 6: 1N4148 + 1k from 5 V matches the Shockley equation (with RS)", async () => {
    const g = build(
      [
        ["DC_VOLTAGE_SOURCE", "V1", { voltage: "5V" }],
        ["RESISTOR", "R1", { resistance: "1k" }],
        ["DIODE", "D1", { model: "1N4148" }],
        ["GROUND", "GND1"],
      ],
      [
        [["V1", "pos"], ["R1", "1"]],
        [["R1", "2"], ["D1", "anode"]],
        [["D1", "cathode"], ["GND1", "0"]],
        [["V1", "neg"], ["GND1", "0"]],
      ],
    );
    const compiled = NetlistCompiler.compile(g, { mode: "op" });
    const res = await runner.run(compiled.netlist);
    const vA = (res.data as OpResult).nodeVoltages[compiled.nodeMap.get("D1:anode")!.toLowerCase()]!;

    // Analytical: I = (5 - Va)/1k ; Va = N*Vt*ln(I/IS + 1) + I*RS  (1N4148: IS=2.52n N=1.752 RS=0.568)
    const IS = 2.52e-9, N = 1.752, RS = 0.568;
    let va = 0.6;
    for (let k = 0; k < 200; k++) {
      const i = (5 - va) / 1000;
      va = N * VT_27C * Math.log(i / IS + 1) + i * RS;
    }
    expect(va).toBeGreaterThan(0.6);
    expect(va).toBeLessThan(0.75);
    expect(Math.abs(vA - va)).toBeLessThan(1e-3);
  });

  it("Fixture 7: 2N3904 common-emitter bias point is physically consistent", async () => {
    // Vcc=12 V, Rb=1M, Rc=2k. Expect active region, beta near BF=300 (Early effect raises it slightly).
    const g = build(
      [
        ["DC_VOLTAGE_SOURCE", "VCC", { voltage: "12V" }],
        ["RESISTOR", "RB", { resistance: "1meg" }],
        ["RESISTOR", "RC", { resistance: "2k" }],
        ["BJT_NPN", "Q1", { model: "2N3904" }],
        ["GROUND", "GND1"],
      ],
      [
        [["VCC", "pos"], ["RB", "1"]],
        [["VCC", "pos"], ["RC", "1"]],
        [["RB", "2"], ["Q1", "base"]],
        [["RC", "2"], ["Q1", "collector"]],
        [["Q1", "emitter"], ["GND1", "0"]],
        [["VCC", "neg"], ["GND1", "0"]],
      ],
    );
    const compiled = NetlistCompiler.compile(g, { mode: "op" });
    const op = (await runner.run(compiled.netlist)).data as OpResult;
    const vb = op.nodeVoltages[compiled.nodeMap.get("Q1:base")!.toLowerCase()]!;
    const vc = op.nodeVoltages[compiled.nodeMap.get("Q1:collector")!.toLowerCase()]!;

    const ib = (12 - vb) / 1e6;
    const ic = (12 - vc) / 2e3;
    expect(vb).toBeGreaterThan(0.55);
    expect(vb).toBeLessThan(0.75);
    expect(vc).toBeGreaterThan(0.3); // not saturated
    expect(ic / ib).toBeGreaterThan(250);
    expect(ic / ib).toBeLessThan(340);
  });

  it("Fixture 8: non-inverting amplifier (ideal op-amp, gain 1+10k/1k) in .ac", async () => {
    const g = build(
      [
        ["AC_VOLTAGE_SOURCE", "VIN", { voltage: "1V" }],
        ["OPAMP_IDEAL", "U1"],
        ["RESISTOR", "R1", { resistance: "1k" }],
        ["RESISTOR", "R2", { resistance: "10k" }],
        ["GROUND", "GND1"],
      ],
      [
        [["VIN", "pos"], ["U1", "non_inv"]],
        [["U1", "inv"], ["R1", "1"]],
        [["R1", "2"], ["GND1", "0"]],
        [["U1", "inv"], ["R2", "1"]],
        [["R2", "2"], ["U1", "out"]],
        [["VIN", "neg"], ["GND1", "0"]],
      ],
    );
    const compiled = NetlistCompiler.compile(g, {
      mode: "ac",
      ac: { scale: "dec", points: 5, fstart: "10", fstop: "100k" },
    });
    const ac = (await runner.run(compiled.netlist)).data as AcResult;
    const out = ac.complexValues[`v(${compiled.nodeMap.get("U1:out")!.toLowerCase()})`]!;
    // Closed loop: A/(1 + A*beta), A = 1e5, beta = 1/11
    const expected = 1e5 / (1 + 1e5 / 11);
    for (const c of out) {
      expect(Math.abs(Math.hypot(c.real, c.imag) - expected)).toBeLessThan(1e-3);
    }
  });

  it("Fixture 9: long transient (10 000 steps) reaches tstop and matches RC analytics", async () => {
    const g = build(
      [
        ["DC_VOLTAGE_SOURCE", "V1", { voltage: "5V" }],
        ["RESISTOR", "R1", { resistance: "1k" }],
        ["CAPACITOR", "C1", { capacitance: "1u" }],
        ["GROUND", "GND1"],
      ],
      [
        [["V1", "pos"], ["R1", "1"]],
        [["R1", "2"], ["C1", "1"]],
        [["C1", "2"], ["GND1", "0"]],
        [["V1", "neg"], ["GND1", "0"]],
      ],
    );
    const compiled = NetlistCompiler.compile(g, {
      mode: "tran",
      tran: { tstep: "1u", tstop: "10m", uic: true },
    });
    const tran = (await runner.run(compiled.netlist)).data as TranResult;
    const v = tran.variables[`v(${compiled.nodeMap.get("C1:1")!.toLowerCase()})`]!;

    expect(tran.time.at(-1)).toBeCloseTo(10e-3, 9);
    for (const t of [0.5e-3, 2e-3, 8e-3]) {
      const i = tran.time.findIndex((x) => x >= t);
      const analytic = 5 * (1 - Math.exp(-tran.time[i]! / 1e-3));
      expect(Math.abs(v[i]! - analytic)).toBeLessThan(1e-3);
    }
  });

  it("Fixture 10: logic macromodels follow their truth tables", async () => {
    const table: Record<string, (a: boolean, b: boolean) => boolean> = {
      AND_GATE: (a, b) => a && b,
      OR_GATE: (a, b) => a || b,
      NAND_GATE: (a, b) => !(a && b),
      NOR_GATE: (a, b) => !(a || b),
      XOR_GATE: (a, b) => a !== b,
    };
    for (const [type, fn] of Object.entries(table)) {
      for (const [a, b] of [
        [false, false],
        [false, true],
        [true, false],
        [true, true],
      ] as const) {
        const g = build(
          [
            ["DC_VOLTAGE_SOURCE", "VA", { voltage: a ? "5V" : "0V" }],
            ["DC_VOLTAGE_SOURCE", "VB", { voltage: b ? "5V" : "0V" }],
            [type as ComponentType, "U1"],
            ["RESISTOR", "RL", { resistance: "10k" }],
            ["GROUND", "GND1"],
          ],
          [
            [["VA", "pos"], ["U1", "in1"]],
            [["VB", "pos"], ["U1", "in2"]],
            [["U1", "out"], ["RL", "1"]],
            [["RL", "2"], ["GND1", "0"]],
            [["VA", "neg"], ["GND1", "0"]],
            [["VB", "neg"], ["GND1", "0"]],
          ],
        );
        const compiled = NetlistCompiler.compile(g, { mode: "op" });
        const op = (await runner.run(compiled.netlist)).data as OpResult;
        const vy = op.nodeVoltages[compiled.nodeMap.get("U1:out")!.toLowerCase()]!;
        expect({ type, a, b, vy: Math.round(vy) }).toEqual({ type, a, b, vy: fn(a, b) ? 5 : 0 });
      }
    }
  });
});

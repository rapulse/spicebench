import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CircuitGraph,
  COMPONENT_CATALOG,
  createDefaultComponent,
  type ComponentType,
} from "@spicebench/core";
import { NetlistCompiler } from "../src/compiler/netlist-compiler";
import { SpiceRunner } from "../src/runner/spice-runner";

/**
 * Smoke test (ROADMAP 9.3): every catalog component type with default params must compile
 * into a netlist that ngspice accepts and solves in .op and a short .tran.
 * Harness: first pin is driven from a 1 V source through 1 kΩ, all other pins go to ground
 * through 10 kΩ, so no node floats regardless of the device.
 */
const TYPES = (Object.keys(COMPONENT_CATALOG) as ComponentType[]).filter((t) => t !== "GROUND");

function harness(type: ComponentType): CircuitGraph {
  const g = new CircuitGraph();
  const dut = createDefaultComponent(type, "DUT", { x: 40, y: 40 });
  const vs = createDefaultComponent("DC_VOLTAGE_SOURCE", "VS", { x: 10, y: 10 });
  vs.params["voltage"] = "1V";
  const gnd = createDefaultComponent("GROUND", "GND1", { x: 10, y: 80 });
  g.addComponent(dut);
  g.addComponent(vs);
  g.addComponent(gnd);
  g.connectPins({ componentId: "VS", pinId: "neg" }, { componentId: "GND1", pinId: "0" });

  COMPONENT_CATALOG[type].pins.forEach((pin, i) => {
    const r = createDefaultComponent("RESISTOR", `RH${i}`, { x: 20 + i * 6, y: 60 });
    r.params["resistance"] = i === 0 ? "1k" : "10k";
    g.addComponent(r);
    g.connectPins({ componentId: "DUT", pinId: pin.id }, { componentId: r.id, pinId: "1" });
    if (i === 0) {
      g.connectPins({ componentId: r.id, pinId: "2" }, { componentId: "VS", pinId: "pos" });
    } else {
      g.connectPins({ componentId: r.id, pinId: "2" }, { componentId: "GND1", pinId: "0" });
    }
  });
  return g;
}

describe("Component smoke test: all catalog types run on ngspice", () => {
  let runner: SpiceRunner;
  beforeAll(() => {
    runner = new SpiceRunner({ timeoutMs: 3000 });
  });
  afterAll(async () => {
    await runner.destroy();
  });

  it("catalog has 33 non-ground types", () => {
    expect(TYPES.length).toBe(33);
  });

  for (const type of TYPES) {
    it(`${type}: compiles and solves .op and .tran`, async () => {
      const g = harness(type);
      for (const mode of ["op", "tran"] as const) {
        const compiled = NetlistCompiler.compile(g, {
          mode,
          tran: { tstep: "10u", tstop: "1m" },
        });
        expect(compiled.netlist).not.toMatch(/undefined|NaN/);
        const res = await runner.run(compiled.netlist).catch((e: unknown) => {
          throw new Error(`${type} ${mode}: ${String(e)}\n--- netlist ---\n${compiled.netlist}`);
        });
        expect(res.success).toBe(true);
      }
    });
  }
});

import { describe, it, expect, afterEach } from "vitest";
import { CircuitGraph, createDefaultComponent } from "@spicebench/core";
import { NetlistCompiler } from "../src/compiler/netlist-compiler";
import { SpiceRunner } from "../src/runner/spice-runner";
import { OpResult } from "../src/parser/types";
import { SimulationError } from "../src/runner/engine-interface";

describe("SpiceRunner (Simulation Execution & Timeout Guard)", () => {
  let runner: SpiceRunner;

  afterEach(async () => {
    if (runner) {
      await runner.destroy();
    }
  });

  it("executes OP simulation for Voltage Divider and returns exact node voltages", async () => {
    runner = new SpiceRunner();

    const graph = new CircuitGraph();
    const v1 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V1", { x: 10, y: 10 });
    v1.params["voltage"] = "10V";
    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 20, y: 10 });
    r1.params["resistance"] = "10k";
    const r2 = createDefaultComponent("RESISTOR", "R2", { x: 20, y: 20 });
    r2.params["resistance"] = "10k";
    const gnd = createDefaultComponent("GROUND", "GND1", { x: 10, y: 20 });

    graph.addComponent(v1);
    graph.addComponent(r1);
    graph.addComponent(r2);
    graph.addComponent(gnd);

    graph.connectPins({ componentId: "V1", pinId: "pos" }, { componentId: "R1", pinId: "1" });
    graph.connectPins({ componentId: "R1", pinId: "2" }, { componentId: "R2", pinId: "1" });
    graph.connectPins({ componentId: "R2", pinId: "2" }, { componentId: "GND1", pinId: "0" });
    graph.connectPins({ componentId: "V1", pinId: "neg" }, { componentId: "GND1", pinId: "0" });

    const compiled = NetlistCompiler.compile(graph, { mode: "op" });
    const result = await runner.run(compiled.netlist);

    expect(result.success).toBe(true);
    expect(result.mode).toBe("op");

    const opData = result.data as OpResult;
    // Input node is 10V
    const inNode = compiled.nodeMap.get("V1:pos")!.toLowerCase();
    expect(opData.nodeVoltages[inNode]).toBeCloseTo(10.0, 3);

    // Midpoint node is 5V (10k / (10k + 10k) * 10V)
    const midNode = compiled.nodeMap.get("R1:2")!.toLowerCase();
    expect(opData.nodeVoltages[midNode]).toBeCloseTo(5.0, 3);
  });

  it("enforces a real timeout on a hung ngspice run and recovers with a fresh worker", async () => {
    runner = new SpiceRunner({ timeoutMs: 300 });
    await runner.warmUp();

    // 1 s of a 1 MHz sine at 1 ns step: ~1e9 points, far beyond 300 ms.
    const endless = "* endless\nV1 in 0 SIN(0 1 1meg)\nR1 in a 1k\nC1 a 0 1n\n.tran 1n 1\n.end";
    const t0 = Date.now();
    await expect(runner.run(endless)).rejects.toThrow(/\[SIMULATION_TIMEOUT\]/);
    expect(Date.now() - t0).toBeLessThan(1500);

    // Next run spawns a new worker and succeeds.
    const ok = await runner.run("* ok\nV1 a 0 DC 2\nR1 a 0 1k\n.op\n.end", 5000);
    expect((ok.data as OpResult).nodeVoltages["a"]).toBeCloseTo(2, 9);
  });

  it("serializes concurrent runs on a single engine instance", async () => {
    runner = new SpiceRunner();
    const nl = (v: number) => `* v${v}\nV1 a 0 DC ${v}\nR1 a b 1k\nR2 b 0 1k\n.op\n.end`;
    const results = await Promise.all([1, 2, 3, 4].map((v) => runner.run(nl(v))));
    results.forEach((r, i) => {
      expect((r.data as OpResult).nodeVoltages["b"]).toBeCloseTo((i + 1) / 2, 9);
      expect(r.engine).toBe("ngspice-wasm");
    });
  });

  it("returns structured SPICE error when the netlist is invalid", async () => {
    runner = new SpiceRunner();

    // Resistor without second node and value
    const faultyNetlist = `
* Faulty Circuit
V1 n001 0 DC 1
R1 N001
.op
.end
`;

    const err = await runner.run(faultyNetlist).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SimulationError);
    const details = (err as SimulationError).details;
    expect(details.code).toBe("SPICE_ERROR");
    expect(details.problematicComponents).toContain("r1");
  });

  it("keeps non-fatal ngspice notes as warnings", async () => {
    runner = new SpiceRunner();
    const res = await runner.run("* ac source without dc\nVIN in 0 AC 1\nR1 in 0 1k\n.op\n.end");
    expect(res.success).toBe(true);
    expect(res.warnings.join(" ")).toMatch(/DC 0 assumed/i);
  });
});

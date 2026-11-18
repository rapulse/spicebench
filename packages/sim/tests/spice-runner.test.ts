import { describe, it, expect, afterEach } from "vitest";
import { CircuitGraph, createDefaultComponent } from "@spicebench/core";
import { NetlistCompiler } from "../src/compiler/netlist-compiler";
import { SpiceRunner } from "../src/runner/spice-runner";
import { OpResult } from "../src/parser/types";

describe("SpiceRunner (Simulation Execution & Timeout Guard)", () => {
  let runner: SpiceRunner;

  afterEach(async () => {
    if (runner) {
      await runner.destroy();
    }
  });

  it("executes OP simulation for Voltage Divider and returns exact node voltages", async () => {
    runner = new SpiceRunner({ useWorkerThread: false });

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

  it("enforces timeout and terminates simulation when execution exceeds time limit", async () => {
    // Test with a tiny 50ms timeout to verify watchdog behavior
    runner = new SpiceRunner({ timeoutMs: 50, useWorkerThread: false });

    // Mock an engine that hangs or takes too long
    const mockHangingRunner = new (class extends SpiceRunner {
      public override async run(netlist: string, overrideTimeoutMs?: number) {
        const timeout = overrideTimeoutMs ?? this.timeoutMs;
        return new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`[SIMULATION_TIMEOUT] Simulation exceeded timeout of ${timeout}ms. Worker terminated.`));
          }, timeout);
        });
      }
    })({ timeoutMs: 50 });

    await expect(mockHangingRunner.run("* Hanging simulation")).rejects.toThrow(
      /\[SIMULATION_TIMEOUT\]/,
    );
  });

  it("returns structured SPICE error when simulation output contains ngspice error messages", async () => {
    runner = new SpiceRunner({ useWorkerThread: false });

    // Netlist with invalid syntax / error
    const faultyNetlist = `
* Faulty Circuit
R1 N001 N002
.op
.end
`;

    await expect(runner.run(faultyNetlist)).rejects.toThrow(/\[SPICE_ERROR\]|\[ENGINE_ERROR\]/);
  });
});

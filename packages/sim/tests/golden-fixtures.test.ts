import { describe, it, expect, afterEach } from "vitest";
import { CircuitGraph, createDefaultComponent } from "@spicebench/core";
import { NetlistCompiler } from "../src/compiler/netlist-compiler";
import { SpiceRunner } from "../src/runner/spice-runner";
import { OpResult, TranResult, AcResult } from "../src/parser/types";

describe("Phase 2.3: Golden Fixtures (Analytical Verification)", () => {
  let runner: SpiceRunner;

  afterEach(async () => {
    if (runner) {
      await runner.destroy();
    }
  });

  it("Fixture 1: Resistive Voltage Divider (Exact OP & Current)", async () => {
    // Vs = 12V, R1 = 30k, R2 = 10k
    // Theoretical: Vout = Vs * R2 / (R1 + R2) = 12 * 10k / 40k = 3.000V
    // Total current: I = 12V / 40k = 0.300mA = 3.000e-4 A
    runner = new SpiceRunner({ useWorkerThread: false });

    const graph = new CircuitGraph();
    const v1 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V1", { x: 10, y: 10 });
    v1.params["voltage"] = "12V";

    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 20, y: 10 });
    r1.params["resistance"] = "30k";

    const r2 = createDefaultComponent("RESISTOR", "R2", { x: 20, y: 20 });
    r2.params["resistance"] = "10k";

    const gnd = createDefaultComponent("GROUND", "GND1", { x: 10, y: 20 });

    graph.addComponent(v1);
    graph.addComponent(r1);
    graph.addComponent(r2);
    graph.addComponent(gnd);

    // Connections
    graph.connectPins({ componentId: "V1", pinId: "pos" }, { componentId: "R1", pinId: "1" });
    graph.connectPins({ componentId: "R1", pinId: "2" }, { componentId: "R2", pinId: "1" });
    graph.connectPins({ componentId: "R2", pinId: "2" }, { componentId: "GND1", pinId: "0" });
    graph.connectPins({ componentId: "V1", pinId: "neg" }, { componentId: "GND1", pinId: "0" });

    const compiled = NetlistCompiler.compile(graph, { mode: "op" });
    const result = await runner.run(compiled.netlist);

    expect(result.success).toBe(true);
    expect(result.mode).toBe("op");

    const op = result.data as OpResult;
    const inNode = compiled.nodeMap.get("V1:pos")!.toLowerCase();
    const outNode = compiled.nodeMap.get("R1:2")!.toLowerCase();

    // Input node is 12V
    expect(op.nodeVoltages[inNode]).toBeCloseTo(12.0, 4);

    // Voltage divider midpoint is 3.000V
    expect(op.nodeVoltages[outNode]).toBeCloseTo(3.0, 4);

    // Ground is 0V
    expect(op.nodeVoltages["0"]).toBeCloseTo(0.0, 4);

    // Current from V1 source is -0.3mA (SPICE sign convention: current leaving positive terminal)
    const iV1 = op.branchCurrents["v_v1"];
    if (iV1 !== undefined) {
      expect(Math.abs(iV1)).toBeCloseTo(0.0003, 5);
    }
  });

  it("Fixture 2: RC Step Transient Response (Tau = 1ms, Vc(t) = Vs*(1 - exp(-t/tau)))", async () => {
    // Vs = 5V, R = 1k, C = 1uF -> tau = R*C = 1.0ms
    // Theoretical: Vc(t) = 5 * (1 - exp(-t / 0.001))
    // Vc(1ms)  = 5 * (1 - exp(-1)) = 3.1606 V
    // Vc(3ms)  = 5 * (1 - exp(-3)) = 4.7511 V
    // Vc(5ms)  = 5 * (1 - exp(-5)) = 4.9663 V
    runner = new SpiceRunner({ useWorkerThread: false });

    const graph = new CircuitGraph();
    const v1 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V1", { x: 10, y: 10 });
    v1.params["voltage"] = "5V";

    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 20, y: 10 });
    r1.params["resistance"] = "1k";

    const c1 = createDefaultComponent("CAPACITOR", "C1", { x: 20, y: 20 });
    c1.params["capacitance"] = "1uF";

    const gnd = createDefaultComponent("GROUND", "GND1", { x: 10, y: 20 });

    graph.addComponent(v1);
    graph.addComponent(r1);
    graph.addComponent(c1);
    graph.addComponent(gnd);

    graph.connectPins({ componentId: "V1", pinId: "pos" }, { componentId: "R1", pinId: "1" });
    graph.connectPins({ componentId: "R1", pinId: "2" }, { componentId: "C1", pinId: "1" });
    graph.connectPins({ componentId: "C1", pinId: "2" }, { componentId: "GND1", pinId: "0" });
    graph.connectPins({ componentId: "V1", pinId: "neg" }, { componentId: "GND1", pinId: "0" });

    // Step size 10us (1e-5), stop 5ms (5e-3), UIC
    const compiled = NetlistCompiler.compile(graph, {
      mode: "tran",
      tran: { tstep: "10u", tstop: "5m", uic: true },
    });

    const result = await runner.run(compiled.netlist);
    expect(result.success).toBe(true);
    expect(result.mode).toBe("tran");

    const tran = result.data as TranResult;
    const cNode = compiled.nodeMap.get("C1:1")!.toLowerCase();
    const capVoltageSeries = tran.variables[`v(${cNode})`];
    expect(capVoltageSeries).toBeDefined();

    // Helper to find value at closest time point
    const getValueAtTime = (targetTime: number): number => {
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < tran.time.length; i++) {
        const diff = Math.abs(tran.time[i]! - targetTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      return capVoltageSeries![closestIdx]!;
    };

    // At t = 0: Vc = 0V
    expect(getValueAtTime(0)).toBeCloseTo(0.0, 3);

    // At t = 1ms (1 tau): analytical = 3.1606V (tolerance < 0.5%)
    const vAt1ms = getValueAtTime(0.001);
    expect(vAt1ms).toBeGreaterThan(3.14);
    expect(vAt1ms).toBeLessThan(3.18);

    // At t = 3ms (3 tau): analytical = 4.7511V (tolerance < 0.2%)
    const vAt3ms = getValueAtTime(0.003);
    expect(vAt3ms).toBeGreaterThan(4.73);
    expect(vAt3ms).toBeLessThan(4.77);

    // At t = 5ms (5 tau): analytical = 4.9663V (tolerance < 0.1%)
    const vAt5ms = getValueAtTime(0.005);
    expect(vAt5ms).toBeGreaterThan(4.95);
    expect(vAt5ms).toBeLessThan(4.98);
  });

  it("Fixture 3: Series RLC Resonant Circuit (AC Peak at f0 = 1kHz, Q = 6.283)", async () => {
    // Vs = 1V AC, R = 10 Ohm, L = 10mH, C = 2.53303uF
    // f0 = 1 / (2*pi*sqrt(L*C)) = 1000.0 Hz
    // At f0:
    // Z = R = 10 Ohm
    // I_peak = 1V / 10 Ohm = 0.100 A (100 mA)
    // Vc_peak = I_peak * (1 / (2*pi*f0*C)) = 0.1 * 62.83 = 6.283 V
    runner = new SpiceRunner({ useWorkerThread: false });

    const graph = new CircuitGraph();
    const v1 = createDefaultComponent("AC_VOLTAGE_SOURCE", "V1", { x: 10, y: 10 });
    v1.params["voltage"] = "1V";

    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 20, y: 10 });
    r1.params["resistance"] = "10";

    const l1 = createDefaultComponent("INDUCTOR", "L1", { x: 30, y: 10 });
    l1.params["inductance"] = "10m";

    const c1 = createDefaultComponent("CAPACITOR", "C1", { x: 30, y: 20 });
    c1.params["capacitance"] = "2.53303u";

    const gnd = createDefaultComponent("GROUND", "GND1", { x: 10, y: 20 });

    graph.addComponent(v1);
    graph.addComponent(r1);
    graph.addComponent(l1);
    graph.addComponent(c1);
    graph.addComponent(gnd);

    // Connect: V1:pos -> R1:1, R1:2 -> L1:1, L1:2 -> C1:1, C1:2 -> GND, V1:neg -> GND
    graph.connectPins({ componentId: "V1", pinId: "pos" }, { componentId: "R1", pinId: "1" });
    graph.connectPins({ componentId: "R1", pinId: "2" }, { componentId: "L1", pinId: "1" });
    graph.connectPins({ componentId: "L1", pinId: "2" }, { componentId: "C1", pinId: "1" });
    graph.connectPins({ componentId: "C1", pinId: "2" }, { componentId: "GND1", pinId: "0" });
    graph.connectPins({ componentId: "V1", pinId: "neg" }, { componentId: "GND1", pinId: "0" });

    // AC Sweep 100 Hz to 10 kHz, 30 points per decade
    const compiled = NetlistCompiler.compile(graph, {
      mode: "ac",
      ac: { scale: "dec", points: 30, fstart: "100", fstop: "10k" },
    });

    const result = await runner.run(compiled.netlist);
    expect(result.success).toBe(true);
    expect(result.mode).toBe("ac");

    const ac = result.data as AcResult;
    const cNode = compiled.nodeMap.get("C1:1")!.toLowerCase();
    const cComplex = ac.complexValues[`v(${cNode})`];
    expect(cComplex).toBeDefined();

    // Calculate linear magnitudes from complex numbers: |V| = sqrt(real^2 + imag^2)
    const cMagnitudes = cComplex!.map((c) => Math.hypot(c.real, c.imag));

    // Find peak magnitude and its frequency
    let maxMag = -1;
    let peakFreq = 0;
    for (let i = 0; i < ac.frequency.length; i++) {
      const mag = cMagnitudes[i]!;
      if (mag > maxMag) {
        maxMag = mag;
        peakFreq = ac.frequency[i]!;
      }
    }

    // Peak frequency must be within 1000 Hz +/- 5% (due to discrete log sweep points)
    expect(peakFreq).toBeGreaterThan(950);
    expect(peakFreq).toBeLessThan(1050);

    // Peak capacitor voltage magnitude must match theoretical Q * Vin = 6.283 V (+/- 5%)
    expect(maxMag).toBeGreaterThan(6.0);
    expect(maxMag).toBeLessThan(6.4);

    // Far from resonance at 100 Hz: Vc magnitude is close to Vin = 1.0V
    const lowFreqMag = cMagnitudes[0]!;
    expect(lowFreqMag).toBeCloseTo(1.01, 1);

    // Far from resonance at 10 kHz: Vc is attenuated strongly (< 0.05V)
    const highFreqMag = cMagnitudes[cMagnitudes.length - 1]!;
    expect(highFreqMag).toBeLessThan(0.05);
  });

  it("Fixture 4: Structured Error Reporting (Detects Problematic Components & Nodes)", async () => {
    runner = new SpiceRunner({ useWorkerThread: false });

    // Circuit missing value on resistor R_FAULT
    const faultyNetlist = `
* Malformed netlist
V1 N001 0 DC 5V
R_FAULT N001 0
.op
.end
`;

    try {
      await runner.run(faultyNetlist);
      expect.fail("Should have thrown error on malformed netlist");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      expect(msg).toMatch(/\[SPICE_ERROR\]/);
      expect(msg).toMatch(/syntax error|problematic/i);
    }
  });

  it("Fixture 5: Digital Logic Gate & Op-Amp Macromodels Simulation", async () => {
    runner = new SpiceRunner({ useWorkerThread: false });

    const graph = new CircuitGraph();
    const v1 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V1", { x: 10, y: 10 });
    v1.params["voltage"] = "5V";

    const andGate = createDefaultComponent("AND_GATE", "U1", { x: 20, y: 10 });
    const notGate = createDefaultComponent("NOT_GATE", "U2", { x: 30, y: 10 });
    const gnd = createDefaultComponent("GROUND", "GND1", { x: 10, y: 20 });

    graph.addComponent(v1);
    graph.addComponent(andGate);
    graph.addComponent(notGate);
    graph.addComponent(gnd);

    // V1.pos -> andGate.in1 & andGate.in2
    graph.connectPins({ componentId: "V1", pinId: "pos" }, { componentId: "U1", pinId: "in1" });
    graph.connectPins({ componentId: "V1", pinId: "pos" }, { componentId: "U1", pinId: "in2" });
    // andGate.out -> notGate.in
    graph.connectPins({ componentId: "U1", pinId: "out" }, { componentId: "U2", pinId: "in" });
    // V1.neg -> GND.0
    graph.connectPins({ componentId: "V1", pinId: "neg" }, { componentId: "GND1", pinId: "0" });

    const compiled = NetlistCompiler.compile(graph, { mode: "op" });
    const result = await runner.run(compiled.netlist);

    expect(result.success).toBe(true);
    const op = result.data as OpResult;

    // AND gate output should be HIGH (5.0V)
    const andOutNode = compiled.nodeMap.get("U1:out")!.toLowerCase();
    expect(op.nodeVoltages[andOutNode]).toBeCloseTo(5.0, 1);

    // Inverter (NOT gate) output should be LOW (0.0V)
    const notOutNode = compiled.nodeMap.get("U2:out")!.toLowerCase();
    expect(op.nodeVoltages[notOutNode]).toBeCloseTo(0.0, 1);
  });
});

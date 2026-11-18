import { describe, it, expect } from "vitest";
import { CircuitGraph, createDefaultComponent } from "@spicebench/core";
import { NetlistCompiler } from "../src/compiler/netlist-compiler";

describe("NetlistCompiler (Graph -> SPICE Netlist Translation)", () => {
  it("compiles standard Voltage Divider circuit into valid SPICE netlist", () => {
    const graph = new CircuitGraph();
    graph.meta.name = "Voltage Divider";

    const v1 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V1", { x: 10, y: 15 }, 0);
    v1.params["voltage"] = "10V";
    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 20, y: 10 }, 90);
    r1.params["resistance"] = "10k";
    const r2 = createDefaultComponent("RESISTOR", "R2", { x: 20, y: 20 }, 90);
    r2.params["resistance"] = "10k";
    const gnd = createDefaultComponent("GROUND", "GND1", { x: 10, y: 25 }, 0);

    graph.addComponent(v1);
    graph.addComponent(r1);
    graph.addComponent(r2);
    graph.addComponent(gnd);

    // V1.pos -> R1.1
    graph.connectPins(
      { componentId: "V1", pinId: "pos" },
      { componentId: "R1", pinId: "1" },
    );
    // R1.2 -> R2.1
    graph.connectPins(
      { componentId: "R1", pinId: "2" },
      { componentId: "R2", pinId: "1" },
    );
    // V1.neg -> GND.0
    graph.connectPins(
      { componentId: "V1", pinId: "neg" },
      { componentId: "GND1", pinId: "0" },
    );
    // R2.2 -> GND.0
    graph.connectPins(
      { componentId: "R2", pinId: "2" },
      { componentId: "GND1", pinId: "0" },
    );

    const compiled = NetlistCompiler.compile(graph, { mode: "op" });

    // Netlist must have title line
    expect(compiled.netlist).toMatch(/^\* SpiceBench Netlist: Voltage Divider/);

    // Ground must be node 0
    expect(compiled.nodeMap.get("GND1:0")).toBe("0");
    expect(compiled.nodeMap.get("V1:neg")).toBe("0");
    expect(compiled.nodeMap.get("R2:2")).toBe("0");

    // Component lines
    expect(compiled.netlist).toMatch(/V_V1 N\d+ 0 DC 10/);
    expect(compiled.netlist).toMatch(/R_R1 N\d+ N\d+ 10k/);
    expect(compiled.netlist).toMatch(/R_R2 N\d+ 0 10k/);

    // Analysis directive and termination
    expect(compiled.netlist).toContain(".op");
    expect(compiled.netlist).toContain(".options noacct");
    expect(compiled.netlist).toContain(".end");
  });

  it("strictly converts Mega (10^6) to 'meg' to avoid ngspice treating 'M' as milli", () => {
    const graph = new CircuitGraph();

    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 });
    r1.params["resistance"] = "1M"; // 1 Megaohm

    const r2 = createDefaultComponent("RESISTOR", "R2", { x: 20, y: 10 });
    r2.params["resistance"] = "10Meg"; // 10 Megaohm

    const r3 = createDefaultComponent("RESISTOR", "R3", { x: 30, y: 10 });
    r3.params["resistance"] = "10m"; // 10 milliohm

    const gnd = createDefaultComponent("GROUND", "GND1", { x: 0, y: 0 });

    graph.addComponent(r1);
    graph.addComponent(r2);
    graph.addComponent(r3);
    graph.addComponent(gnd);

    const compiled = NetlistCompiler.compile(graph, { mode: "op" });

    // 1M and 10Meg must be compiled as "1meg" and "10meg"
    expect(compiled.netlist).toMatch(/R_R1 \S+ \S+ 1meg/);
    expect(compiled.netlist).toMatch(/R_R2 \S+ \S+ 10meg/);
    // 10m must remain milli "10m"
    expect(compiled.netlist).toMatch(/R_R3 \S+ \S+ 10m/);
  });

  it("compiles Transient analysis directive for RC circuit", () => {
    const graph = new CircuitGraph();

    const v1 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V1", { x: 10, y: 10 });
    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 20, y: 10 });
    const c1 = createDefaultComponent("CAPACITOR", "C1", { x: 30, y: 10 });
    const gnd = createDefaultComponent("GROUND", "GND1", { x: 0, y: 0 });

    r1.params["resistance"] = "1k";
    c1.params["capacitance"] = "1uF";

    graph.addComponent(v1);
    graph.addComponent(r1);
    graph.addComponent(c1);
    graph.addComponent(gnd);

    graph.connectPins({ componentId: "V1", pinId: "pos" }, { componentId: "R1", pinId: "1" });
    graph.connectPins({ componentId: "R1", pinId: "2" }, { componentId: "C1", pinId: "1" });
    graph.connectPins({ componentId: "C1", pinId: "2" }, { componentId: "GND1", pinId: "0" });
    graph.connectPins({ componentId: "V1", pinId: "neg" }, { componentId: "GND1", pinId: "0" });

    const compiled = NetlistCompiler.compile(graph, {
      mode: "tran",
      tran: { tstep: "1u", tstop: "5m", uic: true },
    });

    expect(compiled.netlist).toContain(".tran 1u 5m uic");
    expect(compiled.netlist).toMatch(/C_C1 N\d+ 0 1u/);
  });

  it("compiles AC frequency response analysis for RLC circuit", () => {
    const graph = new CircuitGraph();

    const v1 = createDefaultComponent("AC_VOLTAGE_SOURCE", "V1", { x: 10, y: 10 });
    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 20, y: 10 });
    const l1 = createDefaultComponent("INDUCTOR", "L1", { x: 30, y: 10 });
    const c1 = createDefaultComponent("CAPACITOR", "C1", { x: 40, y: 10 });
    const gnd = createDefaultComponent("GROUND", "GND1", { x: 0, y: 0 });

    l1.params["inductance"] = "10mH";
    c1.params["capacitance"] = "2.533uF";

    graph.addComponent(v1);
    graph.addComponent(r1);
    graph.addComponent(l1);
    graph.addComponent(c1);
    graph.addComponent(gnd);

    const compiled = NetlistCompiler.compile(graph, {
      mode: "ac",
      ac: { scale: "dec", points: 50, fstart: "10Hz", fstop: "100kHz" },
    });

    expect(compiled.netlist).toContain(".ac dec 50 10Hz 100kHz");
    expect(compiled.netlist).toMatch(/L_L1 \S+ \S+ 10m/);
    expect(compiled.netlist).toMatch(/C_C1 \S+ \S+ 2.533u/);
  });

  it("includes semiconductor .model definition when Diode is present", () => {
    const graph = new CircuitGraph();

    const d1 = createDefaultComponent("DIODE", "D1", { x: 10, y: 10 });
    d1.params["model"] = "1N4148";
    const gnd = createDefaultComponent("GROUND", "GND1", { x: 0, y: 0 });

    graph.addComponent(d1);
    graph.addComponent(gnd);

    const compiled = NetlistCompiler.compile(graph, { mode: "op" });

    expect(compiled.usedModels).toContain("1N4148");
    expect(compiled.netlist).toContain(".model 1N4148 D(");
    expect(compiled.netlist).toMatch(/D_D1 \S+ \S+ 1N4148/);
  });

  it("correctly models virtual Multimeter in Voltmeter vs Ammeter modes", () => {
    const graph = new CircuitGraph();

    const xmm1 = createDefaultComponent("MULTIMETER", "XMM1", { x: 10, y: 10 });
    xmm1.params["mode"] = "V"; // Voltmeter

    const xmm2 = createDefaultComponent("MULTIMETER", "XMM2", { x: 20, y: 10 });
    xmm2.params["mode"] = "A"; // Ammeter

    const gnd = createDefaultComponent("GROUND", "GND1", { x: 0, y: 0 });

    graph.addComponent(xmm1);
    graph.addComponent(xmm2);
    graph.addComponent(gnd);

    const compiled = NetlistCompiler.compile(graph, { mode: "op" });

    // Voltmeter -> 10Meg sensing resistor
    expect(compiled.netlist).toMatch(/R_XMM1_sense \S+ \S+ 10meg/);
    // Ammeter -> 0V current sensing source
    expect(compiled.netlist).toMatch(/V_XMM2_sense \S+ \S+ 0V/);
  });
});

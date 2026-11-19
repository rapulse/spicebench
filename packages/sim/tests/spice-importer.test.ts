import { describe, it, expect } from "vitest";
import { SpiceImporter } from "../src/parser/spice-importer";
import { NetlistCompiler } from "../src/compiler/netlist-compiler";
import { CircuitGraph } from "@spicebench/core";

describe("Phase 8.3: SPICE Netlist Importer (.cir to CircuitGraph)", () => {
  it("imports a classic resistive voltage divider netlist", () => {
    const netlist = `
* Classic Voltage Divider
V1 in 0 DC 10V
R1 in out 1k
R2 out 0 2k
.op
.end
`;

    const result = SpiceImporter.importNetlist(netlist, "Divider Import");
    expect(result.warnings).toHaveLength(0);
    expect(result.project.meta.name).toBe("Divider Import");

    const graph = CircuitGraph.fromProject(result.project);
    expect(graph.getAllComponents().length).toBeGreaterThanOrEqual(3); // V1, R1, R2, GNDs

    const r1 = graph.getComponent("R1");
    expect(r1).toBeDefined();
    expect(r1?.type).toBe("RESISTOR");
    expect(r1?.params["resistance"]).toBe("1k");

    const v1 = graph.getComponent("V1");
    expect(v1).toBeDefined();
    expect(v1?.type).toBe("DC_VOLTAGE_SOURCE");
    expect(v1?.params["voltage"]).toBe("10V");

    // Wires should be created
    expect(graph.getAllWires().length).toBeGreaterThan(0);

    // Verify it compiles back to a valid SPICE netlist!
    const compiled = NetlistCompiler.compile(graph, { mode: "op" });
    expect(compiled.netlist).toContain("R_R1");
    expect(compiled.netlist).toContain("V_V1");
  });

  it("imports digital logic gates and subcircuits", () => {
    const netlist = `
* Digital Logic
Vcc 1 0 DC 5V
X1 1 1 2 GATE_AND
X2 2 3 GATE_NOT
.op
.end
`;

    const result = SpiceImporter.importNetlist(netlist);
    const graph = CircuitGraph.fromProject(result.project);

    const andGate = graph.getComponent("X1");
    expect(andGate).toBeDefined();
    expect(andGate?.type).toBe("AND_GATE");

    const notGate = graph.getComponent("X2");
    expect(notGate).toBeDefined();
    expect(notGate?.type).toBe("NOT_GATE");
  });

  it("handles line continuations and semiconductor devices", () => {
    const netlist = `
* Semiconductor Test
V1 in 0 DC 12V
D1 in mid 1N4148
Q1 out mid 0 2N3904
M1 drain out 0 0 2N7000
`;

    const result = SpiceImporter.importNetlist(netlist);
    const graph = CircuitGraph.fromProject(result.project);

    expect(graph.getComponent("D1")?.type).toBe("DIODE");
    expect(graph.getComponent("Q1")?.type).toBe("BJT_NPN");
    expect(graph.getComponent("M1")?.type).toBe("NMOS");
  });
});

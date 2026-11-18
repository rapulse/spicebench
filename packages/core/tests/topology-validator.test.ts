import { describe, it, expect } from "vitest";
import { CircuitGraph } from "../src/graph/circuit-graph";
import { TopologyValidator } from "../src/validator/topology-validator";
import { createDefaultComponent } from "../src/schema/component";

describe("TopologyValidator (Pre-SPICE Circuit Rule Checks)", () => {
  it("passes validation on a valid Voltage Divider circuit", () => {
    const graph = new CircuitGraph();

    const v1 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V1", { x: 10, y: 15 }, 0);
    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 20, y: 10 }, 90);
    const r2 = createDefaultComponent("RESISTOR", "R2", { x: 20, y: 20 }, 90);
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

    const result = TopologyValidator.validate(graph);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("detects NO_GROUND error when Ground is missing", () => {
    const graph = new CircuitGraph();

    const v1 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V1", { x: 10, y: 10 });
    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 20, y: 10 });
    graph.addComponent(v1);
    graph.addComponent(r1);

    graph.connectPins(
      { componentId: "V1", pinId: "pos" },
      { componentId: "R1", pinId: "1" },
    );
    graph.connectPins(
      { componentId: "V1", pinId: "neg" },
      { componentId: "R1", pinId: "2" },
    );

    const result = TopologyValidator.validate(graph);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === "NO_GROUND")).toBe(true);
  });

  it("detects FLOATING_NODE warning for unconnected pins", () => {
    const graph = new CircuitGraph();

    const v1 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V1", { x: 10, y: 10 });
    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 20, y: 10 });
    const gnd = createDefaultComponent("GROUND", "GND1", { x: 10, y: 20 });
    graph.addComponent(v1);
    graph.addComponent(r1);
    graph.addComponent(gnd);

    // Connect V1.neg to GND, and V1.pos to R1.1, but leave R1.2 floating!
    graph.connectPins(
      { componentId: "V1", pinId: "neg" },
      { componentId: "GND1", pinId: "0" },
    );
    graph.connectPins(
      { componentId: "V1", pinId: "pos" },
      { componentId: "R1", pinId: "1" },
    );

    const result = TopologyValidator.validate(graph);
    const floatingWarning = result.warnings.find(
      (w) =>
        w.code === "FLOATING_NODE" &&
        w.pinIds?.some((p) => p.componentId === "R1" && p.pinId === "2"),
    );
    expect(floatingWarning).toBeDefined();
  });

  it("detects VOLTAGE_SOURCE_LOOP when a source is shorted to itself", () => {
    const graph = new CircuitGraph();

    const v1 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V1", { x: 10, y: 10 });
    const gnd = createDefaultComponent("GROUND", "GND1", { x: 10, y: 20 });
    graph.addComponent(v1);
    graph.addComponent(gnd);

    // Short V1.pos directly to V1.neg
    graph.connectPins(
      { componentId: "V1", pinId: "pos" },
      { componentId: "V1", pinId: "neg" },
    );
    graph.connectPins(
      { componentId: "V1", pinId: "neg" },
      { componentId: "GND1", pinId: "0" },
    );

    const result = TopologyValidator.validate(graph);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === "VOLTAGE_SOURCE_LOOP")).toBe(true);
  });

  it("detects VOLTAGE_SOURCE_LOOP when two voltage sources are connected in parallel", () => {
    const graph = new CircuitGraph();

    const v1 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V1", { x: 10, y: 10 });
    const v2 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V2", { x: 20, y: 10 });
    const gnd = createDefaultComponent("GROUND", "GND1", { x: 10, y: 20 });
    graph.addComponent(v1);
    graph.addComponent(v2);
    graph.addComponent(gnd);

    // Connect both positives together
    graph.connectPins(
      { componentId: "V1", pinId: "pos" },
      { componentId: "V2", pinId: "pos" },
    );
    // Connect both negatives together to GND
    graph.connectPins(
      { componentId: "V1", pinId: "neg" },
      { componentId: "GND1", pinId: "0" },
    );
    graph.connectPins(
      { componentId: "V2", pinId: "neg" },
      { componentId: "GND1", pinId: "0" },
    );

    const result = TopologyValidator.validate(graph);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === "VOLTAGE_SOURCE_LOOP")).toBe(true);
  });

  it("detects NO_DC_PATH_TO_GROUND for intermediate node between two series capacitors", () => {
    const graph = new CircuitGraph();

    const v1 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V1", { x: 10, y: 10 });
    const c1 = createDefaultComponent("CAPACITOR", "C1", { x: 20, y: 10 });
    const c2 = createDefaultComponent("CAPACITOR", "C2", { x: 30, y: 10 });
    const gnd = createDefaultComponent("GROUND", "GND1", { x: 10, y: 20 });

    graph.addComponent(v1);
    graph.addComponent(c1);
    graph.addComponent(c2);
    graph.addComponent(gnd);

    graph.connectPins(
      { componentId: "V1", pinId: "neg" },
      { componentId: "GND1", pinId: "0" },
    );
    graph.connectPins(
      { componentId: "V1", pinId: "pos" },
      { componentId: "C1", pinId: "1" },
    );

    // Node between C1.2 and C2.1 has NO DC path to ground!
    graph.connectPins(
      { componentId: "C1", pinId: "2" },
      { componentId: "C2", pinId: "1" },
    );

    graph.connectPins(
      { componentId: "C2", pinId: "2" },
      { componentId: "GND1", pinId: "0" },
    );

    const result = TopologyValidator.validate(graph);
    expect(result.isValid).toBe(false);
    const dcError = result.errors.find((e) => e.code === "NO_DC_PATH_TO_GROUND");
    expect(dcError).toBeDefined();
    expect(dcError?.componentIds).toContain("C1");
    expect(dcError?.componentIds).toContain("C2");
  });

  it("fails on EMPTY_CIRCUIT", () => {
    const emptyGraph = new CircuitGraph();
    const result = TopologyValidator.validate(emptyGraph);
    expect(result.isValid).toBe(false);
    expect(result.errors[0]?.code).toBe("EMPTY_CIRCUIT");
  });
});

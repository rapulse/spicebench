import { describe, it, expect } from "vitest";
import { CircuitGraph } from "../src/graph/circuit-graph";
import { NetExtractor } from "../src/graph/net-extractor";
import { createDefaultComponent } from "../src/schema/component";

describe("NetExtractor - Electrical Connectivity & SPICE Node Mapping", () => {
  it("extracts Ground net and positive node for a series loop", () => {
    const graph = new CircuitGraph();

    const v1 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V1", { x: 10, y: 15 }, 0);
    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 20, y: 15 }, 90);
    const gnd = createDefaultComponent("GROUND", "GND1", { x: 10, y: 25 }, 0);

    graph.addComponent(v1);
    graph.addComponent(r1);
    graph.addComponent(gnd);

    // V1.pos is at {10, 13}, R1.1 is at {20, 13}
    graph.connectPins(
      { componentId: "V1", pinId: "pos" },
      { componentId: "R1", pinId: "1" },
    );

    // V1.neg is at {10, 17}, GND.0 is at {10, 25}
    graph.connectPins(
      { componentId: "V1", pinId: "neg" },
      { componentId: "GND1", pinId: "0" },
    );

    // R1.2 is at {20, 17}, connect to GND.0
    graph.connectPins(
      { componentId: "R1", pinId: "2" },
      { componentId: "GND1", pinId: "0" },
    );

    const nets = NetExtractor.extractNets(graph);

    // Must find ground net (id: "0") and power net
    const groundNet = nets.find((n) => n.isGround);
    expect(groundNet).toBeDefined();
    expect(groundNet?.spiceNodeName).toBe("0");

    // Ground net must contain GND1:0, V1:neg, R1:2
    const gndPinStrings = groundNet?.pins.map((p) => `${p.componentId}:${p.pinId}`);
    expect(gndPinStrings).toContain("GND1:0");
    expect(gndPinStrings).toContain("V1:neg");
    expect(gndPinStrings).toContain("R1:2");

    // Other net must contain V1:pos and R1:1
    const vPosNet = nets.find((n) => !n.isGround && n.pins.some((p) => p.componentId === "V1"));
    expect(vPosNet).toBeDefined();
    expect(vPosNet?.spiceNodeName).toBe("N001");
    const vPosPinStrings = vPosNet?.pins.map((p) => `${p.componentId}:${p.pinId}`);
    expect(vPosPinStrings).toContain("V1:pos");
    expect(vPosPinStrings).toContain("R1:1");
  });

  it("extracts 3 distinct nets for a Voltage Divider with T-junction", () => {
    const graph = new CircuitGraph();

    const v1 = createDefaultComponent("DC_VOLTAGE_SOURCE", "V1", { x: 10, y: 15 }, 0);
    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 20, y: 10 }, 90);
    const r2 = createDefaultComponent("RESISTOR", "R2", { x: 20, y: 20 }, 90);
    const gnd = createDefaultComponent("GROUND", "GND1", { x: 10, y: 25 }, 0);

    graph.addComponent(v1);
    graph.addComponent(r1);
    graph.addComponent(r2);
    graph.addComponent(gnd);

    // Net 1 (top): V1:pos -> R1:1
    graph.connectPins(
      { componentId: "V1", pinId: "pos" },
      { componentId: "R1", pinId: "1" },
    );

    // Bus wire: R1:2 -> R2:1
    const midWire = graph.connectPins(
      { componentId: "R1", pinId: "2" },
      { componentId: "R2", pinId: "1" },
    );

    // Add Multimeter XMM1 connected to midpoint via junction
    const xmm = createDefaultComponent("MULTIMETER", "XMM1", { x: 30, y: 15 });
    graph.addComponent(xmm);

    // Connect XMM1.pos to midWire at {20, 15}
    graph.connectToWireAt({ componentId: "XMM1", pinId: "pos" }, midWire.id, { x: 20, y: 15 });

    // Net 0 (Ground): V1:neg, R2:2, XMM1:neg, GND:0
    graph.connectPins(
      { componentId: "V1", pinId: "neg" },
      { componentId: "GND1", pinId: "0" },
    );
    graph.connectPins(
      { componentId: "R2", pinId: "2" },
      { componentId: "GND1", pinId: "0" },
    );
    graph.connectPins(
      { componentId: "XMM1", pinId: "neg" },
      { componentId: "GND1", pinId: "0" },
    );

    const nets = NetExtractor.extractNets(graph);

    // Ground net
    const groundNet = nets.find((n) => n.isGround);
    expect(groundNet?.spiceNodeName).toBe("0");
    const gndPins = groundNet?.pins.map((p) => `${p.componentId}:${p.pinId}`);
    expect(gndPins).toContain("GND1:0");
    expect(gndPins).toContain("V1:neg");
    expect(gndPins).toContain("R2:2");
    expect(gndPins).toContain("XMM1:neg");

    // Divider middle node
    const midNet = nets.find((n) => n.pins.some((p) => p.componentId === "R1" && p.pinId === "2"));
    expect(midNet).toBeDefined();
    expect(midNet?.isGround).toBe(false);
    const midPins = midNet?.pins.map((p) => `${p.componentId}:${p.pinId}`);
    expect(midPins).toContain("R1:2");
    expect(midPins).toContain("R2:1");
    expect(midPins).toContain("XMM1:pos");
    expect(midNet?.junctions.length).toBe(1);
  });
});

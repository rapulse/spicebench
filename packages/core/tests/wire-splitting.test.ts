import { describe, it, expect, beforeEach } from "vitest";
import { CircuitGraph } from "../src/graph/circuit-graph";
import { createDefaultComponent } from "../src/schema/component";
import { isPinEndpoint, isJunctionEndpoint } from "../src/schema/wire";

describe("CircuitGraph - Wire Splitting & Junction Dots", () => {
  let graph: CircuitGraph;

  beforeEach(() => {
    graph = new CircuitGraph();
  });

  it("splits a straight horizontal wire with a junction dot", () => {
    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 }, 0);
    const r2 = createDefaultComponent("RESISTOR", "R2", { x: 30, y: 10 }, 0);
    graph.addComponent(r1);
    graph.addComponent(r2);

    // Wire from R1.2 {12, 10} to R2.1 {28, 10}
    const originalWire = graph.connectPins(
      { componentId: "R1", pinId: "2" },
      { componentId: "R2", pinId: "1" },
    );

    // Split at { x: 20, y: 10 }
    const splitPoint = { x: 20, y: 10 };
    const { junction, wire1, wire2 } = graph.splitWireAt(originalWire.id, splitPoint);

    expect(junction).toBeDefined();
    expect(junction.position).toEqual(splitPoint);
    expect(graph.getAllJunctions().length).toBe(1);

    // wire1 goes from R1.2 to Junction
    expect(isPinEndpoint(wire1.from) && wire1.from.componentId === "R1").toBe(true);
    expect(isJunctionEndpoint(wire1.to) && wire1.to.junctionId === junction.id).toBe(true);
    expect(wire1.points).toEqual([
      { x: 12, y: 10 },
      { x: 20, y: 10 },
    ]);

    // wire2 goes from Junction to R2.1
    expect(isJunctionEndpoint(wire2.from) && wire2.from.junctionId === junction.id).toBe(true);
    expect(isPinEndpoint(wire2.to) && wire2.to.componentId === "R2").toBe(true);
    expect(wire2.points).toEqual([
      { x: 20, y: 10 },
      { x: 28, y: 10 },
    ]);

    expect(graph.getAllWires().length).toBe(2);
  });

  it("splits an L-shaped wire correctly across corners", () => {
    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 }, 0);
    const r2 = createDefaultComponent("RESISTOR", "R2", { x: 20, y: 30 }, 0);
    graph.addComponent(r1);
    graph.addComponent(r2);

    // Explicit L-shaped wire: {12, 10} -> {20, 10} -> {20, 30}
    const wire = graph.connectPins(
      { componentId: "R1", pinId: "2" },
      { componentId: "R2", pinId: "1" },
      [
        { x: 12, y: 10 },
        { x: 20, y: 10 },
        { x: 20, y: 30 },
      ],
    );

    // Split on vertical segment at {20, 20}
    const { junction, wire1, wire2 } = graph.splitWireAt(wire.id, { x: 20, y: 20 });

    expect(junction.position).toEqual({ x: 20, y: 20 });

    // wire1: {12, 10} -> {20, 10} -> {20, 20}
    expect(wire1.points).toEqual([
      { x: 12, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
    ]);

    // wire2: {20, 20} -> {20, 30}
    expect(wire2.points).toEqual([
      { x: 20, y: 20 },
      { x: 20, y: 30 },
    ]);
  });

  it("connects a branch pin directly to an existing wire with connectToWireAt", () => {
    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 }, 0);
    const r2 = createDefaultComponent("RESISTOR", "R2", { x: 30, y: 10 }, 0);
    const r3 = createDefaultComponent("RESISTOR", "R3", { x: 20, y: 25 }, 90);
    graph.addComponent(r1);
    graph.addComponent(r2);
    graph.addComponent(r3);

    const busWire = graph.connectPins(
      { componentId: "R1", pinId: "2" }, // {12, 10}
      { componentId: "R2", pinId: "1" }, // {28, 10}
    );

    // Connect R3.1 (pin 1 of R3 rotated 90 deg is at {20, 23}) to busWire at {20, 10}
    const { junction, branchWire } = graph.connectToWireAt(
      { componentId: "R3", pinId: "1" },
      busWire.id,
      { x: 20, y: 10 },
    );

    expect(junction.position).toEqual({ x: 20, y: 10 });
    expect(graph.getAllWires().length).toBe(3); // wire1 + wire2 + branchWire

    expect(branchWire.to).toEqual({ junctionId: junction.id });
    expect(isPinEndpoint(branchWire.from) && branchWire.from.componentId === "R3").toBe(true);
  });

  it("throws when split point does not lie on wire", () => {
    const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 }, 0);
    const r2 = createDefaultComponent("RESISTOR", "R2", { x: 30, y: 10 }, 0);
    graph.addComponent(r1);
    graph.addComponent(r2);

    const wire = graph.connectPins(
      { componentId: "R1", pinId: "2" },
      { componentId: "R2", pinId: "1" },
    );

    expect(() => graph.splitWireAt(wire.id, { x: 50, y: 50 })).toThrow(/does not lie on wire/i);
  });
});

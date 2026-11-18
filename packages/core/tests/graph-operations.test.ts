import { describe, it, expect, beforeEach } from "vitest";
import { CircuitGraph } from "../src/graph/circuit-graph";
import { createDefaultComponent } from "../src/schema/component";

describe("CircuitGraph - Component & Wire Operations", () => {
  let graph: CircuitGraph;

  beforeEach(() => {
    graph = new CircuitGraph();
  });

  describe("Component lifecycle", () => {
    it("adds components with unique IDs", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 });
      graph.addComponent(r1);

      expect(graph.getAllComponents().length).toBe(1);
      expect(graph.getComponent("R1")).toEqual(r1);

      // Throws on duplicate ID
      expect(() => graph.addComponent(r1)).toThrow(/already exists/);
    });

    it("moves a component and updates connected wire terminals", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 }, 0);
      const r2 = createDefaultComponent("RESISTOR", "R2", { x: 20, y: 10 }, 0);
      graph.addComponent(r1);
      graph.addComponent(r2);

      // Connect R1.2 (at {12, 10}) to R2.1 (at {18, 10})
      const wire = graph.connectPins(
        { componentId: "R1", pinId: "2" },
        { componentId: "R2", pinId: "1" },
      );

      expect(wire.points[0]).toEqual({ x: 12, y: 10 });
      expect(wire.points[wire.points.length - 1]).toEqual({ x: 18, y: 10 });

      // Move R1 by (+5, +2) to { x: 15, y: 12 }
      graph.moveComponent("R1", { x: 15, y: 12 });
      const movedR1 = graph.getComponent("R1")!;
      expect(movedR1.position).toEqual({ x: 15, y: 12 });

      // R1.2 is now at { x: 17, y: 12 }
      const updatedWire = graph.getWire(wire.id)!;
      expect(updatedWire.points[0]).toEqual({ x: 17, y: 12 });
      expect(updatedWire.points[updatedWire.points.length - 1]).toEqual({ x: 18, y: 10 });
    });

    it("rotates a component and updates pin locations", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 }, 0);
      graph.addComponent(r1);

      graph.rotateComponent("R1", 90);
      expect(graph.getComponent("R1")!.rotation).toBe(90);

      graph.rotateComponent("R1", 90);
      expect(graph.getComponent("R1")!.rotation).toBe(180);

      graph.rotateComponent("R1", 180);
      expect(graph.getComponent("R1")!.rotation).toBe(0);
    });

    it("removes a component and its connected wires", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 });
      const r2 = createDefaultComponent("RESISTOR", "R2", { x: 20, y: 10 });
      graph.addComponent(r1);
      graph.addComponent(r2);

      const w1 = graph.connectPins(
        { componentId: "R1", pinId: "2" },
        { componentId: "R2", pinId: "1" },
      );

      expect(graph.getAllWires().length).toBe(1);

      const { removedComponent, removedWires } = graph.removeComponent("R1");
      expect(removedComponent.id).toBe("R1");
      expect(removedWires.map((w) => w.id)).toContain(w1.id);

      expect(graph.getComponent("R1")).toBeUndefined();
      expect(graph.getWire(w1.id)).toBeUndefined();
      expect(graph.getAllWires().length).toBe(0);
    });
  });

  describe("Hit testing and coordinate queries", () => {
    it("finds component pin at exact coordinates", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 }, 0);
      graph.addComponent(r1);

      // Pin 1 is at { 8, 10 }, Pin 2 is at { 12, 10 }
      const pinHit1 = graph.findPinAt({ x: 8, y: 10 });
      expect(pinHit1).toBeDefined();
      expect(pinHit1?.component.id).toBe("R1");
      expect(pinHit1?.pinId).toBe("1");

      const pinHit2 = graph.findPinAt({ x: 12, y: 10 });
      expect(pinHit2?.pinId).toBe("2");

      expect(graph.findPinAt({ x: 0, y: 0 })).toBeUndefined();
    });

    it("finds wire at point on segment", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 }, 0);
      const r2 = createDefaultComponent("RESISTOR", "R2", { x: 30, y: 10 }, 0);
      graph.addComponent(r1);
      graph.addComponent(r2);

      const wire = graph.connectPins(
        { componentId: "R1", pinId: "2" }, // {12, 10}
        { componentId: "R2", pinId: "1" }, // {28, 10}
      );

      const hit = graph.findWireAt({ x: 20, y: 10 });
      expect(hit).toBeDefined();
      expect(hit?.wire.id).toBe(wire.id);

      // Point outside wire
      expect(graph.findWireAt({ x: 20, y: 11 })).toBeUndefined();
    });
  });
});

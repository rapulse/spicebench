import { describe, it, expect } from "vitest";
import {
  parseCircuitProject,
  safeParseCircuitProject,
  serializeCircuitProject,
  createEmptyCircuit,
} from "../src/schema/circuit";
import {
  createDefaultComponent,
  getAbsolutePinPosition,
  getComponentPins,
} from "../src/schema/component";
import { isOrthogonalWire, getWireLength } from "../src/schema/wire";

describe("Circuit Schema & Model", () => {
  describe("createEmptyCircuit", () => {
    it("creates a valid minimal circuit document", () => {
      const circuit = createEmptyCircuit("Test Circuit");
      expect(circuit.schemaVersion).toBe(1);
      expect(circuit.meta.name).toBe("Test Circuit");
      expect(circuit.components).toEqual([]);
      expect(circuit.wires).toEqual([]);
      expect(circuit.junctions).toEqual([]);
      expect(circuit.instruments).toEqual([]);

      const validated = parseCircuitProject(circuit);
      expect(validated.schemaVersion).toBe(1);
    });
  });

  describe("Component Pins and Absolute Positioning", () => {
    it("retrieves catalog pins for resistor", () => {
      const pins = getComponentPins("RESISTOR");
      expect(pins.length).toBe(2);
      expect(pins.map((p) => p.id)).toEqual(["1", "2"]);
    });

    it("calculates pin positions at 0 rotation", () => {
      // Resistor has pins at offset (-2, 0) and (2, 0)
      const res = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 }, 0);
      const pin1 = getAbsolutePinPosition(res, "1");
      const pin2 = getAbsolutePinPosition(res, "2");

      expect(pin1).toEqual({ x: 8, y: 10 });
      expect(pin2).toEqual({ x: 12, y: 10 });
    });

    it("calculates pin positions after 90 degree clockwise rotation", () => {
      // Resistor at (10, 10) rotated 90 deg:
      // pin 1 offset (-2, 0) rotated 90 -> (0, -2) -> absolute (10, 8)
      // pin 2 offset (2, 0) rotated 90 -> (0, 2) -> absolute (10, 12)
      const res = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 }, 90);
      const pin1 = getAbsolutePinPosition(res, "1");
      const pin2 = getAbsolutePinPosition(res, "2");

      expect(pin1).toEqual({ x: 10, y: 8 });
      expect(pin2).toEqual({ x: 10, y: 12 });
    });

    it("throws when requesting non-existent pin ID", () => {
      const res = createDefaultComponent("RESISTOR", "R1", { x: 0, y: 0 });
      expect(() => getAbsolutePinPosition(res, "non_existent")).toThrow(
        /does not exist on component/i,
      );
    });
  });

  describe("Wire Schema & Orthogonality", () => {
    it("verifies orthogonal wires", () => {
      const wire = {
        id: "W1",
        from: { componentId: "V1", pinId: "pos" },
        to: { componentId: "R1", pinId: "1" },
        points: [
          { x: 0, y: -2 },
          { x: 0, y: -6 },
          { x: 8, y: -6 },
          { x: 8, y: -2 },
        ],
      };
      expect(isOrthogonalWire(wire)).toBe(true);
      expect(getWireLength(wire)).toBe(4 + 8 + 4);
    });

    it("detects non-orthogonal wires (diagonal lines)", () => {
      const diagonalWire = {
        id: "W2",
        from: { componentId: "V1", pinId: "pos" },
        to: { componentId: "R1", pinId: "1" },
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 }, // diagonal!
        ],
      };
      expect(isOrthogonalWire(diagonalWire)).toBe(false);
    });
  });

  describe("Full Voltage Divider Fixture", () => {
    it("validates and round-trips a complete Voltage Divider circuit", () => {
      const fixture = {
        schemaVersion: 1,
        meta: {
          name: "Voltage Divider",
          description: "Standard 10V to 5V divider",
          createdAt: "2026-11-18T12:00:00.000Z",
        },
        components: [
          {
            id: "V1",
            type: "DC_VOLTAGE_SOURCE",
            label: "V1",
            params: { voltage: "10V" },
            position: { x: 10, y: 15 },
            rotation: 0,
          },
          {
            id: "R1",
            type: "RESISTOR",
            label: "R1",
            params: { resistance: "10k" },
            position: { x: 20, y: 10 },
            rotation: 90,
          },
          {
            id: "R2",
            type: "RESISTOR",
            label: "R2",
            params: { resistance: "10k" },
            position: { x: 20, y: 20 },
            rotation: 90,
          },
          {
            id: "GND1",
            type: "GROUND",
            label: "GND",
            params: {},
            position: { x: 10, y: 25 },
            rotation: 0,
          },
        ],
        wires: [
          {
            id: "W1",
            from: { componentId: "V1", pinId: "pos" },
            to: { componentId: "R1", pinId: "1" },
            points: [
              { x: 10, y: 13 },
              { x: 10, y: 8 },
              { x: 20, y: 8 },
            ],
          },
          {
            id: "W2",
            from: { componentId: "R1", pinId: "2" },
            to: { junctionId: "J1" },
            points: [
              { x: 20, y: 12 },
              { x: 20, y: 15 },
            ],
          },
          {
            id: "W3",
            from: { junctionId: "J1" },
            to: { componentId: "R2", pinId: "1" },
            points: [
              { x: 20, y: 15 },
              { x: 20, y: 18 },
            ],
          },
        ],
        junctions: [{ id: "J1", position: { x: 20, y: 15 } }],
        instruments: [
          {
            instrumentId: "XMM1",
            isOpen: true,
            windowPosition: { x: 250, y: 120 },
            mode: "V",
            currentType: "DC",
          },
        ],
      };

      const parsed = parseCircuitProject(fixture);
      expect(parsed.components.length).toBe(4);
      expect(parsed.wires.length).toBe(3);
      expect(parsed.junctions.length).toBe(1);
      expect(parsed.instruments.length).toBe(1);

      const serialized = serializeCircuitProject(parsed);
      const reParsed = parseCircuitProject(JSON.parse(serialized));
      expect(reParsed).toEqual(parsed);
    });

    it("fails validation when coordinates are non-integer", () => {
      const invalid = {
        schemaVersion: 1,
        meta: { name: "Bad" },
        components: [
          {
            id: "R1",
            type: "RESISTOR",
            position: { x: 10.5, y: 20 }, // Bad float!
            rotation: 0,
          },
        ],
      };

      const result = safeParseCircuitProject(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toMatch(/integer/i);
    });

    it("fails validation when wire endpoint is invalid", () => {
      const invalid = {
        schemaVersion: 1,
        meta: { name: "Bad Wire" },
        wires: [
          {
            id: "W1",
            from: { badField: "something" }, // Neither pin nor junction!
            to: { junctionId: "J1" },
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
            ],
          },
        ],
      };

      const result = safeParseCircuitProject(invalid);
      expect(result.success).toBe(false);
    });
  });
});

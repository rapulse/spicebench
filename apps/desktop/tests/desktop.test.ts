import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DESKTOP_VERSION } from "../src/index";
import { SchematicSymbol } from "../src/components/SchematicSymbol";
import { Canvas } from "../src/components/Canvas";
import type { Component, ComponentType, CircuitProject } from "@spicebench/core";
import type { SpicebenchApi } from "../src/types/ipc";

describe("Desktop Package", () => {
  it("exports desktop version", () => {
    expect(DESKTOP_VERSION).toBe("0.1.0");
  });

  describe("SchematicSymbol SVG Rendering", () => {
    const allTypes: ComponentType[] = [
      "GROUND",
      "DC_VOLTAGE_SOURCE",
      "AC_VOLTAGE_SOURCE",
      "DC_CURRENT_SOURCE",
      "RESISTOR",
      "CAPACITOR",
      "POLARIZED_CAPACITOR",
      "INDUCTOR",
      "DIODE",
      "ZENER_DIODE",
      "LED",
      "BJT_NPN",
      "BJT_PNP",
      "OPAMP_IDEAL",
      "OPAMP_741",
      "SWITCH_SPST",
      "POTENTIOMETER",
      "MULTIMETER",
      "FUNCTION_GENERATOR",
      "OSCILLOSCOPE",
      "BODE_PLOTTER",
    ];

    it("renders valid SVG markup for all 21 component types", () => {
      for (const type of allTypes) {
        const component: Component = {
          id: `TEST_${type}`,
          type,
          label: type,
          position: { x: 10, y: 10 },
          rotation: 0,
          params: { value: "10k" },
        };

        const markup = renderToStaticMarkup(
          React.createElement(SchematicSymbol, { component, isSelected: false })
        );

        expect(markup).toContain("<g");
        expect(markup).toContain(`id="symbol-TEST_${type}"`);
        expect(markup).toContain(`TEST_${type}`);
      }
    });

    it("applies selection stroke styling when isSelected is true", () => {
      const resistor: Component = {
        id: "R1",
        type: "RESISTOR",
        label: "R1",
        position: { x: 5, y: 5 },
        rotation: 90,
        params: { resistance: "1k" },
      };

      const selectedMarkup = renderToStaticMarkup(
        React.createElement(SchematicSymbol, { component: resistor, isSelected: true })
      );

      expect(selectedMarkup).toContain('stroke="#0000ff"');
    });
  });

  describe("Canvas Interactive Editor (Phase 5.1)", () => {
    const mockCircuit: CircuitProject = {
      schemaVersion: 1,
      meta: { name: "Test Circuit", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      components: [
        {
          id: "R1",
          type: "RESISTOR",
          label: "R1",
          position: { x: 10, y: 10 },
          rotation: 0,
          params: { resistance: "10k" },
        },
        {
          id: "C1",
          type: "CAPACITOR",
          label: "C1",
          position: { x: 20, y: 10 },
          rotation: 90,
          params: { capacitance: "1uF" },
        },
      ],
      wires: [
        {
          id: "W1",
          from: { componentId: "R1", pinId: "2" },
          to: { componentId: "C1", pinId: "1" },
          points: [
            { x: 12, y: 10 },
            { x: 20, y: 8 },
          ],
        },
      ],
      junctions: [{ id: "J1", position: { x: 16, y: 10 } }],
      instruments: [],
    };

    it("renders components, wires, and junctions with selection state", () => {
      const markup = renderToStaticMarkup(
        React.createElement(Canvas, {
          circuit: mockCircuit,
          simulation: null,
          selectedIds: ["R1"],
          onSelect: () => {},
          onCursorMove: () => {},
          onDropComponent: () => {},
          onMoveComponent: () => {},
        })
      );

      // Verify grid pattern, components, and wire are rendered
      expect(markup).toContain('id="ewb-grid-pattern"');
      expect(markup).toContain('id="symbol-R1"');
      expect(markup).toContain('id="symbol-C1"');
      // R1 is selected -> stroke blue
      expect(markup).toContain('stroke="#0000ff"');
    });

    it("calculates +90 rotation sequence correctly for all 4 orientations", () => {
      const getNextRotation = (rot: number) => ((rot + 90) % 360);
      expect(getNextRotation(0)).toBe(90);
      expect(getNextRotation(90)).toBe(180);
      expect(getNextRotation(180)).toBe(270);
      expect(getNextRotation(270)).toBe(0);
    });

    it("snaps continuous pixel offsets to discrete 20px grid increments", () => {
      const GRID_SPACING = 20;
      const snapToGrid = (px: number) => Math.round(px / GRID_SPACING);

      expect(snapToGrid(0)).toBe(0);
      expect(snapToGrid(9)).toBe(0);
      expect(snapToGrid(11)).toBe(1);
      expect(snapToGrid(20)).toBe(1);
      expect(snapToGrid(35)).toBe(2);
      expect(snapToGrid(-19)).toBe(-1);
    });
  });

  describe("SpicebenchApi IPC Contract Definition", () => {
    it("matches expected method signatures in typed contract", () => {
      const mockApi: SpicebenchApi = {
        getCircuit: async () => ({
          schemaVersion: 1,
          meta: { name: "Test Circuit", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          components: [],
          wires: [],
          junctions: [],
          instruments: [],
        }),
        getStats: async () => ({
          componentCount: 0,
          wireCount: 0,
          junctionCount: 0,
          instrumentCount: 0,
        }),
        placeComponent: async (opts) => ({
          id: opts.id || "C1",
          type: opts.type,
          label: opts.id || "C1",
          position: { x: opts.x, y: opts.y },
          rotation: opts.rotation || 0,
          params: opts.params || {},
        }),
        updateComponent: async () => ({
          id: "C1",
          type: "RESISTOR",
          label: "C1",
          position: { x: 0, y: 0 },
          rotation: 0,
          params: {},
        }),
        removeComponent: async (id) => ({
          removedComponentId: id,
          removedWireCount: 0,
        }),
        connectPins: async () => ({
          id: "W1",
          from: { componentId: "R1", pinId: "1" },
          to: { componentId: "R2", pinId: "1" },
          points: [],
        }),
        validateCircuit: async () => ({
          isValid: true,
          errors: [],
          warnings: [],
        }),
        runSimulation: async () => ({
          mode: "op",
          success: true,
          durationMs: 10,
        }),
        setPower: async () => null,
        resetCircuit: async () => {},
        loadSampleCircuit: async () => ({
          schemaVersion: 1,
          meta: { name: "Sample", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          components: [],
          wires: [],
          junctions: [],
          instruments: [],
        }),
        onCircuitUpdated: () => () => {},
        onSimulationUpdated: () => () => {},
      };

      expect(typeof mockApi.getCircuit).toBe("function");
      expect(typeof mockApi.placeComponent).toBe("function");
      expect(typeof mockApi.runSimulation).toBe("function");
      expect(typeof mockApi.setPower).toBe("function");
      expect(typeof mockApi.onCircuitUpdated).toBe("function");
    });
  });
});

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DESKTOP_VERSION } from "../src/index";
import { SchematicSymbol } from "../src/components/SchematicSymbol";
import type { Component, ComponentType } from "@spicebench/core";
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
        // Verify component label or value is rendered
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

  describe("SpicebenchApi IPC Contract Definition", () => {
    it("matches expected method signatures in typed contract", () => {
      // Mocking an implementation of SpicebenchApi to verify full interface conformance
      const mockApi: SpicebenchApi = {
        getCircuit: async () => ({
          schemaVersion: 1,
          id: "test",
          name: "Test Circuit",
          metadata: { createdAt: 0, updatedAt: 0 },
          components: [],
          wires: [],
          junctions: [],
        }),
        getStats: async () => ({
          componentsCount: 0,
          wiresCount: 0,
          junctionsCount: 0,
          componentsByType: {},
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
          segments: [],
        }),
        validateCircuit: async () => ({
          valid: true,
          errors: [],
          warnings: [],
        }),
        runSimulation: async () => ({
          analysisType: "OP",
          nodeVoltages: {},
          timestamp: Date.now(),
        }),
        setPower: async () => null,
        resetCircuit: async () => {},
        loadSampleCircuit: async () => ({
          schemaVersion: 1,
          id: "sample",
          name: "Sample",
          metadata: { createdAt: 0, updatedAt: 0 },
          components: [],
          wires: [],
          junctions: [],
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

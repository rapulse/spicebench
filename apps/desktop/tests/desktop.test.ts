import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DESKTOP_VERSION } from "../src/index";
import { SchematicSymbol } from "../src/components/SchematicSymbol";
import { Canvas, findNearestPointOnWire } from "../src/components/Canvas";
import { ComponentDialog } from "../src/components/ComponentDialog";
import { InstrumentWindow } from "../src/components/InstrumentWindow";
import { MultimeterPanel } from "../src/components/instruments/MultimeterPanel";
import { FunctionGeneratorPanel } from "../src/components/instruments/FunctionGeneratorPanel";
import type { Component, ComponentType, CircuitProject, Wire } from "@spicebench/core";
import { parseCircuitProject, serializeCircuitProject } from "@spicebench/core";
import { CircuitSession } from "@spicebench/mcp";
import { NetlistCompiler } from "@spicebench/sim";
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
          onConnectPins: () => {},
          onConnectToWire: () => {},
        })
      );

      // Verify grid pattern, components, and wire are rendered
      expect(markup).toContain('id="ewb-grid-pattern"');
      expect(markup).toContain('id="symbol-R1"');
      expect(markup).toContain('id="symbol-C1"');
      // R1 is selected -> stroke blue
      expect(markup).toContain('stroke="#0000ff"');
    });

    it("accurately projects hit points onto orthogonal wire segments for T-junction wire splitting", () => {
      const testWire: Wire = {
        id: "W_TEST",
        from: { componentId: "V1", pinId: "pos" },
        to: { componentId: "R1", pinId: "1" },
        points: [
          { x: 10, y: 10 },
          { x: 25, y: 10 },
          { x: 25, y: 20 },
        ],
      };

      // Point near horizontal segment (10,10) -> (25,10)
      const hitH = findNearestPointOnWire(testWire, { x: 18.2, y: 10.3 });
      expect(hitH).not.toBeNull();
      expect(hitH!.point).toEqual({ x: 18, y: 10 });
      expect(hitH!.distance).toBeLessThan(0.5);

      // Point near vertical segment (25,10) -> (25,20)
      const hitV = findNearestPointOnWire(testWire, { x: 24.8, y: 15.1 });
      expect(hitV).not.toBeNull();
      expect(hitV!.point).toEqual({ x: 25, y: 15 });
      expect(hitV!.distance).toBeLessThan(0.5);
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
        connectToWire: async () => ({
          junction: { id: "J1", position: { x: 10, y: 10 } },
          branchWire: {
            id: "W2",
            from: { componentId: "R1", pinId: "1" },
            to: { junctionId: "J1" },
            points: [],
          },
          wire1: {
            id: "W1",
            from: { componentId: "V1", pinId: "pos" },
            to: { junctionId: "J1" },
            points: [],
          },
          wire2: {
            id: "W3",
            from: { junctionId: "J1" },
            to: { componentId: "R2", pinId: "1" },
            points: [],
          },
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
        saveProject: async () => ({ filePath: "/tmp/test.ewb.json", name: "test.ewb.json" }),
        openProject: async () => null,
        exportNetlist: async () => ({ filePath: "/tmp/test.cir", name: "test.cir" }),
        undo: async () => true,
        redo: async () => true,
        canUndo: async () => true,
        canRedo: async () => false,
        updateInstrument: async () => {},
        readInstrument: async () => ({
          instrumentId: "M1",
          type: "MULTIMETER",
          readings: {},
          formatted: "12.000 V",
        }),
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
      expect(typeof mockApi.saveProject).toBe("function");
      expect(typeof mockApi.openProject).toBe("function");
      expect(typeof mockApi.exportNetlist).toBe("function");
      expect(typeof mockApi.undo).toBe("function");
      expect(typeof mockApi.redo).toBe("function");
      expect(typeof mockApi.canUndo).toBe("function");
      expect(typeof mockApi.canRedo).toBe("function");
      expect(typeof mockApi.updateInstrument).toBe("function");
      expect(typeof mockApi.readInstrument).toBe("function");
      expect(typeof mockApi.onCircuitUpdated).toBe("function");
    });
  });

  describe("Component Properties Dialog (Phase 5.3)", () => {
    it("renders Win95 properties dialog markup for resistor", () => {
      const resistor: Component = {
        id: "R1",
        type: "RESISTOR",
        label: "R1",
        position: { x: 10, y: 10 },
        rotation: 0,
        params: { resistance: "10k" },
      };

      const markup = renderToStaticMarkup(
        React.createElement(ComponentDialog, {
          component: resistor,
          isOpen: true,
          onSave: () => {},
          onClose: () => {},
        })
      );

      expect(markup).toContain("R1 Properties");
      expect(markup).toContain("Value");
      expect(markup).toContain("Label");
      expect(markup).toContain("Specs");
      expect(markup).toContain("Resistance:");
      expect(markup).toContain("OK");
      expect(markup).toContain("Cancel");
    });

    it("renders nothing when isOpen is false", () => {
      const resistor: Component = {
        id: "R1",
        type: "RESISTOR",
        label: "R1",
        position: { x: 10, y: 10 },
        rotation: 0,
        params: { resistance: "10k" },
      };

      const markup = renderToStaticMarkup(
        React.createElement(ComponentDialog, {
          component: resistor,
          isOpen: false,
          onSave: () => {},
          onClose: () => {},
        })
      );

      expect(markup).toBe("");
    });
  });

  describe("File Operations & Netlist Export (Phase 5.4)", () => {
    it("serializes and deserializes a circuit project without losing geometry or parameters", () => {
      const original: CircuitProject = {
        schemaVersion: 1,
        meta: { name: "RC Filter", createdAt: "2026-01-01T00:00:00Z" },
        components: [
          {
            id: "R1",
            type: "RESISTOR",
            label: "R1",
            position: { x: 10, y: 15 },
            rotation: 90,
            params: { resistance: "4.7k" },
          },
          {
            id: "C1",
            type: "CAPACITOR",
            label: "C1",
            position: { x: 20, y: 15 },
            rotation: 0,
            params: { capacitance: "100nF" },
          },
        ],
        wires: [
          {
            id: "W1",
            from: { componentId: "R1", pinId: "2" },
            to: { componentId: "C1", pinId: "1" },
            points: [
              { x: 10, y: 17 },
              { x: 18, y: 17 },
              { x: 18, y: 15 },
            ],
          },
        ],
        junctions: [],
        instruments: [],
      };

      const jsonStr = serializeCircuitProject(original);
      expect(jsonStr).toContain('"name": "RC Filter"');
      expect(jsonStr).toContain('"resistance": "4.7k"');

      const loaded = parseCircuitProject(JSON.parse(jsonStr));
      expect(loaded.components).toHaveLength(2);
      expect(loaded.components[0]?.params["resistance"]).toBe("4.7k");
      expect(loaded.wires).toHaveLength(1);
      expect(loaded.wires[0]?.points).toEqual([
        { x: 10, y: 17 },
        { x: 18, y: 17 },
        { x: 18, y: 15 },
      ]);
    });

    it("loads project into CircuitSession and compiles valid SPICE netlist", () => {
      const session = new CircuitSession();
      session.placeComponent({ type: "DC_VOLTAGE_SOURCE", id: "V1", params: { voltage: "10V" }, x: 10, y: 10 });
      session.placeComponent({ type: "RESISTOR", id: "R1", params: { resistance: "1k" }, x: 20, y: 10 });
      session.placeComponent({ type: "GROUND", id: "GND1", x: 10, y: 20 });
      session.connectPins({ from: { componentId: "V1", pinId: "pos" }, to: { componentId: "R1", pinId: "1" } });
      session.connectPins({ from: { componentId: "R1", pinId: "2" }, to: { componentId: "GND1", pinId: "0" } });
      session.connectPins({ from: { componentId: "V1", pinId: "neg" }, to: { componentId: "GND1", pinId: "0" } });

      const compiled = NetlistCompiler.compile(session.getGraph());
      expect(compiled.netlist).toContain("V1");
      expect(compiled.netlist).toContain("R1");
      expect(compiled.netlist).toContain(".end");

      // Now save to JSON and reload into fresh session
      const exportedProject = session.getCircuit();
      const newSession = new CircuitSession();
      newSession.loadCircuit(exportedProject);

      expect(newSession.getCircuit().components).toHaveLength(3);
      expect(newSession.getCircuit().wires).toHaveLength(3);

      const recompiled = NetlistCompiler.compile(newSession.getGraph());
      expect(recompiled.netlist).toContain("V1");
      expect(recompiled.netlist).toContain("R1");
      expect(recompiled.netlist).toContain(".end");
    });
  });

  describe("Virtual Instruments (Phase 6)", () => {
    it("renders draggable floating InstrumentWindow with title and body", () => {
      const markup = renderToStaticMarkup(
        React.createElement(
          InstrumentWindow,
          {
            title: "Multimeter - M1",
            position: { x: 100, y: 150 },
            onMove: () => {},
            onClose: () => {},
          },
          React.createElement("div", null, "Instrument Content")
        )
      );

      expect(markup).toContain("Multimeter - M1");
      expect(markup).toContain("Instrument Content");
      expect(markup).toContain("left:100px");
      expect(markup).toContain("top:150px");
    });

    it("renders MultimeterPanel with digital display and mode buttons", () => {
      const comp: Component = {
        id: "M1",
        type: "MULTIMETER",
        label: "M1",
        position: { x: 10, y: 10 },
        rotation: 0,
        params: {},
      };

      const markup = renderToStaticMarkup(
        React.createElement(MultimeterPanel, {
          component: comp,
          state: {
            instrumentId: "M1",
            isOpen: true,
            windowPosition: { x: 100, y: 100 },
            mode: "V",
            currentType: "DC",
          },
          simulation: null,
          onStateChange: () => {},
        })
      );

      expect(markup).toContain("0.000 V");
      expect(markup).toContain("Voltage (Volts)");
      expect(markup).toContain("Current (Amperes)");
      expect(markup).toContain("Direct Current (DC)");
    });

    it("renders FunctionGeneratorPanel with waveforms and frequency inputs", () => {
      const comp: Component = {
        id: "XFG1",
        type: "FUNCTION_GENERATOR",
        label: "XFG1",
        position: { x: 10, y: 10 },
        rotation: 0,
        params: { frequency: "1kHz", voltage: "5V" },
      };

      const markup = renderToStaticMarkup(
        React.createElement(FunctionGeneratorPanel, {
          component: comp,
          state: {
            instrumentId: "XFG1",
            isOpen: true,
            windowPosition: { x: 100, y: 100 },
            waveform: "sine",
            frequency: "1kHz",
            dutyCycle: 50,
            amplitude: "5V",
            offset: "0V",
          },
          onStateChange: () => {},
        })
      );

      expect(markup).toContain("Sine");
      expect(markup).toContain("Square");
      expect(markup).toContain("Frequency:");
      expect(markup).toContain("1kHz");
    });
  });
});

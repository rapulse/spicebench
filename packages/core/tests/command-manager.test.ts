import { describe, it, expect, beforeEach } from "vitest";
import { CircuitGraph } from "../src/graph/circuit-graph";
import { CommandManager } from "../src/commands/command-manager";
import {
  AddComponentCommand,
  RemoveComponentCommand,
  MoveComponentCommand,
  RotateComponentCommand,
  UpdateComponentParamsCommand,
} from "../src/commands/component-commands";
import {
  ConnectWireCommand,
  RemoveWireCommand,
  SplitWireCommand,
} from "../src/commands/wire-commands";
import { BatchCommand } from "../src/commands/batch-command";
import { createDefaultComponent } from "../src/schema/component";
import { Wire } from "../src/schema/wire";

describe("Command Pattern & Undo/Redo System", () => {
  let graph: CircuitGraph;
  let cmdManager: CommandManager;

  beforeEach(() => {
    graph = new CircuitGraph();
    cmdManager = new CommandManager(50);
  });

  describe("Component Commands", () => {
    it("handles AddComponent execute -> undo -> redo", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 });
      const addCmd = new AddComponentCommand(r1);

      expect(cmdManager.canUndo).toBe(false);
      expect(cmdManager.canRedo).toBe(false);

      cmdManager.execute(addCmd, graph);
      expect(graph.getComponent("R1")).toBeDefined();
      expect(cmdManager.canUndo).toBe(true);

      // Undo
      cmdManager.undo(graph);
      expect(graph.getComponent("R1")).toBeUndefined();
      expect(cmdManager.canUndo).toBe(false);
      expect(cmdManager.canRedo).toBe(true);

      // Redo
      cmdManager.redo(graph);
      expect(graph.getComponent("R1")).toBeDefined();
      expect(cmdManager.canUndo).toBe(true);
      expect(cmdManager.canRedo).toBe(false);
    });

    it("handles RemoveComponent with cascading restoration of connected wires on undo", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 });
      const r2 = createDefaultComponent("RESISTOR", "R2", { x: 20, y: 10 });
      graph.addComponent(r1);
      graph.addComponent(r2);

      const wire = graph.connectPins(
        { componentId: "R1", pinId: "2" },
        { componentId: "R2", pinId: "1" },
      );

      expect(graph.getAllComponents().length).toBe(2);
      expect(graph.getAllWires().length).toBe(1);

      const removeCmd = new RemoveComponentCommand("R1");
      cmdManager.execute(removeCmd, graph);

      expect(graph.getComponent("R1")).toBeUndefined();
      expect(graph.getWire(wire.id)).toBeUndefined();
      expect(graph.getAllWires().length).toBe(0);

      // Undo must restore both component R1 AND the connected wire
      cmdManager.undo(graph);
      expect(graph.getComponent("R1")).toBeDefined();
      expect(graph.getWire(wire.id)).toBeDefined();
      expect(graph.getAllWires().length).toBe(1);
    });

    it("handles MoveComponent execute -> undo -> redo", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 });
      graph.addComponent(r1);

      const moveCmd = new MoveComponentCommand("R1", { x: 10, y: 10 }, { x: 30, y: 25 });
      cmdManager.execute(moveCmd, graph);
      expect(graph.getComponent("R1")?.position).toEqual({ x: 30, y: 25 });

      cmdManager.undo(graph);
      expect(graph.getComponent("R1")?.position).toEqual({ x: 10, y: 10 });

      cmdManager.redo(graph);
      expect(graph.getComponent("R1")?.position).toEqual({ x: 30, y: 25 });
    });

    it("handles RotateComponent execute -> undo", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 }, 0);
      graph.addComponent(r1);

      const rotateCmd = new RotateComponentCommand("R1", 0, 90);
      cmdManager.execute(rotateCmd, graph);
      expect(graph.getComponent("R1")?.rotation).toBe(90);

      cmdManager.undo(graph);
      expect(graph.getComponent("R1")?.rotation).toBe(0);
    });

    it("handles UpdateComponentParams execute -> undo", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 });
      graph.addComponent(r1);

      const updateCmd = new UpdateComponentParamsCommand(
        "R1",
        { resistance: "1k" },
        { resistance: "4.7k" },
      );

      cmdManager.execute(updateCmd, graph);
      expect(graph.getComponent("R1")?.params["resistance"]).toBe("4.7k");

      cmdManager.undo(graph);
      expect(graph.getComponent("R1")?.params["resistance"]).toBe("1k");
    });
  });

  describe("Wire and Split Commands", () => {
    it("handles ConnectWire and RemoveWire execute -> undo -> redo", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 });
      const r2 = createDefaultComponent("RESISTOR", "R2", { x: 20, y: 10 });
      graph.addComponent(r1);
      graph.addComponent(r2);

      const wire: Wire = {
        id: "W_CUSTOM",
        from: { componentId: "R1", pinId: "2" },
        to: { componentId: "R2", pinId: "1" },
        points: [
          { x: 12, y: 10 },
          { x: 18, y: 10 },
        ],
      };

      const connectCmd = new ConnectWireCommand(wire);
      cmdManager.execute(connectCmd, graph);
      expect(graph.getWire("W_CUSTOM")).toBeDefined();

      cmdManager.undo(graph);
      expect(graph.getWire("W_CUSTOM")).toBeUndefined();

      cmdManager.redo(graph);
      expect(graph.getWire("W_CUSTOM")).toBeDefined();

      // Now remove wire
      const removeWireCmd = new RemoveWireCommand("W_CUSTOM");
      cmdManager.execute(removeWireCmd, graph);
      expect(graph.getWire("W_CUSTOM")).toBeUndefined();

      cmdManager.undo(graph);
      expect(graph.getWire("W_CUSTOM")).toBeDefined();
    });

    it("handles SplitWireCommand execute -> undo", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 });
      const r2 = createDefaultComponent("RESISTOR", "R2", { x: 30, y: 10 });
      graph.addComponent(r1);
      graph.addComponent(r2);

      const busWire = graph.connectPins(
        { componentId: "R1", pinId: "2" },
        { componentId: "R2", pinId: "1" },
      );

      const splitCmd = new SplitWireCommand(busWire.id, { x: 20, y: 10 });
      cmdManager.execute(splitCmd, graph);

      expect(graph.getAllJunctions().length).toBe(1);
      expect(graph.getAllWires().length).toBe(2);

      // Undo must restore the single original wire and remove the junction
      cmdManager.undo(graph);
      expect(graph.getAllJunctions().length).toBe(0);
      expect(graph.getAllWires().length).toBe(1);
      expect(graph.getWire(busWire.id)).toBeDefined();
    });
  });

  describe("BatchCommand and History limits", () => {
    it("executes and undoes multiple commands atomically in reverse order", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 });
      const r2 = createDefaultComponent("RESISTOR", "R2", { x: 20, y: 10 });

      const batch = new BatchCommand([
        new AddComponentCommand(r1),
        new AddComponentCommand(r2),
      ]);

      cmdManager.execute(batch, graph);
      expect(graph.getAllComponents().length).toBe(2);

      cmdManager.undo(graph);
      expect(graph.getAllComponents().length).toBe(0);

      cmdManager.redo(graph);
      expect(graph.getAllComponents().length).toBe(2);
    });

    it("clears redo stack when a new command is executed after undo", () => {
      const r1 = createDefaultComponent("RESISTOR", "R1", { x: 10, y: 10 });
      const r2 = createDefaultComponent("RESISTOR", "R2", { x: 20, y: 10 });

      cmdManager.execute(new AddComponentCommand(r1), graph);
      cmdManager.undo(graph);
      expect(cmdManager.canRedo).toBe(true);

      // New action executed
      cmdManager.execute(new AddComponentCommand(r2), graph);
      expect(cmdManager.canRedo).toBe(false);
      expect(graph.getComponent("R1")).toBeUndefined();
      expect(graph.getComponent("R2")).toBeDefined();
    });

    it("respects maxHistorySize capacity", () => {
      const smallManager = new CommandManager(3);
      for (let i = 1; i <= 5; i++) {
        const comp = createDefaultComponent("RESISTOR", `R${i}`, { x: i * 5, y: 0 });
        smallManager.execute(new AddComponentCommand(comp), graph);
      }

      // History should only have retained the last 3 commands (R3, R4, R5)
      expect(smallManager.undoDescriptions.length).toBe(3);
    });
  });
});

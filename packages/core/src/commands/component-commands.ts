import { Command } from "./command";
import { CircuitGraph } from "../graph/circuit-graph";
import { Component } from "../schema/component";
import { Position, Rotation } from "../schema/geometry";
import { Wire } from "../schema/wire";

export class AddComponentCommand implements Command {
  public readonly id = "AddComponent";
  public readonly description: string;

  constructor(private readonly component: Component) {
    this.description = `Add component ${component.label || component.id} (${component.type})`;
  }

  public execute(graph: CircuitGraph): void {
    graph.addComponent(this.component);
  }

  public undo(graph: CircuitGraph): void {
    graph.removeComponent(this.component.id);
  }
}

export class RemoveComponentCommand implements Command {
  public readonly id = "RemoveComponent";
  public readonly description: string;

  private snapshotComponent?: Component;
  private snapshotWires: Wire[] = [];

  constructor(private readonly componentId: string) {
    this.description = `Remove component ${componentId}`;
  }

  public execute(graph: CircuitGraph): void {
    const comp = graph.getComponent(this.componentId);
    if (!comp) {
      throw new Error(`Cannot remove non-existent component "${this.componentId}"`);
    }
    this.snapshotComponent = { ...comp };
    const { removedWires } = graph.removeComponent(this.componentId);
    this.snapshotWires = removedWires.map((w) => ({
      ...w,
      points: w.points.map((p) => ({ ...p })),
    }));
  }

  public undo(graph: CircuitGraph): void {
    if (!this.snapshotComponent) return;
    graph.addComponent(this.snapshotComponent);
    for (const wire of this.snapshotWires) {
      graph.addWire(wire);
    }
  }
}

export class MoveComponentCommand implements Command {
  public readonly id = "MoveComponent";
  public readonly description: string;

  private originalWirePoints = new Map<string, Position[]>();

  constructor(
    private readonly componentId: string,
    private readonly fromPos: Position,
    private readonly toPos: Position,
  ) {
    this.description = `Move ${componentId} to (${toPos.x}, ${toPos.y})`;
  }

  public execute(graph: CircuitGraph): void {
    // Snapshot original wire points of connected wires
    this.originalWirePoints.clear();
    for (const wire of graph.getAllWires()) {
      const isFrom =
        "componentId" in wire.from && wire.from.componentId === this.componentId;
      const isTo =
        "componentId" in wire.to && wire.to.componentId === this.componentId;
      if (isFrom || isTo) {
        this.originalWirePoints.set(
          wire.id,
          wire.points.map((p) => ({ ...p })),
        );
      }
    }

    graph.moveComponent(this.componentId, this.toPos);
  }

  public undo(graph: CircuitGraph): void {
    graph.moveComponent(this.componentId, this.fromPos);

    // Restore exact original wire points before move
    for (const [wireId, points] of this.originalWirePoints.entries()) {
      const wire = graph.getWire(wireId);
      if (wire) {
        wire.points = points.map((p) => ({ ...p }));
      }
    }
  }
}

export class RotateComponentCommand implements Command {
  public readonly id = "RotateComponent";
  public readonly description: string;

  constructor(
    private readonly componentId: string,
    private readonly fromRotation: Rotation,
    private readonly toRotation: Rotation,
  ) {
    this.description = `Rotate ${componentId} from ${fromRotation}° to ${toRotation}°`;
  }

  public execute(graph: CircuitGraph): void {
    graph.updateComponent(this.componentId, { rotation: this.toRotation });
  }

  public undo(graph: CircuitGraph): void {
    graph.updateComponent(this.componentId, { rotation: this.fromRotation });
  }
}

export class UpdateComponentParamsCommand implements Command {
  public readonly id = "UpdateComponentParams";
  public readonly description: string;

  constructor(
    private readonly componentId: string,
    private readonly oldParams: Record<string, string>,
    private readonly newParams: Record<string, string>,
    private readonly oldLabel?: string,
    private readonly newLabel?: string,
  ) {
    this.description = `Update parameters of ${componentId}`;
  }

  public execute(graph: CircuitGraph): void {
    graph.updateComponent(this.componentId, {
      params: this.newParams,
      ...(this.newLabel !== undefined ? { label: this.newLabel } : {}),
    });
  }

  public undo(graph: CircuitGraph): void {
    graph.updateComponent(this.componentId, {
      params: this.oldParams,
      ...(this.oldLabel !== undefined ? { label: this.oldLabel } : {}),
    });
  }
}

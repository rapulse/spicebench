import { Command } from "./command";
import { CircuitGraph } from "../graph/circuit-graph";
import { Wire, Junction } from "../schema/wire";
import { Position } from "../schema/geometry";

export class ConnectWireCommand implements Command {
  public readonly id = "ConnectWire";
  public readonly description: string;

  constructor(private readonly wire: Wire) {
    this.description = `Connect wire ${wire.id}`;
  }

  public execute(graph: CircuitGraph): void {
    graph.addWire(this.wire);
  }

  public undo(graph: CircuitGraph): void {
    graph.removeWire(this.wire.id);
  }
}

export class RemoveWireCommand implements Command {
  public readonly id = "RemoveWire";
  public readonly description: string;

  private snapshotWire?: Wire;
  private snapshotJunctions: Junction[] = [];

  constructor(private readonly wireId: string) {
    this.description = `Remove wire ${wireId}`;
  }

  public execute(graph: CircuitGraph): void {
    const wire = graph.getWire(this.wireId);
    if (!wire) {
      throw new Error(`Wire "${this.wireId}" not found`);
    }
    this.snapshotWire = {
      ...wire,
      points: wire.points.map((p) => ({ ...p })),
    };

    // Save existing junctions before removal to restore any that might be cleaned up
    this.snapshotJunctions = graph.getAllJunctions().map((j) => ({ ...j }));

    graph.removeWire(this.wireId);
  }

  public undo(graph: CircuitGraph): void {
    if (!this.snapshotWire) return;

    // Restore any junctions that were cleaned up
    for (const j of this.snapshotJunctions) {
      if (!graph.getJunction(j.id)) {
        graph.addJunction(j);
      }
    }

    graph.addWire(this.snapshotWire);
  }
}

export class SplitWireCommand implements Command {
  public readonly id = "SplitWire";
  public readonly description: string;

  private originalWire?: Wire;
  private createdJunctionId?: string;
  private createdWire2Id?: string;

  constructor(
    private readonly wireId: string,
    private readonly splitPoint: Position,
  ) {
    this.description = `Split wire ${wireId} at (${splitPoint.x}, ${splitPoint.y})`;
  }

  public execute(graph: CircuitGraph): void {
    const wire = graph.getWire(this.wireId);
    if (!wire) {
      throw new Error(`Wire "${this.wireId}" not found`);
    }

    this.originalWire = {
      ...wire,
      points: wire.points.map((p) => ({ ...p })),
    };

    const { junction, wire2 } = graph.splitWireAt(this.wireId, this.splitPoint);
    this.createdJunctionId = junction.id;
    this.createdWire2Id = wire2.id;
  }

  public undo(graph: CircuitGraph): void {
    if (!this.originalWire || !this.createdJunctionId || !this.createdWire2Id) return;

    // Remove wire2 and junction
    if (graph.getWire(this.createdWire2Id)) {
      graph.removeWire(this.createdWire2Id);
    }
    // Restore original wire
    graph.removeWire(this.wireId);
    graph.addWire(this.originalWire);
  }
}

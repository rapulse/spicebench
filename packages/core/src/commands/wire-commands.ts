import { Command } from "./command";
import { CircuitGraph } from "../graph/circuit-graph";
import { Wire, Junction, WireEndpoint } from "../schema/wire";
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

export class ConnectToWireCommand implements Command {
  public readonly id = "ConnectToWire";
  public readonly description: string;

  private originalWire?: Wire;
  public result?: {
    junction: Junction;
    branchWire: Wire;
    wire1: Wire;
    wire2: Wire;
  };

  constructor(
    private readonly from: WireEndpoint,
    private readonly targetWireId: string,
    private readonly hitPoint: Position,
    private readonly color?: string,
  ) {
    this.description = `Connect endpoint to wire ${targetWireId}`;
  }

  public execute(graph: CircuitGraph): void {
    const wire = graph.getWire(this.targetWireId);
    if (!wire) {
      throw new Error(`Target wire "${this.targetWireId}" not found`);
    }

    if (!this.originalWire) {
      this.originalWire = {
        ...wire,
        points: wire.points.map((p) => ({ ...p })),
      };
      this.result = graph.connectToWireAt(
        this.from,
        this.targetWireId,
        this.hitPoint,
        this.color,
      );
    } else if (this.result) {
      // Re-execution (redo)
      graph.removeWire(this.targetWireId);
      graph.addJunction(this.result.junction);
      graph.addWire(this.result.wire1);
      graph.addWire(this.result.wire2);
      graph.addWire(this.result.branchWire);
    }
  }

  public undo(graph: CircuitGraph): void {
    if (!this.originalWire || !this.result) return;

    if (graph.getWire(this.result.branchWire.id)) {
      graph.removeWire(this.result.branchWire.id);
    }
    if (graph.getWire(this.result.wire2.id)) {
      graph.removeWire(this.result.wire2.id);
    }
    if (graph.getWire(this.result.wire1.id)) {
      graph.removeWire(this.result.wire1.id);
    }
    if (graph.getJunction(this.result.junction.id)) {
      graph.removeJunction(this.result.junction.id);
    }
    graph.addWire(this.originalWire);
  }
}

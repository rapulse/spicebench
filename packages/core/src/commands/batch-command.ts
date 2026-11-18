import { Command } from "./command";
import { CircuitGraph } from "../graph/circuit-graph";

export class BatchCommand implements Command {
  public readonly id = "BatchCommand";
  public readonly description: string;

  constructor(
    private readonly commands: Command[],
    description?: string,
  ) {
    this.description = description ?? `Batch of ${commands.length} actions`;
  }

  public execute(graph: CircuitGraph): void {
    for (const cmd of this.commands) {
      cmd.execute(graph);
    }
  }

  public undo(graph: CircuitGraph): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i]!.undo(graph);
    }
  }
}

import { CircuitGraph } from "../graph/circuit-graph";

export interface Command {
  readonly id: string;
  readonly description: string;

  /**
   * Applies the command to the given circuit graph.
   */
  execute(graph: CircuitGraph): void;

  /**
   * Inverts the effects of the command, restoring the previous state.
   */
  undo(graph: CircuitGraph): void;
}

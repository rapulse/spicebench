import { Command } from "./command";
import { CircuitGraph } from "../graph/circuit-graph";

export class CommandManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  constructor(public readonly maxHistorySize: number = 100) {}

  public execute(command: Command, graph: CircuitGraph): void {
    command.execute(graph);
    this.undoStack.push(command);
    this.redoStack = [];

    if (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift();
    }
  }

  public pushExecuted(command: Command): void {
    this.undoStack.push(command);
    this.redoStack = [];

    if (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift();
    }
  }

  public undo(graph: CircuitGraph): boolean {
    if (!this.canUndo) return false;
    const command = this.undoStack.pop()!;
    command.undo(graph);
    this.redoStack.push(command);
    return true;
  }

  public redo(graph: CircuitGraph): boolean {
    if (!this.canRedo) return false;
    const command = this.redoStack.pop()!;
    command.execute(graph);
    this.undoStack.push(command);
    return true;
  }

  public get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public get undoDescriptions(): string[] {
    return this.undoStack.map((c) => c.description).reverse();
  }

  public get redoDescriptions(): string[] {
    return this.redoStack.map((c) => c.description).reverse();
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

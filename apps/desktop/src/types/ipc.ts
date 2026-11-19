import type {
  CircuitProject,
  Component,
  Wire,
  Junction,
  ValidationResult,
} from "@spicebench/core";
import type {
  CircuitStats,
  SimulationSummary,
  PlaceComponentOptions,
  UpdateComponentOptions,
  ConnectPinsOptions,
  ConnectToWireOptions,
  SimulationRunOptions,
} from "@spicebench/mcp";

export interface SpicebenchApi {
  getCircuit: () => Promise<CircuitProject>;
  getStats: () => Promise<CircuitStats>;
  placeComponent: (options: PlaceComponentOptions) => Promise<Component>;
  updateComponent: (options: UpdateComponentOptions) => Promise<Component>;
  removeComponent: (id: string) => Promise<{ removedComponentId: string; removedWireCount: number }>;
  connectPins: (options: ConnectPinsOptions) => Promise<Wire>;
  connectToWire: (options: ConnectToWireOptions) => Promise<{
    junction: Junction;
    branchWire: Wire;
    wire1: Wire;
    wire2: Wire;
  }>;
  validateCircuit: () => Promise<ValidationResult>;
  runSimulation: (options?: SimulationRunOptions) => Promise<SimulationSummary>;
  setPower: (powerOn: boolean) => Promise<SimulationSummary | null>;
  resetCircuit: () => Promise<void>;
  saveProject: () => Promise<{ filePath: string; name: string } | null>;
  openProject: () => Promise<{ filePath: string; circuit: CircuitProject; name: string } | null>;
  exportNetlist: () => Promise<{ filePath: string; name: string } | null>;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  canUndo: () => Promise<boolean>;
  canRedo: () => Promise<boolean>;
  loadSampleCircuit: (sampleName: "voltage-divider" | "rc-step" | "rlc-filter") => Promise<CircuitProject>;
  onCircuitUpdated: (callback: (circuit: CircuitProject) => void) => () => void;
  onSimulationUpdated: (callback: (summary: SimulationSummary | null) => void) => () => void;
}

declare global {
  interface Window {
    spicebenchApi: SpicebenchApi;
  }
}

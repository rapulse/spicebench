import type {
  CircuitProject,
  Component,
  Wire,
  Junction,
  ValidationResult,
  InstrumentState,
} from "@spicebench/core";
import type {
  CircuitStats,
  SimulationSummary,
  PlaceComponentOptions,
  UpdateComponentOptions,
  ConnectPinsOptions,
  ConnectToWireOptions,
  SimulationRunOptions,
  InstrumentReading,
  AgentActionLog,
} from "@spicebench/mcp";

export interface McpServerStatus {
  running: boolean;
  port: number;
  host: string;
  /** Streamable HTTP endpoint. */
  mcpUrl: string;
  activeSessions: number;
  recentActions: AgentActionLog[];
}

export interface McpClientConfigMap {
  claudeDesktop: string;
  cursor: string;
  antigravity: string;
}

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
  importNetlist: (rawNetlist?: string) => Promise<{ name: string; circuit: CircuitProject; warnings: string[] } | null>;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  canUndo: () => Promise<boolean>;
  canRedo: () => Promise<boolean>;
  updateInstrument: (state: InstrumentState) => Promise<void>;
  readInstrument: (instrumentId: string) => Promise<InstrumentReading>;
  loadSampleCircuit: (
    sampleName: "voltage-divider" | "rc-step" | "rlc-filter" | "interactive-logic"
  ) => Promise<CircuitProject>;
  getMcpStatus: () => Promise<McpServerStatus>;
  toggleMcpServer: (enable: boolean, port?: number) => Promise<McpServerStatus>;
  getMcpClientConfigs: () => Promise<McpClientConfigMap>;
  onCircuitUpdated: (callback: (circuit: CircuitProject) => void) => () => void;
  onSimulationUpdated: (callback: (summary: SimulationSummary | null) => void) => () => void;
  onAgentAction: (callback: (action: AgentActionLog) => void) => () => void;
  onMcpStatusChanged: (callback: (status: McpServerStatus) => void) => () => void;
  onOpenMcpDialogRequested?: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    spicebenchApi: SpicebenchApi;
  }
}

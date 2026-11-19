import {
  CircuitGraph,
  CircuitProject,
  Component,
  ComponentType,
  Rotation,
  Wire,
  Junction,
  createDefaultComponent,
  COMPONENT_CATALOG,
  getAbsolutePinPosition,
  getComponentPin,
  ManhattanRouter,
  isPinEndpoint,
  TopologyValidator,
  ValidationResult,
  ValidationDiagnostic,
  Command,
  CommandManager,
  AddComponentCommand,
  RemoveComponentCommand,
  MoveComponentCommand,
  RotateComponentCommand,
  UpdateComponentParamsCommand,
  ConnectWireCommand,
  ConnectToWireCommand,
  BatchCommand,
  InstrumentState,
} from "@spicebench/core";
import {
  NetlistCompiler,
  CompiledNetlist,
  SpiceRunner,
  type SpiceRunnerConfig,
  SimulationResult,
  SimulationMode,
  TranOptions,
  AcOptions,
  DcOptions,
  SimulationError,
  computeInstrumentData,
  requiredAnalyses,
  type AnalysisResults,
} from "@spicebench/sim";
import {
  buildSimulationSummary,
  formatInstrumentReading,
  type InstrumentReading,
  type SimulationSummary,
} from "./simulation-summary";

export type { InstrumentReading, SimulationSummary } from "./simulation-summary";

export interface PlaceComponentOptions {
  type: ComponentType;
  id?: string;
  label?: string;
  params?: Record<string, string>;
  x: number;
  y: number;
  rotation?: Rotation;
}

export interface UpdateComponentOptions {
  id: string;
  label?: string;
  params?: Record<string, string>;
  x?: number;
  y?: number;
  rotation?: Rotation;
}

export interface ConnectPinsOptions {
  from: { componentId: string; pinId: string };
  to: { componentId: string; pinId: string };
  id?: string;
}

export interface ConnectToWireOptions {
  from: { componentId: string; pinId: string };
  targetWireId: string;
  hitPoint: { x: number; y: number };
}

export interface SimulationRunOptions {
  mode?: SimulationMode;
  tran?: TranOptions;
  ac?: AcOptions;
  dc?: DcOptions;
  timeoutMs?: number;
}

export interface CircuitStats {
  componentCount: number;
  wireCount: number;
  junctionCount: number;
  instrumentCount: number;
}

export interface CircuitSessionOptions {
  /** Simulator settings (engine, worker path, timeout). See ADR-007. */
  runner?: SpiceRunnerConfig;
}

export interface AgentActionLog {
  id: string;
  tool: string;
  description: string;
  timestamp: number;
}

export class CircuitSession {
  private graph: CircuitGraph;
  private runner: SpiceRunner;
  private commandManager: CommandManager = new CommandManager(100);
  private lastCompiled?: CompiledNetlist;
  private lastResult?: SimulationResult;
  private lastSummary?: SimulationSummary;
  private isDirty = true;

  private circuitChangeListeners: Set<(circuit: CircuitProject) => void> = new Set();
  private simulationChangeListeners: Set<(summary: SimulationSummary | null) => void> = new Set();
  private agentActionListeners: Set<(action: AgentActionLog) => void> = new Set();
  private actionHistory: AgentActionLog[] = [];

  constructor(initialProject?: CircuitProject, options: CircuitSessionOptions = {}) {
    this.graph = new CircuitGraph(initialProject);
    this.runner = new SpiceRunner(options.runner);
  }

  /** Pre-loads ngspice (WASM init) so the first simulation is fast. */
  public async warmUpSimulator(): Promise<boolean> {
    return this.runner.warmUp();
  }

  /** Stops the simulator worker. Call on shutdown. */
  public async dispose(): Promise<void> {
    await this.runner.destroy();
  }

  public onCircuitChange(listener: (circuit: CircuitProject) => void): () => void {
    this.circuitChangeListeners.add(listener);
    return () => this.circuitChangeListeners.delete(listener);
  }

  public onSimulationChange(listener: (summary: SimulationSummary | null) => void): () => void {
    this.simulationChangeListeners.add(listener);
    return () => this.simulationChangeListeners.delete(listener);
  }

  public onAgentAction(listener: (action: AgentActionLog) => void): () => void {
    this.agentActionListeners.add(listener);
    return () => this.agentActionListeners.delete(listener);
  }

  public logAgentAction(tool: string, description: string): AgentActionLog {
    const action: AgentActionLog = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tool,
      description,
      timestamp: Date.now(),
    };
    this.actionHistory.unshift(action);
    if (this.actionHistory.length > 100) {
      this.actionHistory.pop();
    }
    for (const l of this.agentActionListeners) {
      try {
        l(action);
      } catch {
        // ignore
      }
    }
    return action;
  }

  public getActionHistory(): AgentActionLog[] {
    return [...this.actionHistory];
  }

  private notifyCircuitChange(): void {
    const circuit = this.getCircuit();
    for (const l of this.circuitChangeListeners) {
      try {
        l(circuit);
      } catch {
        // ignore
      }
    }
  }

  private notifySimulationChange(summary: SimulationSummary | null): void {
    for (const l of this.simulationChangeListeners) {
      try {
        l(summary);
      } catch {
        // ignore
      }
    }
  }

  public undo(): boolean {
    const success = this.commandManager.undo(this.graph);
    if (success) {
      this.isDirty = true;
      this.notifyCircuitChange();
    }
    return success;
  }

  public redo(): boolean {
    const success = this.commandManager.redo(this.graph);
    if (success) {
      this.isDirty = true;
      this.notifyCircuitChange();
    }
    return success;
  }

  public get canUndo(): boolean {
    return this.commandManager.canUndo;
  }

  public get canRedo(): boolean {
    return this.commandManager.canRedo;
  }

  public getGraph(): CircuitGraph {
    return this.graph;
  }

  public getCircuit(): CircuitProject {
    return this.graph.toProject();
  }

  public getStats(): CircuitStats {
    return {
      componentCount: this.graph.getAllComponents().length,
      wireCount: this.graph.getAllWires().length,
      junctionCount: this.graph.getAllJunctions().length,
      instrumentCount: this.graph
        .getAllComponents()
        .filter((c) =>
          ["MULTIMETER", "FUNCTION_GENERATOR", "OSCILLOSCOPE", "BODE_PLOTTER"].includes(c.type),
        ).length,
    };
  }

  public getLastResult(): SimulationResult | undefined {
    return this.lastResult;
  }

  public getLastCompiled(): CompiledNetlist | undefined {
    return this.lastCompiled;
  }

  public placeComponent(options: PlaceComponentOptions): Component {
    const { type, x, y, rotation = 0, label, params } = options;

    const id = options.id ?? this.generateNextComponentId(type);

    if (this.graph.getComponent(id)) {
      throw new Error(`Component with ID '${id}' already exists in circuit.`);
    }

    const comp = createDefaultComponent(type, id, { x, y }, rotation, label);

    if (params) {
      comp.params = { ...comp.params, ...params };
    }

    this.commandManager.execute(new AddComponentCommand(comp), this.graph);

    // Initialize instrument window state. Values passed by the caller (e.g. an MCP agent's
    // place_component params) take precedence over defaults, otherwise the window state would
    // silently override them in the compiler (ADR-011).
    if (!this.graph.getInstrument(comp.id)) {
      const initial = initialInstrumentState(comp);
      if (initial) this.graph.setInstrument(initial);
    }

    this.isDirty = true;
    this.notifyCircuitChange();
    return comp;
  }

  public updateComponent(options: UpdateComponentOptions): Component {
    const { id, label, params, x, y, rotation } = options;
    const existing = this.graph.getComponent(id);
    if (!existing) {
      throw new Error(`Component with ID '${id}' not found in circuit.`);
    }

    const oldPos = { ...existing.position };
    const oldRot = existing.rotation;
    const oldParams = { ...existing.params };
    const oldLabel = existing.label;

    const newX = x !== undefined ? x : existing.position.x;
    const newY = y !== undefined ? y : existing.position.y;
    const newRot = rotation !== undefined ? rotation : existing.rotation;
    const newParams = params ? { ...existing.params, ...params } : existing.params;
    const newLabel = label !== undefined ? label : existing.label;

    const paramsChanged = params && JSON.stringify(oldParams) !== JSON.stringify(newParams);
    const labelChanged = label !== undefined && label !== oldLabel;

    const cmds: Command[] = [];
    if (newX !== oldPos.x || newY !== oldPos.y) {
      cmds.push(new MoveComponentCommand(id, oldPos, { x: newX, y: newY }));
    }
    if (newRot !== oldRot) {
      cmds.push(new RotateComponentCommand(id, oldRot, newRot));
    }
    if (paramsChanged || labelChanged) {
      cmds.push(new UpdateComponentParamsCommand(id, oldParams, newParams, oldLabel, newLabel));
    }

    if (cmds.length === 1) {
      this.commandManager.execute(cmds[0]!, this.graph);
    } else if (cmds.length > 1) {
      this.commandManager.execute(new BatchCommand(cmds, `Update ${id}`), this.graph);
    }

    // If position or rotation changed, re-route connected wires orthogonally
    if (newX !== oldPos.x || newY !== oldPos.y || newRot !== oldRot) {
      this.rerouteWiresForComponent(id);
    }

    if (params) this.syncParamsToInstrumentState(id, params);

    this.isDirty = true;
    this.notifyCircuitChange();
    return this.graph.getComponent(id)!;
  }

  /**
   * Instrument settings live in two places (component params for MCP, InstrumentState for the
   * instrument window); the compiler prefers InstrumentState. Mirror param edits into the state so
   * an agent's `update_component` is not silently overridden by the window state (ADR-011).
   */
  private syncParamsToInstrumentState(id: string, params: Record<string, string>): void {
    const state = this.graph.getInstrument(id) as Record<string, unknown> | undefined;
    if (!state) return;
    const next: Record<string, unknown> = { ...state };
    for (const [key, value] of Object.entries(params)) {
      if (!(key in state)) continue;
      if (key === "dutyCycle" || key === "vMin" || key === "vMax" || key === "xPos") {
        const n = Number(value);
        if (Number.isFinite(n)) next[key] = n;
      } else {
        next[key] = value;
      }
    }
    this.graph.setInstrument(next as InstrumentState);
  }

  private rerouteWiresForComponent(componentId: string): void {
    const allWires = this.graph.getAllWires();
    for (const wire of allWires) {
      const isFromConnected = isPinEndpoint(wire.from) && wire.from.componentId === componentId;
      const isToConnected = isPinEndpoint(wire.to) && wire.to.componentId === componentId;
      if (isFromConnected || isToConnected) {
        try {
          const startPos = this.graph.getEndpointPosition(wire.from);
          const endPos = this.graph.getEndpointPosition(wire.to);
          const ignored = [
            isPinEndpoint(wire.from) ? wire.from.componentId : "",
            isPinEndpoint(wire.to) ? wire.to.componentId : "",
          ].filter(Boolean);

          const route = ManhattanRouter.route(startPos, endPos, this.graph, {
            margin: 5,
            avoidComponents: true,
            ignoredComponentIds: ignored,
          });
          if (route && route.length >= 2) {
            wire.points = route;
          }
        } catch {
          // If automatic routing fails, existing terminal points are maintained by graph
        }
      }
    }
  }

  public removeComponent(id: string): { removedComponentId: string; removedWireCount: number } {
    const comp = this.graph.getComponent(id);
    if (!comp) {
      throw new Error(`Component with ID '${id}' not found in circuit.`);
    }

    const removedWires = this.graph
      .getAllWires()
      .filter(
        (w) =>
          (isPinEndpoint(w.from) && w.from.componentId === id) ||
          (isPinEndpoint(w.to) && w.to.componentId === id),
      );
    this.commandManager.execute(new RemoveComponentCommand(id), this.graph);
    this.graph.removeInstrument(id);
    this.isDirty = true;
    this.notifyCircuitChange();
    return {
      removedComponentId: id,
      removedWireCount: removedWires.length,
    };
  }

  public updateInstrument(state: InstrumentState): void {
    this.graph.setInstrument(state);
    // Mirror window settings into component params so get_circuit_state shows what is simulated.
    const comp = this.graph.getComponent(state.instrumentId);
    if (comp) {
      for (const key of INSTRUMENT_SETTING_KEYS) {
        const v = (state as Record<string, unknown>)[key];
        if (v !== undefined && (typeof v === "string" || typeof v === "number")) comp.params[key] = String(v);
      }
    }
    this.isDirty = true;
    this.notifyCircuitChange();
  }

  public connectPins(options: ConnectPinsOptions): Wire {
    const { from, to, id } = options;

    const compFrom = this.graph.getComponent(from.componentId);
    if (!compFrom) {
      throw new Error(`Source component '${from.componentId}' not found.`);
    }
    const compTo = this.graph.getComponent(to.componentId);
    if (!compTo) {
      throw new Error(`Target component '${to.componentId}' not found.`);
    }

    const pinFrom = getComponentPin(compFrom.type, from.pinId);
    if (!pinFrom) {
      throw new Error(`Pin '${from.pinId}' not found on component '${from.componentId}'.`);
    }
    const pinTo = getComponentPin(compTo.type, to.pinId);
    if (!pinTo) {
      throw new Error(`Pin '${to.pinId}' not found on component '${to.componentId}'.`);
    }

    const startPos = getAbsolutePinPosition(compFrom, from.pinId);
    const endPos = getAbsolutePinPosition(compTo, to.pinId);

    // Compute orthogonal Manhattan route avoiding other components
    const route = ManhattanRouter.route(
      startPos,
      endPos,
      this.graph,
      {
        margin: 5,
        avoidComponents: true,
        ignoredComponentIds: [from.componentId, to.componentId],
      },
    );

    const wire = this.graph.connectPins(
      { componentId: from.componentId, pinId: from.pinId },
      { componentId: to.componentId, pinId: to.pinId },
      route,
    );

    if (id && wire.id !== id) {
      // If a custom ID was requested, rename it in graph
      this.graph.removeWire(wire.id);
      const customWire = { ...wire, id };
      this.graph.addWire(customWire);
      this.commandManager.pushExecuted(new ConnectWireCommand(customWire));
      this.isDirty = true;
      this.notifyCircuitChange();
      return customWire;
    }

    this.commandManager.pushExecuted(new ConnectWireCommand(wire));
    this.isDirty = true;
    this.notifyCircuitChange();
    return wire;
  }

  public connectToWire(options: ConnectToWireOptions): {
    junction: Junction;
    branchWire: Wire;
    wire1: Wire;
    wire2: Wire;
  } {
    const { from, targetWireId, hitPoint } = options;

    const compFrom = this.graph.getComponent(from.componentId);
    if (!compFrom) {
      throw new Error(`Source component '${from.componentId}' not found.`);
    }
    const pinFrom = getComponentPin(compFrom.type, from.pinId);
    if (!pinFrom) {
      throw new Error(`Pin '${from.pinId}' not found on component '${from.componentId}'.`);
    }

    const cmd = new ConnectToWireCommand(
      { componentId: from.componentId, pinId: from.pinId },
      targetWireId,
      hitPoint,
    );
    this.commandManager.execute(cmd, this.graph);
    this.isDirty = true;
    this.notifyCircuitChange();
    return cmd.result!;
  }

  public validate(): ValidationResult {
    return TopologyValidator.validate(this.graph);
  }

  /**
   * Runs the simulation. Without `mode` this is "Power On": every analysis the instruments
   * need is executed (op / tran / ac) and each instrument gets its readings (ADR-011).
   * With `mode` only that analysis runs.
   */
  public async runSimulation(options: SimulationRunOptions = {}): Promise<SimulationSummary> {
    const validation = this.validate();
    if (validation.errors.length > 0) {
      const summaryMsg = validation.errors
        .map((e: ValidationDiagnostic) => `[${e.code}] ${e.message}`)
        .join("; ");
      throw new Error(`Cannot run simulation due to circuit topology errors: ${summaryMsg}`);
    }

    const modes: SimulationMode[] = options.mode ? [options.mode] : requiredAnalyses(this.graph);
    const results: SimulationResult[] = [];
    let compiled: CompiledNetlist | undefined;
    for (const mode of modes) {
      compiled = NetlistCompiler.compile(this.graph, { mode, tran: options.tran, ac: options.ac, dc: options.dc });
      try {
        results.push(await this.runner.run(compiled.netlist, options.timeoutMs));
      } catch (err) {
        throw this.attachComponentIds(err);
      }
    }
    const primary =
      results.find((r) => r.mode === options.mode) ??
      results.find((r) => r.mode === "ac") ??
      results.find((r) => r.mode === "tran") ??
      results[0]!;

    const byMode: AnalysisResults = {};
    for (const r of results) if (r.mode === "op" || r.mode === "tran" || r.mode === "ac") byMode[r.mode] = r;
    const instruments = computeInstrumentData(this.graph, compiled!, byMode);

    this.lastCompiled = compiled;
    this.lastResult = primary;
    this.isDirty = false;

    const summary = buildSimulationSummary(primary, compiled!, results, instruments);
    this.lastSummary = summary;
    this.notifySimulationChange(summary);
    return summary;
  }

  /** Maps SPICE element names in a SimulationError (e.g. "d_d1", "x_u1") to circuit component ids. */
  private attachComponentIds(err: unknown): unknown {
    if (!(err instanceof SimulationError)) return err;
    const ids = new Set<string>();
    const comps = this.graph.getAllComponents();
    for (const name of err.details.problematicComponents ?? []) {
      const m = /^[a-z]+_(.+)$/i.exec(name);
      const candidate = (m?.[1] ?? name).toLowerCase();
      const hit = comps.find(
        (c) =>
          candidate === c.id.toLowerCase() ||
          candidate.startsWith(`${c.id.toLowerCase()}_`) ||
          candidate.startsWith(`${c.id.toLowerCase()}.`),
      );
      if (hit) ids.add(hit.id);
    }
    err.details.componentIds = [...ids];
    if (ids.size > 0 && !err.message.includes("Components:")) {
      err.message += `\nComponents: ${[...ids].join(", ")}`;
    }
    return err;
  }

  /** Same numbers as the instrument windows: computed from the last Power On (re-run if stale). */
  public async readInstrument(instrumentId: string): Promise<InstrumentReading> {
    const comp = this.graph.getComponent(instrumentId);
    if (!comp) {
      throw new Error(`Instrument '${instrumentId}' not found in circuit.`);
    }
    if (!["MULTIMETER", "OSCILLOSCOPE", "BODE_PLOTTER", "FUNCTION_GENERATOR"].includes(comp.type)) {
      throw new Error(`Component '${instrumentId}' is of type '${comp.type}', not an instrument.`);
    }
    let summary = this.lastSummary;
    if (this.isDirty || !summary || !summary.instruments[instrumentId]) {
      summary = await this.runSimulation();
    }
    return formatInstrumentReading(summary.instruments[instrumentId]!);
  }

  public exportSpice(options: SimulationRunOptions = {}): string {
    const compiled = NetlistCompiler.compile(this.graph, options);
    this.lastCompiled = compiled;
    return compiled.netlist;
  }

  public reset(): void {
    this.graph = new CircuitGraph();
    this.commandManager.clear();
    this.lastCompiled = undefined;
    this.lastResult = undefined;
    this.lastSummary = undefined;
    this.isDirty = true;
    this.notifyCircuitChange();
    this.notifySimulationChange(null);
  }

  public loadCircuit(project: CircuitProject): void {
    this.graph = new CircuitGraph(project);
    this.commandManager.clear();
    this.lastCompiled = undefined;
    this.lastResult = undefined;
    this.lastSummary = undefined;
    this.isDirty = true;
    this.notifyCircuitChange();
    this.notifySimulationChange(null);
  }

  private generateNextComponentId(type: ComponentType): string {
    const meta = COMPONENT_CATALOG[type];
    const prefix = meta?.prefix || "U";
    let index = 1;
    while (this.graph.getComponent(`${prefix}${index}`)) {
      index++;
    }
    return `${prefix}${index}`;
  }

}

/** Instrument settings shared between component params and InstrumentState (ADR-011). */
const INSTRUMENT_SETTING_KEYS = [
  "mode",
  "currentType",
  "waveform",
  "frequency",
  "amplitude",
  "offset",
  "dutyCycle",
  "timebase",
  "fstart",
  "fstop",
] as const;

function initialInstrumentState(comp: Component): InstrumentState | undefined {
  const p = comp.params;
  const str = (key: string, fallback: string) => (p[key] !== undefined && p[key] !== "" ? String(p[key]) : fallback);
  switch (comp.type) {
    case "MULTIMETER": {
      const mode = str("mode", "V");
      return {
        instrumentId: comp.id,
        isOpen: false,
        windowPosition: { x: 120, y: 80 },
        mode: mode === "A" || mode === "R" || mode === "dB" ? mode : "V",
        currentType: str("currentType", "DC").toUpperCase() === "AC" ? "AC" : "DC",
      };
    }
    case "FUNCTION_GENERATOR": {
      const w = str("waveform", "sine");
      const duty = Number(str("dutyCycle", "50"));
      return {
        instrumentId: comp.id,
        isOpen: false,
        windowPosition: { x: 150, y: 100 },
        waveform: w === "square" || w === "triangle" ? w : "sine",
        frequency: str("frequency", "1kHz"),
        dutyCycle: Number.isFinite(duty) ? Math.min(99, Math.max(1, duty)) : 50,
        amplitude: str("amplitude", str("voltage", "5V")),
        offset: str("offset", "0V"),
      };
    }
    case "OSCILLOSCOPE":
      return {
        instrumentId: comp.id,
        isOpen: false,
        windowPosition: { x: 180, y: 120 },
        timebase: str("timebase", "1ms/div"),
        xPos: 0,
        chA: { scale: str("chA_scale", "5V/div"), yPos: 0, coupling: "DC" },
        chB: { scale: str("chB_scale", "5V/div"), yPos: 0, coupling: "DC" },
        trigger: { mode: "auto", edge: "positive", level: 0, source: "chA" },
      };
    case "BODE_PLOTTER":
      return {
        instrumentId: comp.id,
        isOpen: false,
        windowPosition: { x: 210, y: 140 },
        mode: "magnitude",
        scaleH: "log",
        scaleV: "log",
        fstart: str("fstart", "10Hz"),
        fstop: str("fstop", "100kHz"),
        vMin: -60,
        vMax: 20,
      };
    default:
      return undefined;
  }
}

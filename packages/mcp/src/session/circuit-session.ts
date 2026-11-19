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
} from "@spicebench/core";
import {
  NetlistCompiler,
  CompiledNetlist,
  SpiceRunner,
  SimulationResult,
  SimulationMode,
  TranOptions,
  AcOptions,
  DcOptions,
  OpResult,
  TranResult,
  AcResult,
} from "@spicebench/sim";

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

export interface SimulationSummary {
  mode: SimulationMode;
  success: boolean;
  durationMs: number;
  pinVoltages?: Record<string, number>;
  nodeVoltages?: Record<string, number>;
  branchCurrents?: Record<string, number>;
  timeRange?: { start: number; stop: number; points: number };
  signalsSummary?: Record<
    string,
    {
      min: number;
      max: number;
      avg: number;
      rms: number;
      last: number;
    }
  >;
  samples?: {
    timeOrFreq: number[];
    values: Record<string, number[]>;
  };
  acSummary?: {
    peakFrequency: number;
    peakMagnitudeDb: number;
    peakMagnitudeLinear: number;
  };
}

export interface InstrumentReading {
  instrumentId: string;
  type: "MULTIMETER" | "OSCILLOSCOPE" | "BODE_PLOTTER" | "FUNCTION_GENERATOR";
  readings: Record<string, unknown>;
  formatted: string;
}

export class CircuitSession {
  private graph: CircuitGraph;
  private runner: SpiceRunner;
  private commandManager: CommandManager = new CommandManager(100);
  private lastCompiled?: CompiledNetlist;
  private lastResult?: SimulationResult;
  private isDirty = true;

  constructor(initialProject?: CircuitProject) {
    this.graph = new CircuitGraph(initialProject);
    this.runner = new SpiceRunner({ useWorkerThread: false });
  }

  public undo(): boolean {
    const success = this.commandManager.undo(this.graph);
    if (success) {
      this.isDirty = true;
    }
    return success;
  }

  public redo(): boolean {
    const success = this.commandManager.redo(this.graph);
    if (success) {
      this.isDirty = true;
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
    this.isDirty = true;
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

    this.isDirty = true;
    return this.graph.getComponent(id)!;
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
    this.isDirty = true;
    return {
      removedComponentId: id,
      removedWireCount: removedWires.length,
    };
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
      return customWire;
    }

    this.commandManager.pushExecuted(new ConnectWireCommand(wire));
    this.isDirty = true;
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
    return cmd.result!;
  }

  public validate(): ValidationResult {
    return TopologyValidator.validate(this.graph);
  }

  public async runSimulation(options: SimulationRunOptions = {}): Promise<SimulationSummary> {
    const validation = this.validate();
    if (validation.errors.length > 0) {
      const summaryMsg = validation.errors
        .map((e: ValidationDiagnostic) => `[${e.code}] ${e.message}`)
        .join("; ");
      throw new Error(`Cannot run simulation due to circuit topology errors: ${summaryMsg}`);
    }

    const compiled = NetlistCompiler.compile(this.graph, {
      mode: options.mode,
      tran: options.tran,
      ac: options.ac,
      dc: options.dc,
    });
    this.lastCompiled = compiled;

    const result = await this.runner.run(compiled.netlist, options.timeoutMs);
    this.lastResult = result;
    this.isDirty = false;

    return this.buildSimulationSummary(result, compiled);
  }

  public async readInstrument(instrumentId: string): Promise<InstrumentReading> {
    const comp = this.graph.getComponent(instrumentId);
    if (!comp) {
      throw new Error(`Instrument '${instrumentId}' not found in circuit.`);
    }

    switch (comp.type) {
      case "MULTIMETER": {
        // Run OP simulation if dirty or not yet run
        if (this.isDirty || !this.lastResult || this.lastResult.mode !== "op") {
          await this.runSimulation({ mode: "op" });
        }
        return this.readMultimeter(comp);
      }

      case "OSCILLOSCOPE": {
        // Run TRAN simulation if dirty or not yet run
        if (this.isDirty || !this.lastResult || this.lastResult.mode !== "tran") {
          await this.runSimulation({ mode: "tran" });
        }
        return this.readOscilloscope(comp);
      }

      case "BODE_PLOTTER": {
        // Run AC simulation if dirty or not yet run
        if (this.isDirty || !this.lastResult || this.lastResult.mode !== "ac") {
          await this.runSimulation({ mode: "ac" });
        }
        return this.readBodePlotter(comp);
      }

      case "FUNCTION_GENERATOR": {
        const ampl = comp.params["amplitude"] ?? "5V";
        const freq = comp.params["frequency"] ?? "1kHz";
        const wave = comp.params["waveform"] ?? "sine";
        return {
          instrumentId,
          type: "FUNCTION_GENERATOR",
          readings: { amplitude: ampl, frequency: freq, waveform: wave },
          formatted: `FuncGen: ${wave.toUpperCase()} ${ampl} @ ${freq}`,
        };
      }

      default:
        throw new Error(`Component '${instrumentId}' is of type '${comp.type}', not an instrument.`);
    }
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
    this.isDirty = true;
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

  private buildSimulationSummary(
    result: SimulationResult,
    compiled: CompiledNetlist,
  ): SimulationSummary {
    const summary: SimulationSummary = {
      mode: result.mode,
      success: result.success,
      durationMs: result.durationMs,
    };

    if (result.mode === "op") {
      const op = result.data as OpResult;
      summary.nodeVoltages = op.nodeVoltages;
      summary.branchCurrents = op.branchCurrents;

      // Map pin identifiers to voltages for direct agent interpretation
      const pinVoltages: Record<string, number> = {};
      for (const [pinKey, spiceNode] of compiled.nodeMap.entries()) {
        const v = op.nodeVoltages[spiceNode.toLowerCase()] ?? op.nodeVoltages[spiceNode] ?? 0;
        pinVoltages[pinKey] = v;
      }
      summary.pinVoltages = pinVoltages;
    } else if (result.mode === "tran") {
      const tran = result.data as TranResult;
      const nPoints = tran.time.length;
      summary.timeRange = {
        start: tran.time[0] ?? 0,
        stop: tran.time[nPoints - 1] ?? 0,
        points: nPoints,
      };

      const signalsSummary: Record<string, { min: number; max: number; avg: number; rms: number; last: number }> = {};
      for (const [sig, vals] of Object.entries(tran.variables)) {
        if (vals.length === 0) continue;
        let min = vals[0]!;
        let max = vals[0]!;
        let sum = 0;
        let sumSq = 0;
        for (const v of vals) {
          if (v < min) min = v;
          if (v > max) max = v;
          sum += v;
          sumSq += v * v;
        }
        const avg = sum / vals.length;
        const rms = Math.sqrt(sumSq / vals.length);
        const last = vals[vals.length - 1]!;
        signalsSummary[sig] = { min, max, avg, rms, last };
      }
      summary.signalsSummary = signalsSummary;

      // Downsample for compact AI payload (up to 40 evenly-spaced samples)
      const maxSamples = 40;
      const step = Math.max(1, Math.floor(nPoints / maxSamples));
      const sampleTimes: number[] = [];
      const sampleVals: Record<string, number[]> = {};
      for (const sig of Object.keys(tran.variables)) {
        sampleVals[sig] = [];
      }

      for (let i = 0; i < nPoints; i += step) {
        sampleTimes.push(tran.time[i]!);
        for (const [sig, vals] of Object.entries(tran.variables)) {
          sampleVals[sig]!.push(vals[i]!);
        }
      }
      summary.samples = { timeOrFreq: sampleTimes, values: sampleVals };
    } else if (result.mode === "ac") {
      const ac = result.data as AcResult;
      let maxDb = -Infinity;
      let peakF = 0;

      // Find global peak across magnitudeDb signals
      for (const [_sig, dbVals] of Object.entries(ac.magnitudeDb)) {
        for (let i = 0; i < dbVals.length; i++) {
          const val = dbVals[i]!;
          if (val > maxDb) {
            maxDb = val;
            peakF = ac.frequency[i]!;
          }
        }
      }

      summary.acSummary = {
        peakFrequency: peakF,
        peakMagnitudeDb: maxDb,
        peakMagnitudeLinear: Math.pow(10, maxDb / 20),
      };

      // Downsample AC response
      const nPoints = ac.frequency.length;
      const maxSamples = 30;
      const step = Math.max(1, Math.floor(nPoints / maxSamples));
      const sampleF: number[] = [];
      const sampleDb: Record<string, number[]> = {};
      for (const sig of Object.keys(ac.magnitudeDb)) {
        sampleDb[sig] = [];
      }
      for (let i = 0; i < nPoints; i += step) {
        sampleF.push(ac.frequency[i]!);
        for (const [sig, vals] of Object.entries(ac.magnitudeDb)) {
          sampleDb[sig]!.push(vals[i]!);
        }
      }
      summary.samples = { timeOrFreq: sampleF, values: sampleDb };
    }

    return summary;
  }

  private readMultimeter(comp: Component): InstrumentReading {
    const mode = (comp.params["mode"] || "V").toUpperCase(); // V | A | Omega
    const op = this.lastResult?.data as OpResult | undefined;

    let value = 0;
    let unit = "V";

    if (mode === "V") {
      unit = "V";
      const posNode = this.lastCompiled?.nodeMap.get(`${comp.id}:pos`)?.toLowerCase() ?? "0";
      const negNode = this.lastCompiled?.nodeMap.get(`${comp.id}:neg`)?.toLowerCase() ?? "0";
      const vPos = op?.nodeVoltages[posNode] ?? 0;
      const vNeg = op?.nodeVoltages[negNode] ?? 0;
      value = vPos - vNeg;
    } else if (mode === "A") {
      unit = "A";
      const branchKey = `v_${comp.id.toLowerCase()}_sense`;
      value = op?.branchCurrents[branchKey] ?? 0;
    }

    return {
      instrumentId: comp.id,
      type: "MULTIMETER",
      readings: { mode, value, unit },
      formatted: `${value >= 0 ? "+" : ""}${value.toFixed(4)} ${unit}`,
    };
  }

  private readOscilloscope(comp: Component): InstrumentReading {
    const tran = this.lastResult?.data as TranResult | undefined;
    const chANode = this.lastCompiled?.nodeMap.get(`${comp.id}:ch_a_pos`)?.toLowerCase();
    const chBNode = this.lastCompiled?.nodeMap.get(`${comp.id}:ch_b_pos`)?.toLowerCase();

    const getMetrics = (node?: string) => {
      if (!node || !tran || !tran.variables[`v(${node})`]) {
        return { vpp: 0, vrms: 0, vavg: 0, min: 0, max: 0 };
      }
      const vals = tran.variables[`v(${node})`]!;
      let min = vals[0]!;
      let max = vals[0]!;
      let sum = 0;
      let sumSq = 0;
      for (const v of vals) {
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
        sumSq += v * v;
      }
      return {
        vpp: max - min,
        vrms: Math.sqrt(sumSq / vals.length),
        vavg: sum / vals.length,
        min,
        max,
      };
    };

    const chA = getMetrics(chANode);
    const chB = getMetrics(chBNode);

    return {
      instrumentId: comp.id,
      type: "OSCILLOSCOPE",
      readings: { channelA: chA, channelB: chB },
      formatted: `CH A: Vpp=${chA.vpp.toFixed(3)}V, Vrms=${chA.vrms.toFixed(3)}V | CH B: Vpp=${chB.vpp.toFixed(3)}V, Vrms=${chB.vrms.toFixed(3)}V`,
    };
  }

  private readBodePlotter(comp: Component): InstrumentReading {
    const ac = this.lastResult?.data as AcResult | undefined;
    const outNode = this.lastCompiled?.nodeMap.get(`${comp.id}:out_pos`)?.toLowerCase();
    const outDb = outNode && ac ? ac.magnitudeDb[`v(${outNode})`] : undefined;

    let peakDb = -Infinity;
    let peakF = 0;
    if (outDb && ac) {
      for (let i = 0; i < outDb.length; i++) {
        if (outDb[i]! > peakDb) {
          peakDb = outDb[i]!;
          peakF = ac.frequency[i]!;
        }
      }
    }

    return {
      instrumentId: comp.id,
      type: "BODE_PLOTTER",
      readings: { peakFrequency: peakF, peakGainDb: peakDb },
      formatted: `Peak: ${peakDb.toFixed(2)} dB @ ${peakF.toFixed(1)} Hz`,
    };
  }
}

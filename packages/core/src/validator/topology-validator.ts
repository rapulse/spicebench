import { CircuitGraph } from "../graph/circuit-graph";
import { NetExtractor, ElectricalNet } from "../graph/net-extractor";
import { getComponentPins } from "../schema/component";
import { isPinEndpoint } from "../schema/wire";

export type DiagnosticSeverity = "error" | "warning";

export type DiagnosticCode =
  | "NO_GROUND"
  | "FLOATING_NODE"
  | "VOLTAGE_SOURCE_LOOP"
  | "NO_DC_PATH_TO_GROUND"
  | "SHORT_CIRCUIT"
  | "EMPTY_CIRCUIT";

export interface ValidationDiagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  componentIds?: string[];
  pinIds?: Array<{ componentId: string; pinId: string }>;
  netId?: string;
}

export interface ValidationResult {
  isValid: boolean; // true if errors.length === 0
  errors: ValidationDiagnostic[];
  warnings: ValidationDiagnostic[];
  diagnostics: ValidationDiagnostic[];
}

export class TopologyValidator {
  /**
   * Performs static topological checks on a circuit graph prior to SPICE simulation.
   */
  public static validate(graph: CircuitGraph): ValidationResult {
    const diagnostics: ValidationDiagnostic[] = [];

    const components = graph.getAllComponents();
    if (components.length === 0) {
      diagnostics.push({
        code: "EMPTY_CIRCUIT",
        severity: "error",
        message: "The circuit has no components.",
      });
      return TopologyValidator.buildResult(diagnostics);
    }

    const nets = NetExtractor.extractNets(graph);

    // 1. Check for Ground reference node
    TopologyValidator.checkGround(graph, nets, diagnostics);

    // 2. Check for floating pins and dangling wires
    TopologyValidator.checkFloatingNodes(graph, nets, diagnostics);

    // 3. Check for voltage source loops (self-short or parallel sources)
    TopologyValidator.checkVoltageSourceLoops(graph, nets, diagnostics);

    // 4. Check for DC path to ground
    TopologyValidator.checkDcPathToGround(graph, nets, diagnostics);

    return TopologyValidator.buildResult(diagnostics);
  }

  private static checkGround(
    _graph: CircuitGraph,
    nets: ElectricalNet[],
    diagnostics: ValidationDiagnostic[],
  ): void {
    const groundNet = nets.find((n) => n.isGround);
    if (!groundNet || groundNet.pins.length === 0) {
      diagnostics.push({
        code: "NO_GROUND",
        severity: "error",
        message: "Circuit has no ground reference (node 0). Add a GROUND component.",
      });
    }
  }

  private static checkFloatingNodes(
    graph: CircuitGraph,
    nets: ElectricalNet[],
    diagnostics: ValidationDiagnostic[],
  ): void {
    const connectedPins = new Set<string>();
    for (const wire of graph.getAllWires()) {
      if (isPinEndpoint(wire.from)) {
        connectedPins.add(`${wire.from.componentId}:${wire.from.pinId}`);
      }
      if (isPinEndpoint(wire.to)) {
        connectedPins.add(`${wire.to.componentId}:${wire.to.pinId}`);
      }
    }

    // Check each component pin
    for (const comp of graph.getAllComponents()) {
      const pins = getComponentPins(comp.type);
      for (const p of pins) {
        const pinKey = `${comp.id}:${p.id}`;
        if (!connectedPins.has(pinKey)) {
          diagnostics.push({
            code: "FLOATING_NODE",
            severity: "warning",
            message: `Pin "${p.id}" (${p.label}) of component "${comp.id}" is not connected.`,
            componentIds: [comp.id],
            pinIds: [{ componentId: comp.id, pinId: p.id }],
          });
        }
      }
    }

    // Check for dangling wires (nets with only 1 connected pin and no instruments)
    for (const net of nets) {
      if (net.pins.length === 1 && net.wires.length > 0) {
        const p = net.pins[0]!;
        diagnostics.push({
          code: "FLOATING_NODE",
          severity: "warning",
          message: `Dangling wire detected on node ${net.spiceNodeName} (connected only to ${p.componentId}:${p.pinId}).`,
          componentIds: [p.componentId],
          pinIds: [p],
          netId: net.id,
        });
      }
    }
  }

  private static checkVoltageSourceLoops(
    graph: CircuitGraph,
    nets: ElectricalNet[],
    diagnostics: ValidationDiagnostic[],
  ): void {
    const pinToNetMap = new Map<string, string>();
    for (const net of nets) {
      for (const p of net.pins) {
        pinToNetMap.set(`${p.componentId}:${p.pinId}`, net.spiceNodeName);
      }
    }

    // Map to track pairs of nodes spanned by ideal voltage sources: "N1<->N2" -> array of sourceIds
    const sourceNodePairs = new Map<string, string[]>();

    for (const comp of graph.getAllComponents()) {
      const isVoltageSource =
        comp.type === "DC_VOLTAGE_SOURCE" ||
        comp.type === "AC_VOLTAGE_SOURCE" ||
        comp.type === "PULSE_VOLTAGE_SOURCE";

      if (!isVoltageSource) continue;

      const posNet = pinToNetMap.get(`${comp.id}:pos`);
      const negNet = pinToNetMap.get(`${comp.id}:neg`);

      if (!posNet || !negNet) continue;

      // 1. Self-shorted voltage source
      if (posNet === negNet) {
        diagnostics.push({
          code: "VOLTAGE_SOURCE_LOOP",
          severity: "error",
          message: `Voltage source "${comp.id}" is short-circuited to itself on node ${posNet}.`,
          componentIds: [comp.id],
          netId: posNet,
        });
        continue;
      }

      // 2. Parallel voltage sources without series impedance
      const pairKey = [posNet, negNet].sort().join("<->");
      const existing = sourceNodePairs.get(pairKey) || [];
      existing.push(comp.id);
      sourceNodePairs.set(pairKey, existing);
    }

    for (const [pairKey, sourceIds] of sourceNodePairs.entries()) {
      if (sourceIds.length > 1) {
        diagnostics.push({
          code: "VOLTAGE_SOURCE_LOOP",
          severity: "error",
          message: `Voltage sources [${sourceIds.join(", ")}] are connected in parallel across nodes ${pairKey}, causing a voltage source loop.`,
          componentIds: sourceIds,
        });
      }
    }
  }

  private static checkDcPathToGround(
    graph: CircuitGraph,
    nets: ElectricalNet[],
    diagnostics: ValidationDiagnostic[],
  ): void {
    const groundNet = nets.find((n) => n.isGround);
    if (!groundNet) {
      // If there is no ground, NO_GROUND error is already reported
      return;
    }

    const pinToNetMap = new Map<string, string>();
    for (const net of nets) {
      for (const p of net.pins) {
        pinToNetMap.set(`${p.componentId}:${p.pinId}`, net.spiceNodeName);
      }
    }

    // Build DC adjacency graph between net names
    const dcAdj = new Map<string, Set<string>>();
    for (const net of nets) {
      dcAdj.set(net.spiceNodeName, new Set());
    }

    const addDcEdge = (netA: string, netB: string) => {
      if (netA === netB) return;
      dcAdj.get(netA)?.add(netB);
      dcAdj.get(netB)?.add(netA);
    };

    // Components that conduct DC between their terminals:
    // RESISTOR, INDUCTOR, VOLTAGE_SOURCES, POTENTIOMETER, CLOSED SWITCH, DIODES
    for (const comp of graph.getAllComponents()) {
      // CAPACITOR blocks DC completely!
      if (comp.type === "CAPACITOR" || comp.type === "POLARIZED_CAPACITOR") {
        continue;
      }

      if (comp.type === "SWITCH_SPST" && comp.params["state"] === "open") {
        continue;
      }

      if (comp.type === "DC_CURRENT_SOURCE" || comp.type === "AC_CURRENT_SOURCE") {
        // Ideal current source has infinite internal impedance
        continue;
      }

      if (comp.type === "VCC" || comp.type === "VDD") {
        // Supply rail is referenced directly to ground node 0 in SPICE
        const outNet = pinToNetMap.get(`${comp.id}:out`);
        if (outNet) addDcEdge(outNet, "0");
        continue;
      }

      if (comp.type === "VCVS" || comp.type === "VCCS" || comp.type === "CCVS" || comp.type === "CCCS") {
        // Controlled sources isolate input port from output port
        const cp = pinToNetMap.get(`${comp.id}:ctrl_pos`);
        const cn = pinToNetMap.get(`${comp.id}:ctrl_neg`);
        const op = pinToNetMap.get(`${comp.id}:out_pos`);
        const on = pinToNetMap.get(`${comp.id}:out_neg`);
        if ((comp.type === "CCVS" || comp.type === "CCCS") && cp && cn) addDcEdge(cp, cn);
        if ((comp.type === "VCVS" || comp.type === "CCVS") && op && on) addDcEdge(op, on);
        continue;
      }

      const pins = getComponentPins(comp.type);
      const componentNets = pins
        .map((p) => pinToNetMap.get(`${comp.id}:${p.id}`))
        .filter((n): n is string => Boolean(n));

      // Connect all nets of this component in the DC graph
      for (let i = 0; i < componentNets.length; i++) {
        for (let j = i + 1; j < componentNets.length; j++) {
          addDcEdge(componentNets[i]!, componentNets[j]!);
        }
      }
    }

    // BFS from Ground net ("0")
    const reachableNets = new Set<string>(["0"]);
    const queue: string[] = ["0"];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = dcAdj.get(curr) || new Set();
      for (const neighbor of neighbors) {
        if (!reachableNets.has(neighbor)) {
          reachableNets.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // Check which nets with connected pins do not have a DC path to ground
    for (const net of nets) {
      if (!reachableNets.has(net.spiceNodeName) && net.pins.length > 0) {
        diagnostics.push({
          code: "NO_DC_PATH_TO_GROUND",
          severity: "error",
          message: `Node ${net.spiceNodeName} has no DC path to ground (floating DC potential, e.g. blocked by capacitors).`,
          componentIds: net.pins.map((p) => p.componentId),
          pinIds: net.pins,
          netId: net.id,
        });
      }
    }
  }

  private static buildResult(diagnostics: ValidationDiagnostic[]): ValidationResult {
    const errors = diagnostics.filter((d) => d.severity === "error");
    const warnings = diagnostics.filter((d) => d.severity === "warning");

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      diagnostics,
    };
  }
}

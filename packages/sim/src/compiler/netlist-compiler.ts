import {
  CircuitGraph,
  NetExtractor,
  ElectricalNet,
  parseEngineeringValue,
  Component,
} from "@spicebench/core";
import { getModelDefinition, getSubcircuitDefinition } from "./models";
import {
  OHMMETER_TEST_CURRENT,
  deriveAcSweep,
  deriveTranWindow,
  getFunctionGeneratorSettings,
  getMultimeterSettings,
  isPinConnected,
} from "./instrument-settings";
import { SimulationMode } from "../parser/types";

export interface TranOptions {
  tstep?: string;
  tstop: string;
  tstart?: string;
  uic?: boolean;
}

export interface AcOptions {
  scale?: "dec" | "oct" | "lin";
  points?: number;
  fstart: string;
  fstop: string;
}

export interface DcOptions {
  source: string;
  vstart: number;
  vstop: number;
  vstep: number;
}

export interface SimulationOptions {
  mode?: SimulationMode;
  tran?: TranOptions;
  ac?: AcOptions;
  dc?: DcOptions;
  temperature?: number;
}

export interface CompiledNetlist {
  netlist: string;
  nodeMap: Map<string, string>; // "componentId:pinId" -> SPICE node name
  nets: ElectricalNet[];
  usedModels: string[];
  analysisDirective: string;
}

/** Formats a number as a SPICE value ("1meg", "10u", ...). */
const sv = (v: number): string => parseEngineeringValue(v).spiceValue;

export class NetlistCompiler {
  /**
   * Translates a circuit graph into a standard SPICE 3 / ngspice netlist.
   */
  public static compile(
    graph: CircuitGraph,
    options: SimulationOptions = {},
  ): CompiledNetlist {
    const nets = NetExtractor.extractNets(graph);

    // Map each pin to its SPICE node name ("0", "N001", "N002", ...)
    const nodeMap = new Map<string, string>();
    for (const net of nets) {
      for (const p of net.pins) {
        nodeMap.set(`${p.componentId}:${p.pinId}`, net.spiceNodeName);
      }
    }

    let floatingCounter = 1;
    const getNode = (componentId: string, pinId: string): string => {
      const node = nodeMap.get(`${componentId}:${pinId}`);
      if (node !== undefined) return node;
      // If a pin is unconnected, allocate an isolated node
      const floatNode = `N_FLT_${floatingCounter++}`;
      nodeMap.set(`${componentId}:${pinId}`, floatNode);
      return floatNode;
    };

    const lines: string[] = [];
    const usedModels = new Set<string>();
    const usedSubcircuits = new Set<string>();

    // 1. Title line (CRITICAL: line 1 in SPICE is always comment/title)
    const circuitName = graph.meta.name || "SpiceBench Circuit";
    lines.push(`* SpiceBench Netlist: ${circuitName}`);
    lines.push(`* Generated at: ${new Date().toISOString()}`);
    lines.push("");

    // 2. Translate Components
    for (const comp of graph.getAllComponents()) {
      const connected = (pinId: string) => isPinConnected(nets, comp.id, pinId);
      const compLines = NetlistCompiler.translateComponent(
        comp,
        getNode,
        usedModels,
        usedSubcircuits,
        graph,
        connected,
      );
      if (compLines.length > 0) {
        lines.push(...compLines);
      }
    }

    lines.push("");

    // 3. Include .model definitions
    if (usedModels.size > 0) {
      lines.push("* --- Semiconductor Models ---");
      for (const model of usedModels) {
        const def = getModelDefinition(model);
        if (def) {
          lines.push(def);
        }
      }
      lines.push("");
    }

    // 4. Include .subckt definitions
    if (usedSubcircuits.size > 0) {
      lines.push("* --- Subcircuits & IC Models ---");
      for (const subckt of usedSubcircuits) {
        const def = getSubcircuitDefinition(subckt);
        if (def) {
          lines.push(def);
          lines.push("");
        }
      }
    }

    // 5. Determine and include analysis directive (.op, .tran, .ac, .dc)
    const mode = options.mode ?? NetlistCompiler.detectSimulationMode(graph);
    const analysisDirective = NetlistCompiler.buildAnalysisDirective(mode, options, graph);

    lines.push("* --- Analysis Directives ---");
    lines.push(analysisDirective);
    lines.push(".options noacct");
    lines.push(".end");
    lines.push("");

    return {
      netlist: lines.join("\n"),
      nodeMap,
      nets,
      usedModels: Array.from(usedModels),
      analysisDirective,
    };
  }

  private static translateComponent(
    comp: Component,
    getNode: (comp: string, pin: string) => string,
    usedModels: Set<string>,
    usedSubcircuits: Set<string>,
    graph: CircuitGraph,
    connected: (pinId: string) => boolean,
  ): string[] {
    const lines: string[] = [];

    switch (comp.type) {
      case "GROUND":
        // Ground is node 0 in SPICE, no separate component line needed
        break;

      case "RESISTOR": {
        const n1 = getNode(comp.id, "1");
        const n2 = getNode(comp.id, "2");
        const val = parseEngineeringValue(comp.params["resistance"] ?? "1k").spiceValue;
        lines.push(`R_${comp.id} ${n1} ${n2} ${val}`);
        break;
      }

      case "CAPACITOR": {
        const n1 = getNode(comp.id, "1");
        const n2 = getNode(comp.id, "2");
        const val = parseEngineeringValue(comp.params["capacitance"] ?? "1uF").spiceValue;
        const ic = comp.params["ic"] ? ` IC=${parseEngineeringValue(comp.params["ic"]).spiceValue}` : "";
        lines.push(`C_${comp.id} ${n1} ${n2} ${val}${ic}`);
        break;
      }

      case "POLARIZED_CAPACITOR": {
        const nPos = getNode(comp.id, "pos");
        const nNeg = getNode(comp.id, "neg");
        const val = parseEngineeringValue(comp.params["capacitance"] ?? "10uF").spiceValue;
        lines.push(`C_${comp.id} ${nPos} ${nNeg} ${val}`);
        break;
      }

      case "INDUCTOR": {
        const n1 = getNode(comp.id, "1");
        const n2 = getNode(comp.id, "2");
        const val = parseEngineeringValue(comp.params["inductance"] ?? "1mH").spiceValue;
        const ic = comp.params["ic"] ? ` IC=${parseEngineeringValue(comp.params["ic"]).spiceValue}` : "";
        lines.push(`L_${comp.id} ${n1} ${n2} ${val}${ic}`);
        break;
      }

      case "DC_VOLTAGE_SOURCE": {
        const nPos = getNode(comp.id, "pos");
        const nNeg = getNode(comp.id, "neg");
        const val = parseEngineeringValue(comp.params["voltage"] ?? "12V").spiceValue;
        lines.push(`V_${comp.id} ${nPos} ${nNeg} DC ${val}`);
        break;
      }

      case "AC_VOLTAGE_SOURCE": {
        // EWB semantics (ADR-012): "voltage" is RMS. Transient amplitude = RMS·√2;
        // .ac magnitude = RMS so AC-analysis node voltages read like the EWB AC meter.
        const nPos = getNode(comp.id, "pos");
        const nNeg = getNode(comp.id, "neg");
        const vRms = parseEngineeringValue(comp.params["voltage"] ?? comp.params["amplitude"] ?? "120V").value;
        const f = parseEngineeringValue(comp.params["frequency"] ?? "60Hz").value;
        const phase = parseFloat(String(comp.params["phase"] ?? "0").replace(/deg$/i, "")) || 0;
        lines.push(
          `V_${comp.id} ${nPos} ${nNeg} DC 0 AC ${sv(vRms)} ${phase} SIN(0 ${sv(vRms * Math.SQRT2)} ${sv(f)} 0 0 ${phase})`,
        );
        break;
      }

      case "DC_CURRENT_SOURCE": {
        const nPos = getNode(comp.id, "pos");
        const nNeg = getNode(comp.id, "neg");
        const val = parseEngineeringValue(comp.params["current"] ?? "1A").spiceValue;
        lines.push(`I_${comp.id} ${nPos} ${nNeg} DC ${val}`);
        break;
      }

      case "AC_CURRENT_SOURCE": {
        // EWB semantics (ADR-012): "current" is RMS.
        const nPos = getNode(comp.id, "pos");
        const nNeg = getNode(comp.id, "neg");
        const iRms = parseEngineeringValue(comp.params["current"] ?? comp.params["amplitude"] ?? "1A").value;
        const f = parseEngineeringValue(comp.params["frequency"] ?? "1Hz").value;
        const phase = parseFloat(String(comp.params["phase"] ?? "0").replace(/deg$/i, "")) || 0;
        lines.push(
          `I_${comp.id} ${nPos} ${nNeg} DC 0 AC ${sv(iRms)} ${phase} SIN(0 ${sv(iRms * Math.SQRT2)} ${sv(f)} 0 0 ${phase})`,
        );
        break;
      }

      case "VCC":
      case "VDD": {
        const nOut = getNode(comp.id, "out");
        const val = parseEngineeringValue(comp.params["voltage"] ?? "5V").spiceValue;
        lines.push(`V_${comp.id} ${nOut} 0 DC ${val}`);
        break;
      }

      case "VCVS": {
        const op = getNode(comp.id, "out_pos");
        const on = getNode(comp.id, "out_neg");
        const cp = getNode(comp.id, "ctrl_pos");
        const cn = getNode(comp.id, "ctrl_neg");
        const gain = parseEngineeringValue(comp.params["gain"] ?? "1").spiceValue;
        lines.push(`E_${comp.id} ${op} ${on} ${cp} ${cn} ${gain}`);
        break;
      }

      case "VCCS": {
        const op = getNode(comp.id, "out_pos");
        const on = getNode(comp.id, "out_neg");
        const cp = getNode(comp.id, "ctrl_pos");
        const cn = getNode(comp.id, "ctrl_neg");
        const gm = parseEngineeringValue(comp.params["transconductance"] ?? "1").spiceValue;
        lines.push(`G_${comp.id} ${op} ${on} ${cp} ${cn} ${gm}`);
        break;
      }

      case "CCVS": {
        const op = getNode(comp.id, "out_pos");
        const on = getNode(comp.id, "out_neg");
        const cp = getNode(comp.id, "ctrl_pos");
        const cn = getNode(comp.id, "ctrl_neg");
        const rm = parseEngineeringValue(comp.params["transresistance"] ?? "1k").spiceValue;
        lines.push(`V_${comp.id}_ctrl ${cp} ${cn} DC 0`);
        lines.push(`H_${comp.id} ${op} ${on} V_${comp.id}_ctrl ${rm}`);
        break;
      }

      case "CCCS": {
        const op = getNode(comp.id, "out_pos");
        const on = getNode(comp.id, "out_neg");
        const cp = getNode(comp.id, "ctrl_pos");
        const cn = getNode(comp.id, "ctrl_neg");
        const gain = parseEngineeringValue(comp.params["gain"] ?? "1").spiceValue;
        lines.push(`V_${comp.id}_ctrl ${cp} ${cn} DC 0`);
        lines.push(`F_${comp.id} ${op} ${on} V_${comp.id}_ctrl ${gain}`);
        break;
      }

      case "PULSE_VOLTAGE_SOURCE": {
        const nPos = getNode(comp.id, "pos");
        const nNeg = getNode(comp.id, "neg");
        const v1 = parseEngineeringValue(comp.params["v1"] ?? "0V").spiceValue;
        const v2 = parseEngineeringValue(comp.params["v2"] ?? "5V").spiceValue;
        const delay = parseEngineeringValue(comp.params["delay"] ?? "0").spiceValue;
        const rise = parseEngineeringValue(comp.params["riseTime"] ?? "10ns").spiceValue;
        const fall = parseEngineeringValue(comp.params["fallTime"] ?? "10ns").spiceValue;
        const width = parseEngineeringValue(comp.params["width"] ?? "0.5ms").spiceValue;
        const period = parseEngineeringValue(comp.params["period"] ?? "1ms").spiceValue;
        lines.push(
          `V_${comp.id} ${nPos} ${nNeg} PULSE(${v1} ${v2} ${delay} ${rise} ${fall} ${width} ${period})`,
        );
        break;
      }

      case "DIODE": {
        const nA = getNode(comp.id, "anode");
        const nK = getNode(comp.id, "cathode");
        const model = comp.params["model"] || "1N4148";
        usedModels.add(model);
        lines.push(`D_${comp.id} ${nA} ${nK} ${model}`);
        break;
      }

      case "ZENER_DIODE": {
        const nA = getNode(comp.id, "anode");
        const nK = getNode(comp.id, "cathode");
        const model = comp.params["model"] || "BZX55C5V1";
        usedModels.add(model);
        lines.push(`D_${comp.id} ${nA} ${nK} ${model}`);
        break;
      }

      case "LED": {
        const nA = getNode(comp.id, "anode");
        const nK = getNode(comp.id, "cathode");
        usedModels.add("LED");
        lines.push(`D_${comp.id} ${nA} ${nK} LED`);
        break;
      }

      case "BJT_NPN": {
        const nC = getNode(comp.id, "collector");
        const nB = getNode(comp.id, "base");
        const nE = getNode(comp.id, "emitter");
        const model = comp.params["model"] || "2N3904";
        usedModels.add(model);
        lines.push(`Q_${comp.id} ${nC} ${nB} ${nE} ${model}`);
        break;
      }

      case "BJT_PNP": {
        const nC = getNode(comp.id, "collector");
        const nB = getNode(comp.id, "base");
        const nE = getNode(comp.id, "emitter");
        const model = comp.params["model"] || "2N3906";
        usedModels.add(model);
        lines.push(`Q_${comp.id} ${nC} ${nB} ${nE} ${model}`);
        break;
      }

      case "NMOS": {
        const nD = getNode(comp.id, "drain");
        const nG = getNode(comp.id, "gate");
        const nS = getNode(comp.id, "source");
        const model = comp.params["model"] || "2N7000";
        usedModels.add(model);
        lines.push(`M_${comp.id} ${nD} ${nG} ${nS} ${nS} ${model}`);
        break;
      }

      case "PMOS": {
        const nD = getNode(comp.id, "drain");
        const nG = getNode(comp.id, "gate");
        const nS = getNode(comp.id, "source");
        const model = comp.params["model"] || "BS250";
        usedModels.add(model);
        lines.push(`M_${comp.id} ${nD} ${nG} ${nS} ${nS} ${model}`);
        break;
      }

      case "OPAMP":
      case "OPAMP_741": {
        const nInv = getNode(comp.id, "inv");
        const nNonInv = getNode(comp.id, "non_inv");
        const nVPos = getNode(comp.id, "v_pos");
        const nVNeg = getNode(comp.id, "v_neg");
        const nOut = getNode(comp.id, "out");
        usedSubcircuits.add("LM741");
        lines.push(`X_${comp.id} ${nInv} ${nNonInv} ${nVPos} ${nVNeg} ${nOut} LM741`);
        break;
      }

      case "OPAMP_IDEAL": {
        const nInv = getNode(comp.id, "inv");
        const nNonInv = getNode(comp.id, "non_inv");
        const nOut = getNode(comp.id, "out");
        usedSubcircuits.add("OPAMP_IDEAL");
        lines.push(`X_${comp.id} ${nInv} ${nNonInv} ${nOut} OPAMP_IDEAL`);
        break;
      }

      case "TIMER_555": {
        const nGnd = getNode(comp.id, "gnd");
        const nTrig = getNode(comp.id, "trig");
        const nOut = getNode(comp.id, "out");
        const nReset = getNode(comp.id, "reset");
        const nCtrl = getNode(comp.id, "ctrl");
        const nThresh = getNode(comp.id, "thresh");
        const nDisch = getNode(comp.id, "disch");
        const nVcc = getNode(comp.id, "vcc");
        usedSubcircuits.add("TIMER_555");
        lines.push(
          `X_${comp.id} ${nGnd} ${nTrig} ${nOut} ${nReset} ${nCtrl} ${nThresh} ${nDisch} ${nVcc} TIMER_555`,
        );
        break;
      }

      case "AND_GATE": {
        const in1 = getNode(comp.id, "in1");
        const in2 = getNode(comp.id, "in2");
        const out = getNode(comp.id, "out");
        usedSubcircuits.add("GATE_AND");
        lines.push(`X_${comp.id} ${in1} ${in2} ${out} GATE_AND`);
        break;
      }

      case "OR_GATE": {
        const in1 = getNode(comp.id, "in1");
        const in2 = getNode(comp.id, "in2");
        const out = getNode(comp.id, "out");
        usedSubcircuits.add("GATE_OR");
        lines.push(`X_${comp.id} ${in1} ${in2} ${out} GATE_OR`);
        break;
      }

      case "NOT_GATE": {
        const inp = getNode(comp.id, "in");
        const out = getNode(comp.id, "out");
        usedSubcircuits.add("GATE_NOT");
        lines.push(`X_${comp.id} ${inp} ${out} GATE_NOT`);
        break;
      }

      case "NAND_GATE": {
        const in1 = getNode(comp.id, "in1");
        const in2 = getNode(comp.id, "in2");
        const out = getNode(comp.id, "out");
        usedSubcircuits.add("GATE_NAND");
        lines.push(`X_${comp.id} ${in1} ${in2} ${out} GATE_NAND`);
        break;
      }

      case "NOR_GATE": {
        const in1 = getNode(comp.id, "in1");
        const in2 = getNode(comp.id, "in2");
        const out = getNode(comp.id, "out");
        usedSubcircuits.add("GATE_NOR");
        lines.push(`X_${comp.id} ${in1} ${in2} ${out} GATE_NOR`);
        break;
      }

      case "XOR_GATE": {
        const in1 = getNode(comp.id, "in1");
        const in2 = getNode(comp.id, "in2");
        const out = getNode(comp.id, "out");
        usedSubcircuits.add("GATE_XOR");
        lines.push(`X_${comp.id} ${in1} ${in2} ${out} GATE_XOR`);
        break;
      }

      case "BULB": {
        const n1 = getNode(comp.id, "1");
        const n2 = getNode(comp.id, "2");
        const rVal = parseEngineeringValue(comp.params["resistance"] ?? "100").spiceValue;
        lines.push(`R_${comp.id} ${n1} ${n2} ${rVal}`);
        break;
      }

      case "SEVEN_SEGMENT": {
        const com = getNode(comp.id, "com");
        for (const seg of ["a", "b", "c", "d", "e", "f", "g"]) {
          const pinNode = getNode(comp.id, seg);
          lines.push(`R_${comp.id}_${seg} ${pinNode} ${com} 100k`);
        }
        break;
      }

      case "VOLTMETER": {
        if (!connected("pos") || !connected("neg")) break;
        const nPos = getNode(comp.id, "pos");
        const nNeg = getNode(comp.id, "neg");
        const rIn = parseEngineeringValue(comp.params["resistance"] ?? "10meg").spiceValue;
        lines.push(`R_${comp.id}_sense ${nPos} ${nNeg} ${rIn}`);
        break;
      }

      case "AMMETER": {
        if (!connected("pos") || !connected("neg")) break;
        const nPos = getNode(comp.id, "pos");
        const nNeg = getNode(comp.id, "neg");
        lines.push(`V_${comp.id}_sense ${nPos} ${nNeg} DC 0`);
        break;
      }

      case "SWITCH_SPST": {
        const n1 = getNode(comp.id, "1");
        const n2 = getNode(comp.id, "2");
        const isOpen = comp.params["state"] === "open";
        // In SPICE, modeling static switch as very high (100Meg) or low (1m) resistance
        const val = isOpen ? "100meg" : "1m";
        lines.push(`R_${comp.id} ${n1} ${n2} ${val}`);
        break;
      }

      case "POTENTIOMETER": {
        const n1 = getNode(comp.id, "1");
        const nW = getNode(comp.id, "wiper");
        const n2 = getNode(comp.id, "2");
        const rTot = parseEngineeringValue(comp.params["resistance"] ?? "10k").value;
        const pct = Math.min(99.9, Math.max(0.1, parseFloat(comp.params["percent"] ?? "50")));
        const r1 = Math.max(0.001, rTot * (pct / 100));
        const r2 = Math.max(0.001, rTot * (1 - pct / 100));
        lines.push(`R_${comp.id}_A ${n1} ${nW} ${parseEngineeringValue(r1).spiceValue}`);
        lines.push(`R_${comp.id}_B ${nW} ${n2} ${parseEngineeringValue(r2).spiceValue}`);
        break;
      }

      // Virtual Instruments
      case "MULTIMETER": {
        // A meter with a dangling probe measures nothing and must not create floating nodes.
        if (!connected("pos") || !connected("neg")) break;
        const nPos = getNode(comp.id, "pos");
        const nNeg = getNode(comp.id, "neg");
        const { mode } = getMultimeterSettings(graph, comp);
        if (mode === "A") {
          // Ammeter: 0 V sense source; i(V) > 0 when current enters the "+" terminal.
          lines.push(`V_${comp.id}_sense ${nPos} ${nNeg} DC 0`);
        } else if (mode === "R") {
          // Ohmmeter: test current pushed out of "+" into the circuit; R = V(+,-) / I.
          lines.push(`I_${comp.id}_ohm ${nNeg} ${nPos} DC ${sv(OHMMETER_TEST_CURRENT)}`);
        } else {
          // Voltmeter (V, dB): 10 MOhm input impedance.
          lines.push(`R_${comp.id}_sense ${nPos} ${nNeg} 10meg`);
        }
        break;
      }

      case "FUNCTION_GENERATOR": {
        // "+" = signal relative to COM, "-" = inverted signal relative to COM (EWB semantics).
        if (!connected("com") || (!connected("pos") && !connected("neg"))) break;
        const nPos = getNode(comp.id, "pos");
        const nCom = getNode(comp.id, "com");
        const nNeg = getNode(comp.id, "neg");
        const g = getFunctionGeneratorSettings(graph, comp);
        const A = g.amplitudeV;
        const per = 1 / g.frequencyHz;
        const duty = g.dutyCycle / 100;
        let wave: string;
        if (g.waveform === "sine") {
          wave = `SIN(${sv(g.offsetV)} ${sv(A)} ${sv(g.frequencyHz)})`;
        } else if (g.waveform === "square") {
          const edge = Math.min(1e-9, per / 1000);
          const pw = Math.max(edge, duty * per - edge);
          wave = `PULSE(${sv(g.offsetV - A)} ${sv(g.offsetV + A)} 0 ${sv(edge)} ${sv(edge)} ${sv(pw)} ${sv(per)})`;
        } else {
          // Triangle: rise for duty*T, fall for the rest; pulse width ~0.
          const tr = duty * per;
          const tf = per - tr;
          wave = `PULSE(${sv(g.offsetV - A)} ${sv(g.offsetV + A)} 0 ${sv(tr)} ${sv(tf)} ${sv(per / 1e6)} ${sv(per)})`;
        }
        lines.push(`V_${comp.id} ${nPos} ${nCom} DC ${sv(g.offsetV)} AC ${sv(A)} ${wave}`);
        if (connected("neg")) lines.push(`E_${comp.id}_neg ${nNeg} ${nCom} ${nPos} ${nCom} -1`);
        break;
      }

      case "OSCILLOSCOPE": {
        // Unconnected "-" input is referenced to ground; unconnected channel emits nothing.
        const ref = (pin: string) => (connected(pin) ? getNode(comp.id, pin) : "0");
        if (connected("ch_a_pos")) lines.push(`R_${comp.id}_chA ${getNode(comp.id, "ch_a_pos")} ${ref("ch_a_neg")} 1meg`);
        if (connected("ch_b_pos")) lines.push(`R_${comp.id}_chB ${getNode(comp.id, "ch_b_pos")} ${ref("ch_b_neg")} 1meg`);
        break;
      }

      case "BODE_PLOTTER": {
        const ref = (pin: string) => (connected(pin) ? getNode(comp.id, pin) : "0");
        if (connected("in_pos")) lines.push(`R_${comp.id}_in ${getNode(comp.id, "in_pos")} ${ref("in_neg")} 10meg`);
        if (connected("out_pos")) lines.push(`R_${comp.id}_out ${getNode(comp.id, "out_pos")} ${ref("out_neg")} 10meg`);
        break;
      }
    }

    return lines;
  }

  /**
   * Single analysis for a run without an explicit mode. Deterministic priority,
   * independent of component order: Bode plotter -> .ac; anything time-dependent -> .tran; else .op.
   * (CircuitSession runs every analysis the instruments need; see ADR-011.)
   */
  private static detectSimulationMode(graph: CircuitGraph): SimulationMode {
    const comps = graph.getAllComponents();
    if (comps.some((c) => c.type === "BODE_PLOTTER")) return "ac";
    const timeDependent = comps.some(
      (c) =>
        c.type === "OSCILLOSCOPE" ||
        c.type === "AC_VOLTAGE_SOURCE" ||
        c.type === "AC_CURRENT_SOURCE" ||
        c.type === "PULSE_VOLTAGE_SOURCE" ||
        c.type === "FUNCTION_GENERATOR" ||
        c.type === "TIMER_555" ||
        (c.type === "MULTIMETER" && getMultimeterSettings(graph, c).coupling === "AC") ||
        ((c.type === "VOLTMETER" || c.type === "AMMETER") &&
          String(c.params["mode"] ?? "DC").toUpperCase() === "AC"),
    );
    return timeDependent ? "tran" : "op";
  }

  private static buildAnalysisDirective(
    mode: SimulationMode,
    options: SimulationOptions,
    graph: CircuitGraph,
  ): string {
    switch (mode) {
      case "op":
        return ".op";

      case "tran": {
        // Oscillators built on the 555 macromodel have no DC operating point:
        // start them from zero initial conditions unless the caller decided explicitly (ADR-009).
        const has555 = graph.getAllComponents().some((c) => c.type === "TIMER_555");
        const uicFlag = options.tran?.uic ?? has555;
        const uic = uicFlag ? " uic" : "";
        if (options.tran) {
          const tstep = options.tran.tstep ?? "10u";
          const tstop = options.tran.tstop;
          const tstart = options.tran.tstart ? ` ${options.tran.tstart}` : "";
          return `.tran ${tstep} ${tstop}${tstart}${uic}`;
        }
        // Derived from instruments: one scope screen / generator periods (ADR-011)
        const w = deriveTranWindow(graph);
        return `.tran ${sv(w.tstep)} ${sv(w.tstop)}${uic}`;
      }

      case "ac": {
        if (options.ac) {
          const scale = options.ac.scale ?? "dec";
          const pts = options.ac.points ?? 20;
          return `.ac ${scale} ${pts} ${options.ac.fstart} ${options.ac.fstop}`;
        }
        const a = deriveAcSweep(graph);
        return `.ac dec ${a.points} ${sv(a.fstart)} ${sv(a.fstop)}`;
      }

      case "dc": {
        if (options.dc) {
          return `.dc ${options.dc.source} ${options.dc.vstart} ${options.dc.vstop} ${options.dc.vstep}`;
        }
        return ".op";
      }
    }
  }
}

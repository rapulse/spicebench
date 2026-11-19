import {
  CircuitGraph,
  createDefaultComponent,
  type CircuitProject,
} from "@spicebench/core";

export interface ImportResult {
  project: CircuitProject;
  warnings: string[];
}

export class SpiceImporter {
  /**
   * Imports a SPICE netlist string (.cir / .net / .sp) and constructs a visual CircuitProject
   * with automatically arranged components and Manhattan wire connections.
   */
  public static importNetlist(netlistText: string, projectName = "Imported Circuit"): ImportResult {
    const graph = new CircuitGraph();
    const warnings: string[] = [];

    // Map net names to array of pin endpoints: netName -> Array<{ componentId, pinId }>
    const netPins = new Map<string, Array<{ componentId: string; pinId: string }>>();

    const addPinToNet = (net: string, compId: string, pinId: string) => {
      const normNet = net.toLowerCase();
      let list = netPins.get(normNet);
      if (!list) {
        list = [];
        netPins.set(normNet, list);
      }
      list.push({ componentId: compId, pinId });
    };

    // Preprocessing: merge line continuations (+)
    const rawLines = netlistText.split(/\r?\n/);
    const mergedLines: string[] = [];
    for (const raw of rawLines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("+") && mergedLines.length > 0) {
        mergedLines[mergedLines.length - 1] += " " + line.slice(1).trim();
      } else {
        mergedLines.push(line);
      }
    }

    let col = 0;
    let row = 0;
    const maxCols = 5;
    const colWidth = 14;
    const rowHeight = 10;
    const startX = 10;
    const startY = 10;

    const nextPosition = () => {
      const pos = { x: startX + col * colWidth, y: startY + row * rowHeight };
      col++;
      if (col >= maxCols) {
        col = 0;
        row++;
      }
      return pos;
    };

    // Track subcircuit definitions in netlist to recognize custom subckts
    const knownSubckts = new Set<string>([
      "gate_and",
      "gate_or",
      "gate_not",
      "gate_nand",
      "gate_nor",
      "gate_xor",
      "opamp_ideal",
      "lm741",
      "timer_555",
    ]);

    for (const line of mergedLines) {
      if (line.startsWith("*") || line.startsWith(".")) {
        // Collect .subckt names if defined
        const subMatch = line.match(/^\.subckt\s+(\S+)/i);
        if (subMatch && subMatch[1]) {
          knownSubckts.add(subMatch[1].toLowerCase());
        }
        continue;
      }

      const tokens = line.split(/\s+/);
      if (tokens.length < 3) continue;

      const rawId = tokens[0]!;
      const compId = rawId;
      const firstChar = rawId.charAt(0).toUpperCase();

      try {
        switch (firstChar) {
          case "R": {
            // Rname n1 n2 val
            if (tokens.length >= 4) {
              const val = tokens[3]!;
              const comp = createDefaultComponent("RESISTOR", compId, nextPosition());
              comp.params["resistance"] = val;
              graph.addComponent(comp);
              addPinToNet(tokens[1]!, compId, "1");
              addPinToNet(tokens[2]!, compId, "2");
            }
            break;
          }

          case "C": {
            // Cname n1 n2 val
            if (tokens.length >= 4) {
              const val = tokens[3]!;
              const comp = createDefaultComponent("CAPACITOR", compId, nextPosition());
              comp.params["capacitance"] = val;
              graph.addComponent(comp);
              addPinToNet(tokens[1]!, compId, "1");
              addPinToNet(tokens[2]!, compId, "2");
            }
            break;
          }

          case "L": {
            // Lname n1 n2 val
            if (tokens.length >= 4) {
              const val = tokens[3]!;
              const comp = createDefaultComponent("INDUCTOR", compId, nextPosition());
              comp.params["inductance"] = val;
              graph.addComponent(comp);
              addPinToNet(tokens[1]!, compId, "1");
              addPinToNet(tokens[2]!, compId, "2");
            }
            break;
          }

          case "D": {
            // Dname a k [model]
            const model = tokens[3] || "1N4148";
            const isLed = /led/i.test(model);
            const isZener = /bzx|zener/i.test(model);
            const type = isLed ? "LED" : isZener ? "ZENER_DIODE" : "DIODE";
            const comp = createDefaultComponent(type, compId, nextPosition());
            comp.params["model"] = model;
            graph.addComponent(comp);
            addPinToNet(tokens[1]!, compId, "anode");
            addPinToNet(tokens[2]!, compId, "cathode");
            break;
          }

          case "V": {
            // Vname pos neg [DC val] [AC val] [SIN(...)]
            const isSin = line.toUpperCase().includes("SIN(") || line.toUpperCase().includes("AC ");
            const type = isSin ? "AC_VOLTAGE_SOURCE" : "DC_VOLTAGE_SOURCE";
            const comp = createDefaultComponent(type, compId, nextPosition());

            let val = "5V";
            const dcIdx = tokens.findIndex((t) => t.toUpperCase() === "DC");
            if (dcIdx !== -1 && tokens[dcIdx + 1]) {
              val = tokens[dcIdx + 1]!;
            } else if (tokens[3] && !tokens[3].toUpperCase().includes("SIN")) {
              val = tokens[3];
            }
            comp.params["voltage"] = val;
            graph.addComponent(comp);
            addPinToNet(tokens[1]!, compId, "pos");
            addPinToNet(tokens[2]!, compId, "neg");
            break;
          }

          case "I": {
            // Iname pos neg [DC val]
            const comp = createDefaultComponent("DC_CURRENT_SOURCE", compId, nextPosition());
            let val = "1A";
            const dcIdx = tokens.findIndex((t) => t.toUpperCase() === "DC");
            if (dcIdx !== -1 && tokens[dcIdx + 1]) {
              val = tokens[dcIdx + 1]!;
            } else if (tokens[3]) {
              val = tokens[3];
            }
            comp.params["current"] = val;
            graph.addComponent(comp);
            addPinToNet(tokens[1]!, compId, "pos");
            addPinToNet(tokens[2]!, compId, "neg");
            break;
          }

          case "Q": {
            // Qname c b e model
            const model = tokens[4] || "2N3904";
            const isPnp = /pnp|3906/i.test(model);
            const comp = createDefaultComponent(
              isPnp ? "BJT_PNP" : "BJT_NPN",
              compId,
              nextPosition(),
            );
            comp.params["model"] = model;
            graph.addComponent(comp);
            addPinToNet(tokens[1]!, compId, "collector");
            addPinToNet(tokens[2]!, compId, "base");
            addPinToNet(tokens[3]!, compId, "emitter");
            break;
          }

          case "M": {
            // Mname d g s b model
            const model = tokens[5] || "2N7000";
            const isPmos = /pmos|bs250|9510/i.test(model);
            const comp = createDefaultComponent(isPmos ? "PMOS" : "NMOS", compId, nextPosition());
            comp.params["model"] = model;
            graph.addComponent(comp);
            addPinToNet(tokens[1]!, compId, "drain");
            addPinToNet(tokens[2]!, compId, "gate");
            addPinToNet(tokens[3]!, compId, "source");
            break;
          }

          case "X": {
            // Subcircuit instance: Xname p1 p2 ... subckt
            const subName = tokens[tokens.length - 1]!.toLowerCase();

            if (subName === "gate_and") {
              const comp = createDefaultComponent("AND_GATE", compId, nextPosition());
              graph.addComponent(comp);
              addPinToNet(tokens[1]!, compId, "in1");
              addPinToNet(tokens[2]!, compId, "in2");
              addPinToNet(tokens[3]!, compId, "out");
            } else if (subName === "gate_or") {
              const comp = createDefaultComponent("OR_GATE", compId, nextPosition());
              graph.addComponent(comp);
              addPinToNet(tokens[1]!, compId, "in1");
              addPinToNet(tokens[2]!, compId, "in2");
              addPinToNet(tokens[3]!, compId, "out");
            } else if (subName === "gate_not") {
              const comp = createDefaultComponent("NOT_GATE", compId, nextPosition());
              graph.addComponent(comp);
              addPinToNet(tokens[1]!, compId, "in");
              addPinToNet(tokens[2]!, compId, "out");
            } else if (subName === "gate_nand") {
              const comp = createDefaultComponent("NAND_GATE", compId, nextPosition());
              graph.addComponent(comp);
              addPinToNet(tokens[1]!, compId, "in1");
              addPinToNet(tokens[2]!, compId, "in2");
              addPinToNet(tokens[3]!, compId, "out");
            } else if (subName === "gate_nor") {
              const comp = createDefaultComponent("NOR_GATE", compId, nextPosition());
              graph.addComponent(comp);
              addPinToNet(tokens[1]!, compId, "in1");
              addPinToNet(tokens[2]!, compId, "in2");
              addPinToNet(tokens[3]!, compId, "out");
            } else if (subName === "gate_xor") {
              const comp = createDefaultComponent("XOR_GATE", compId, nextPosition());
              graph.addComponent(comp);
              addPinToNet(tokens[1]!, compId, "in1");
              addPinToNet(tokens[2]!, compId, "in2");
              addPinToNet(tokens[3]!, compId, "out");
            } else if (subName === "opamp_ideal") {
              const comp = createDefaultComponent("OPAMP_IDEAL", compId, nextPosition());
              graph.addComponent(comp);
              addPinToNet(tokens[1]!, compId, "inv");
              addPinToNet(tokens[2]!, compId, "non_inv");
              addPinToNet(tokens[3]!, compId, "out");
            } else if (subName === "lm741" || subName === "opamp") {
              const comp = createDefaultComponent("OPAMP_741", compId, nextPosition());
              graph.addComponent(comp);
              addPinToNet(tokens[1]!, compId, "inv");
              addPinToNet(tokens[2]!, compId, "non_inv");
              addPinToNet(tokens[3]!, compId, "v_pos");
              addPinToNet(tokens[4]!, compId, "v_neg");
              addPinToNet(tokens[5]!, compId, "out");
            } else if (subName === "timer_555") {
              const comp = createDefaultComponent("TIMER_555", compId, nextPosition());
              graph.addComponent(comp);
              addPinToNet(tokens[1]!, compId, "gnd");
              addPinToNet(tokens[2]!, compId, "trig");
              addPinToNet(tokens[3]!, compId, "out");
              addPinToNet(tokens[4]!, compId, "reset");
              addPinToNet(tokens[5]!, compId, "ctrl");
              addPinToNet(tokens[6]!, compId, "thresh");
              addPinToNet(tokens[7]!, compId, "disch");
              addPinToNet(tokens[8]!, compId, "vcc");
            } else {
              warnings.push(`Unsupported subcircuit '${subName}' skipped: ${line}`);
            }
            break;
          }

          default:
            warnings.push(`Unrecognized SPICE line skipped: ${line}`);
            break;
        }
      } catch (err) {
        warnings.push(`Failed to parse line '${line}': ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Connect nets
    let gndCounter = 1;
    for (const [netName, pins] of netPins.entries()) {
      if (pins.length < 2 && netName !== "0" && netName !== "gnd") {
        continue;
      }

      if (netName === "0" || netName === "gnd") {
        // Connect each ground-connected pin to a GROUND component
        for (const pin of pins) {
          const comp = graph.getComponent(pin.componentId);
          const gndPos = comp ? { x: comp.position.x, y: comp.position.y + 6 } : nextPosition();
          const gndComp = createDefaultComponent("GROUND", `GND_${gndCounter++}`, gndPos);
          graph.addComponent(gndComp);
          graph.connectPins(pin, { componentId: gndComp.id, pinId: "0" });
        }
      } else {
        // Daisy-chain the pins connected to this net
        for (let i = 0; i < pins.length - 1; i++) {
          graph.connectPins(pins[i]!, pins[i + 1]!);
        }
      }
    }

    const project = graph.toProject();
    project.meta.name = projectName;
    project.meta.updatedAt = new Date().toISOString();

    return { project, warnings };
  }
}

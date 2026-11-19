import { SpiceEngine, RawSimulationOutput } from "./engine-interface";
import { parseEngineeringValue } from "@spicebench/core";

class FloatMatrix {
  public readonly data: Float64Array;

  constructor(public readonly size: number) {
    this.data = new Float64Array(size * size);
  }

  public get(r: number, c: number): number {
    return this.data[r * this.size + c] ?? 0;
  }

  public set(r: number, c: number, val: number): void {
    this.data[r * this.size + c] = val;
  }

  public add(r: number, c: number, val: number): void {
    const idx = r * this.size + c;
    this.data[idx] = (this.data[idx] ?? 0) + val;
  }

  public swapRows(r1: number, r2: number): void {
    if (r1 === r2) return;
    const base1 = r1 * this.size;
    const base2 = r2 * this.size;
    for (let c = 0; c < this.size; c++) {
      const temp = this.data[base1 + c] ?? 0;
      this.data[base1 + c] = this.data[base2 + c] ?? 0;
      this.data[base2 + c] = temp;
    }
  }
}

interface Resistor {
  name: string;
  n1: string;
  n2: string;
  r: number;
}
interface Capacitor {
  name: string;
  n1: string;
  n2: string;
  c: number;
  ic?: number;
}
interface Inductor {
  name: string;
  n1: string;
  n2: string;
  l: number;
  ic?: number;
}
interface VSource {
  name: string;
  pos: string;
  neg: string;
  dc: number;
  ac?: number;
  sin?: { ampl: number; freq: number };
  pulse?: {
    v1: number;
    v2: number;
    td: number;
    tr: number;
    tf: number;
    pw: number;
    per: number;
  };
}
interface ISource {
  name: string;
  pos: string;
  neg: string;
  dc: number;
}
interface BSource {
  name: string;
  pos: string;
  neg: string;
  expr: string;
}
interface ESource {
  name: string;
  pos: string;
  neg: string;
  ctrlPos: string;
  ctrlNeg: string;
  gain: number;
}
interface Diode {
  name: string;
  a: string;
  k: string;
  model: string;
}
interface Mosfet {
  name: string;
  d: string;
  g: string;
  s: string;
  b: string;
  model: string;
}
interface Bjt {
  name: string;
  c: string;
  b: string;
  e: string;
  model: string;
}

export class BuiltinMnaEngine implements SpiceEngine {
  public readonly name = "BuiltinMnaEngine";

  public async isAvailable(): Promise<boolean> {
    return true; // Always available in pure TypeScript
  }

  public async execute(netlist: string, _timeoutMs: number): Promise<RawSimulationOutput> {
    try {
      const rawText = this.solveNetlist(netlist);
      return {
        rawFileText: rawText,
        stdout: "Simulation completed successfully using Builtin MNA Engine.",
        stderr: "",
        exitCode: 0,
      };
    } catch (err) {
      return {
        rawFileText: undefined,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        exitCode: 1,
      };
    }
  }

  private solveNetlist(netlist: string): string {
    // 1. Merge continuation lines (+)
    const mergedLines: string[] = [];
    for (const raw of netlist.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.startsWith("+") && mergedLines.length > 0) {
        mergedLines[mergedLines.length - 1] += " " + line.slice(1).trim();
      } else {
        mergedLines.push(line);
      }
    }

    // 2. Flatten all subcircuits (.subckt ... .ends and X...)
    const lines = this.flattenSubcircuits(mergedLines);

    let mode: "op" | "tran" | "ac" = "op";
    const tranParams = { tstep: 1e-5, tstop: 1e-2, uic: false };
    const acParams = { scale: "dec", points: 20, fstart: 10, fstop: 1e5 };

    const resistors: Resistor[] = [];
    const capacitors: Capacitor[] = [];
    const inductors: Inductor[] = [];
    const vSources: VSource[] = [];
    const iSources: ISource[] = [];
    const bSources: BSource[] = [];
    const eSources: ESource[] = [];
    const diodes: Diode[] = [];
    const mosfets: Mosfet[] = [];
    const bjts: Bjt[] = [];

    for (const line of lines) {
      if (line.startsWith("*") || line === "" || line.startsWith(".end")) continue;

      if (/^\.op(\s+|$)/i.test(line)) {
        mode = "op";
      } else if (/^\.tran(\s+|$)/i.test(line)) {
        mode = "tran";
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          tranParams.tstep = parseEngineeringValue(parts[1]!).value;
          tranParams.tstop = parseEngineeringValue(parts[2]!).value;
          if (line.includes("uic")) tranParams.uic = true;
        }
      } else if (/^\.ac(\s+|$)/i.test(line)) {
        mode = "ac";
        const parts = line.split(/\s+/);
        if (parts.length >= 5) {
          acParams.scale = parts[1]!.toLowerCase();
          acParams.points = parseInt(parts[2]!, 10);
          acParams.fstart = parseEngineeringValue(parts[3]!).value;
          acParams.fstop = parseEngineeringValue(parts[4]!).value;
        }
      } else if (line.startsWith(".options") || line.startsWith(".model")) {
        continue;
      } else if (/^[rR]\S*\s+/i.test(line)) {
        const parts = line.split(/\s+/);
        if (parts.length < 4) {
          throw new Error(`Error: syntax error in resistor declaration: ${line}`);
        }
        resistors.push({
          name: parts[0]!.toLowerCase(),
          n1: parts[1]!.toLowerCase(),
          n2: parts[2]!.toLowerCase(),
          r: Math.max(1e-6, parseEngineeringValue(parts[3]!).value),
        });
      } else if (/^[cC]\S*\s+/i.test(line)) {
        const parts = line.split(/\s+/);
        if (parts.length < 4) {
          throw new Error(`Error: syntax error in capacitor declaration: ${line}`);
        }
        capacitors.push({
          name: parts[0]!.toLowerCase(),
          n1: parts[1]!.toLowerCase(),
          n2: parts[2]!.toLowerCase(),
          c: parseEngineeringValue(parts[3]!).value,
        });
      } else if (/^[lL]\S*\s+/i.test(line)) {
        const parts = line.split(/\s+/);
        if (parts.length < 4) {
          throw new Error(`Error: syntax error in inductor declaration: ${line}`);
        }
        inductors.push({
          name: parts[0]!.toLowerCase(),
          n1: parts[1]!.toLowerCase(),
          n2: parts[2]!.toLowerCase(),
          l: parseEngineeringValue(parts[3]!).value,
        });
      } else if (/^[vV]\S*\s+/i.test(line)) {
        const parts = line.split(/\s+/);
        if (parts.length < 3) {
          throw new Error(`Error: syntax error in voltage source declaration: ${line}`);
        }
        const name = parts[0]!.toLowerCase();
        const pos = parts[1]!.toLowerCase();
        const neg = parts[2]!.toLowerCase();

        let dcVal = 0;
        let acVal = 0;
        const sinMatch = line.match(/SIN\(\s*0\s+([^\s)]+)\s+([^\s)]+)\)/i);
        const pulseMatch = line.match(
          /PULSE\(\s*([^\s)]+)\s+([^\s)]+)\s+([^\s)]+)\s+([^\s)]+)\s+([^\s)]+)\s+([^\s)]+)\s+([^\s)]+)\s*\)/i,
        );

        if (line.includes("DC")) {
          const dcIdx = parts.indexOf("DC");
          if (dcIdx !== -1 && parts[dcIdx + 1]) {
            dcVal = parseEngineeringValue(parts[dcIdx + 1]!).value;
          }
        } else if (!sinMatch && !pulseMatch && parts[3]) {
          dcVal = parseEngineeringValue(parts[3]!).value;
        }

        if (line.includes("AC")) {
          const acIdx = parts.indexOf("AC");
          if (acIdx !== -1 && parts[acIdx + 1]) {
            acVal = parseEngineeringValue(parts[acIdx + 1]!).value;
          }
        }

        let sinConfig: { ampl: number; freq: number } | undefined;
        if (sinMatch && sinMatch[1] && sinMatch[2]) {
          sinConfig = {
            ampl: parseEngineeringValue(sinMatch[1]).value,
            freq: parseEngineeringValue(sinMatch[2]).value,
          };
          if (!acVal) acVal = sinConfig.ampl;
        }

        let pulseConfig: VSource["pulse"] | undefined;
        if (pulseMatch) {
          pulseConfig = {
            v1: parseEngineeringValue(pulseMatch[1]!).value,
            v2: parseEngineeringValue(pulseMatch[2]!).value,
            td: parseEngineeringValue(pulseMatch[3]!).value,
            tr: Math.max(1e-12, parseEngineeringValue(pulseMatch[4]!).value),
            tf: Math.max(1e-12, parseEngineeringValue(pulseMatch[5]!).value),
            pw: parseEngineeringValue(pulseMatch[6]!).value,
            per: Math.max(1e-12, parseEngineeringValue(pulseMatch[7]!).value),
          };
        }

        vSources.push({
          name,
          pos,
          neg,
          dc: dcVal,
          ac: acVal,
          sin: sinConfig,
          pulse: pulseConfig,
        });
      } else if (/^[iI]\S*\s+/i.test(line)) {
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          const name = parts[0]!.toLowerCase();
          const pos = parts[1]!.toLowerCase();
          const neg = parts[2]!.toLowerCase();
          let dcVal = 1;
          const dcIdx = parts.indexOf("DC");
          if (dcIdx !== -1 && parts[dcIdx + 1]) {
            dcVal = parseEngineeringValue(parts[dcIdx + 1]!).value;
          } else if (parts[3]) {
            dcVal = parseEngineeringValue(parts[3]!).value;
          }
          iSources.push({ name, pos, neg, dc: dcVal });
        }
      } else if (/^[bB]\S*\s+/i.test(line)) {
        // Behavioral source: Bname pos neg V=expr
        const match = line.match(/^([bB]\S+)\s+(\S+)\s+(\S+)\s+(V=.+)$/i);
        if (match) {
          bSources.push({
            name: match[1]!.toLowerCase(),
            pos: match[2]!.toLowerCase(),
            neg: match[3]!.toLowerCase(),
            expr: match[4]!,
          });
        }
      } else if (/^[eE]\S*\s+/i.test(line)) {
        // VCVS: Ename pos neg ctrlPos ctrlNeg gain
        const parts = line.split(/\s+/);
        if (parts.length >= 6) {
          eSources.push({
            name: parts[0]!.toLowerCase(),
            pos: parts[1]!.toLowerCase(),
            neg: parts[2]!.toLowerCase(),
            ctrlPos: parts[3]!.toLowerCase(),
            ctrlNeg: parts[4]!.toLowerCase(),
            gain: parseEngineeringValue(parts[5]!).value,
          });
        }
      } else if (/^[dD]\S*\s+/i.test(line)) {
        // Diode: Dname a k model
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          diodes.push({
            name: parts[0]!.toLowerCase(),
            a: parts[1]!.toLowerCase(),
            k: parts[2]!.toLowerCase(),
            model: parts[3] ?? "default_diode",
          });
        }
      } else if (/^[mM]\S*\s+/i.test(line)) {
        // MOSFET: Mname d g s b model
        const parts = line.split(/\s+/);
        if (parts.length >= 5) {
          mosfets.push({
            name: parts[0]!.toLowerCase(),
            d: parts[1]!.toLowerCase(),
            g: parts[2]!.toLowerCase(),
            s: parts[3]!.toLowerCase(),
            b: parts[4]!.toLowerCase(),
            model: parts[5] ?? "default_nmos",
          });
        }
      } else if (/^[qQ]\S*\s+/i.test(line)) {
        // BJT: Qname c b e model
        const parts = line.split(/\s+/);
        if (parts.length >= 4) {
          bjts.push({
            name: parts[0]!.toLowerCase(),
            c: parts[1]!.toLowerCase(),
            b: parts[2]!.toLowerCase(),
            e: parts[3]!.toLowerCase(),
            model: parts[4] ?? "2n3904",
          });
        }
      }
    }

    const nodeSet = new Set<string>();
    const registerNode = (n: string) => {
      if (n !== "0") nodeSet.add(n);
    };

    for (const r of resistors) {
      registerNode(r.n1);
      registerNode(r.n2);
    }
    for (const c of capacitors) {
      registerNode(c.n1);
      registerNode(c.n2);
    }
    for (const l of inductors) {
      registerNode(l.n1);
      registerNode(l.n2);
    }
    for (const v of vSources) {
      registerNode(v.pos);
      registerNode(v.neg);
    }
    for (const i of iSources) {
      registerNode(i.pos);
      registerNode(i.neg);
    }
    for (const b of bSources) {
      registerNode(b.pos);
      registerNode(b.neg);
    }
    for (const e of eSources) {
      registerNode(e.pos);
      registerNode(e.neg);
      registerNode(e.ctrlPos);
      registerNode(e.ctrlNeg);
    }
    for (const d of diodes) {
      registerNode(d.a);
      registerNode(d.k);
    }
    for (const m of mosfets) {
      registerNode(m.d);
      registerNode(m.g);
      registerNode(m.s);
    }
    for (const q of bjts) {
      registerNode(q.c);
      registerNode(q.b);
      registerNode(q.e);
    }

    const nodeList = Array.from(nodeSet).sort();
    const nodeIndex = new Map<string, number>();
    nodeList.forEach((n, idx) => nodeIndex.set(n, idx));

    const numNodes = nodeList.length;

    if (mode === "op") {
      return this.solveOp(
        numNodes,
        nodeList,
        nodeIndex,
        resistors,
        vSources,
        iSources,
        bSources,
        eSources,
        diodes,
        mosfets,
        bjts,
      );
    } else if (mode === "tran") {
      return this.solveTran(
        numNodes,
        nodeList,
        nodeIndex,
        resistors,
        capacitors,
        inductors,
        vSources,
        iSources,
        bSources,
        eSources,
        diodes,
        mosfets,
        bjts,
        tranParams,
      );
    } else {
      return this.solveAc(
        numNodes,
        nodeList,
        nodeIndex,
        resistors,
        capacitors,
        inductors,
        vSources,
        acParams,
      );
    }
  }

  private solveOp(
    numNodes: number,
    nodeList: string[],
    nodeIndex: Map<string, number>,
    resistors: Resistor[],
    vSources: VSource[],
    iSources: ISource[],
    bSources: BSource[],
    eSources: ESource[],
    diodes: Diode[],
    mosfets: Mosfet[],
    bjts: Bjt[],
  ): string {
    // Total voltage sources in MNA: independent V + behavioral B + VCVS E
    interface ActiveVSrc {
      name: string;
      pos: string;
      neg: string;
    }
    const allVSources: ActiveVSrc[] = [
      ...vSources.map((v) => ({ name: v.name, pos: v.pos, neg: v.neg })),
      ...bSources.map((b) => ({ name: b.name, pos: b.pos, neg: b.neg })),
      ...eSources.map((e) => ({ name: e.name, pos: e.pos, neg: e.neg })),
    ];

    const totalSize = numNodes + allVSources.length;
    let nodeVoltages = new Map<string, number>();

    const getV = (node: string): number => {
      if (node === "0") return 0;
      return nodeVoltages.get(node) ?? 0;
    };

    let lastX: Float64Array<ArrayBufferLike> = new Float64Array(totalSize);

    // Iterative relaxation loop (3-5 iterations to converge logic gates, op-amps & diodes)
    for (let iter = 0; iter < 5; iter++) {
      const A = new FloatMatrix(totalSize);
      const z = new Float64Array(totalSize);

      // GMIN conductance to ground on all nodes for numerical stability
      for (let i = 0; i < numNodes; i++) {
        A.add(i, i, 1e-12);
      }

      // Linear resistors
      for (const r of resistors) {
        const g = 1 / r.r;
        const i1 = nodeIndex.get(r.n1);
        const i2 = nodeIndex.get(r.n2);
        if (i1 !== undefined) A.add(i1, i1, g);
        if (i2 !== undefined) A.add(i2, i2, g);
        if (i1 !== undefined && i2 !== undefined) {
          A.add(i1, i2, -g);
          A.add(i2, i1, -g);
        }
      }

      // Diode effective resistance
      for (const d of diodes) {
        const vd = getV(d.a) - getV(d.k);
        const rEff = vd > 0.6 ? 1.0 : 1e8;
        const g = 1 / rEff;
        const i1 = nodeIndex.get(d.a);
        const i2 = nodeIndex.get(d.k);
        if (i1 !== undefined) A.add(i1, i1, g);
        if (i2 !== undefined) A.add(i2, i2, g);
        if (i1 !== undefined && i2 !== undefined) {
          A.add(i1, i2, -g);
          A.add(i2, i1, -g);
        }
      }

      // MOSFET effective channel resistance
      for (const m of mosfets) {
        const vgs = getV(m.g) - getV(m.s);
        const isPMOS = /pmos|bs250|9510/i.test(m.model);
        const isOn = isPMOS ? vgs < -2.0 : vgs > 2.0;
        const rEff = isOn ? 1.0 : 1e8;
        const g = 1 / rEff;
        const i1 = nodeIndex.get(m.d);
        const i2 = nodeIndex.get(m.s);
        if (i1 !== undefined) A.add(i1, i1, g);
        if (i2 !== undefined) A.add(i2, i2, g);
        if (i1 !== undefined && i2 !== undefined) {
          A.add(i1, i2, -g);
          A.add(i2, i1, -g);
        }
      }

      // BJT effective resistances
      for (const q of bjts) {
        const vbe = getV(q.b) - getV(q.e);
        const isOn = vbe > 0.65;
        const rce = isOn ? 10.0 : 1e8;
        const rbe = isOn ? 1000.0 : 1e8;
        const iC = nodeIndex.get(q.c);
        const iB = nodeIndex.get(q.b);
        const iE = nodeIndex.get(q.e);

        if (iC !== undefined) A.add(iC, iC, 1 / rce);
        if (iE !== undefined) A.add(iE, iE, 1 / rce);
        if (iC !== undefined && iE !== undefined) {
          A.add(iC, iE, -1 / rce);
          A.add(iE, iC, -1 / rce);
        }

        if (iB !== undefined) A.add(iB, iB, 1 / rbe);
        if (iE !== undefined) A.add(iE, iE, 1 / rbe);
        if (iB !== undefined && iE !== undefined) {
          A.add(iB, iE, -1 / rbe);
          A.add(iE, iB, -1 / rbe);
        }
      }

      // Current sources
      for (const isrc of iSources) {
        const iPos = nodeIndex.get(isrc.pos);
        const iNeg = nodeIndex.get(isrc.neg);
        if (iPos !== undefined) z[iPos] = (z[iPos] ?? 0) - isrc.dc;
        if (iNeg !== undefined) z[iNeg] = (z[iNeg] ?? 0) + isrc.dc;
      }

      // Voltage sources: independent V
      let vIdx = 0;
      for (const v of vSources) {
        const srcRow = numNodes + vIdx;
        const iPos = nodeIndex.get(v.pos);
        const iNeg = nodeIndex.get(v.neg);
        if (iPos !== undefined) {
          A.add(iPos, srcRow, 1);
          A.add(srcRow, iPos, 1);
        }
        if (iNeg !== undefined) {
          A.add(iNeg, srcRow, -1);
          A.add(srcRow, iNeg, -1);
        }
        z[srcRow] = v.dc;
        vIdx++;
      }

      // Voltage sources: behavioral B
      for (const b of bSources) {
        const srcRow = numNodes + vIdx;
        const iPos = nodeIndex.get(b.pos);
        const iNeg = nodeIndex.get(b.neg);
        if (iPos !== undefined) {
          A.add(iPos, srcRow, 1);
          A.add(srcRow, iPos, 1);
        }
        if (iNeg !== undefined) {
          A.add(iNeg, srcRow, -1);
          A.add(srcRow, iNeg, -1);
        }
        z[srcRow] = this.evalBExpr(b.expr, getV);
        vIdx++;
      }

      // Voltage sources: VCVS E
      for (const e of eSources) {
        const srcRow = numNodes + vIdx;
        const iPos = nodeIndex.get(e.pos);
        const iNeg = nodeIndex.get(e.neg);
        if (iPos !== undefined) {
          A.add(iPos, srcRow, 1);
          A.add(srcRow, iPos, 1);
        }
        if (iNeg !== undefined) {
          A.add(iNeg, srcRow, -1);
          A.add(srcRow, iNeg, -1);
        }
        const vDiff = getV(e.ctrlPos) - getV(e.ctrlNeg);
        z[srcRow] = Math.max(-1000, Math.min(1000, e.gain * vDiff));
        vIdx++;
      }

      lastX = this.gaussianElimination(A, z);

      // Update node voltages for next iteration
      const nextVoltages = new Map<string, number>();
      nodeList.forEach((n, idx) => {
        nextVoltages.set(n, lastX[idx] ?? 0);
      });
      nodeVoltages = nextVoltages;
    }

    const lines: string[] = [
      "Title: SpiceBench Netlist",
      "Plotname: Operating Point",
      "Flags: real",
      `No. Variables: ${totalSize + 1}`,
      "No. Points: 1",
      "Variables:",
      "0\t0\tvoltage",
    ];

    nodeList.forEach((n, idx) => {
      lines.push(`${idx + 1}\tv(${n})\tvoltage`);
    });
    allVSources.forEach((v, idx) => {
      lines.push(`${numNodes + 1 + idx}\ti(${v.name})\tcurrent`);
    });

    lines.push("Values:");
    lines.push("0\t0.000000000000000e+00");
    for (let i = 0; i < totalSize; i++) {
      lines.push(`\t${(lastX[i] ?? 0).toExponential(15)}`);
    }

    return lines.join("\n");
  }

  private solveTran(
    numNodes: number,
    nodeList: string[],
    nodeIndex: Map<string, number>,
    resistors: Resistor[],
    capacitors: Capacitor[],
    inductors: Inductor[],
    vSources: VSource[],
    iSources: ISource[],
    bSources: BSource[],
    eSources: ESource[],
    diodes: Diode[],
    mosfets: Mosfet[],
    bjts: Bjt[],
    params: { tstep: number; tstop: number; uic: boolean },
  ): string {
    const dt = params.tstep;
    const steps = Math.min(2000, Math.max(10, Math.ceil(params.tstop / dt)));
    const timePoints: number[] = [];
    const results: number[][] = [];

    interface ActiveVSrc {
      name: string;
      pos: string;
      neg: string;
    }
    const allVSources: ActiveVSrc[] = [
      ...vSources.map((v) => ({ name: v.name, pos: v.pos, neg: v.neg })),
      ...bSources.map((b) => ({ name: b.name, pos: b.pos, neg: b.neg })),
      ...eSources.map((e) => ({ name: e.name, pos: e.pos, neg: e.neg })),
    ];
    const totalSize = numNodes + allVSources.length;

    const prevCapVoltages = new Float64Array(capacitors.length);
    const prevIndCurrents = new Float64Array(inductors.length);

    timePoints.push(0);

    let x0: Float64Array<ArrayBufferLike> = new Float64Array(totalSize);

    if (params.uic) {
      // With UIC: capacitors act as fixed voltage sources of value c.ic ?? 0
      const initSize = totalSize + capacitors.length;
      const A0 = new FloatMatrix(initSize);
      const z0 = new Float64Array(initSize);

      for (let i = 0; i < numNodes; i++) A0.add(i, i, 1e-12);

      for (const r of resistors) {
        const g = 1 / r.r;
        const i1 = nodeIndex.get(r.n1);
        const i2 = nodeIndex.get(r.n2);
        if (i1 !== undefined) A0.add(i1, i1, g);
        if (i2 !== undefined) A0.add(i2, i2, g);
        if (i1 !== undefined && i2 !== undefined) {
          A0.add(i1, i2, -g);
          A0.add(i2, i1, -g);
        }
      }

      capacitors.forEach((c, cIdx) => {
        const capRow = totalSize + cIdx;
        const i1 = nodeIndex.get(c.n1);
        const i2 = nodeIndex.get(c.n2);
        if (i1 !== undefined) {
          A0.add(i1, capRow, 1);
          A0.add(capRow, i1, 1);
        }
        if (i2 !== undefined) {
          A0.add(i2, capRow, -1);
          A0.add(capRow, i2, -1);
        }
        z0[capRow] = c.ic ?? 0;
      });

      inductors.forEach((l, lIdx) => {
        const i0 = l.ic ?? 0;
        prevIndCurrents[lIdx] = i0;
        const i1 = nodeIndex.get(l.n1);
        const i2 = nodeIndex.get(l.n2);
        if (i1 !== undefined) z0[i1] = (z0[i1] ?? 0) - i0;
        if (i2 !== undefined) z0[i2] = (z0[i2] ?? 0) + i0;
      });

      const fullX0 = this.gaussianElimination(A0, z0);
      x0 = fullX0.slice(0, totalSize);
    } else {
      // Without UIC: DC operating point at t=0
      const initSize = totalSize + inductors.length;
      const A0 = new FloatMatrix(initSize);
      const z0 = new Float64Array(initSize);

      for (let i = 0; i < numNodes; i++) A0.add(i, i, 1e-12);

      for (const r of resistors) {
        const g = 1 / r.r;
        const i1 = nodeIndex.get(r.n1);
        const i2 = nodeIndex.get(r.n2);
        if (i1 !== undefined) A0.add(i1, i1, g);
        if (i2 !== undefined) A0.add(i2, i2, g);
        if (i1 !== undefined && i2 !== undefined) {
          A0.add(i1, i2, -g);
          A0.add(i2, i1, -g);
        }
      }

      let vIdx = 0;
      vSources.forEach((v) => {
        const srcRow = numNodes + vIdx;
        const iPos = nodeIndex.get(v.pos);
        const iNeg = nodeIndex.get(v.neg);
        if (iPos !== undefined) {
          A0.add(iPos, srcRow, 1);
          A0.add(srcRow, iPos, 1);
        }
        if (iNeg !== undefined) {
          A0.add(iNeg, srcRow, -1);
          A0.add(srcRow, iNeg, -1);
        }
        let vVal = v.dc;
        if (v.sin) vVal = 0;
        if (v.pulse) vVal = v.pulse.v1;
        z0[srcRow] = vVal;
        vIdx++;
      });

      inductors.forEach((_l, lIdx) => {
        const indRow = totalSize + lIdx;
        const i1 = nodeIndex.get(_l.n1);
        const i2 = nodeIndex.get(_l.n2);
        if (i1 !== undefined) {
          A0.add(i1, indRow, 1);
          A0.add(indRow, i1, 1);
        }
        if (i2 !== undefined) {
          A0.add(i2, indRow, -1);
          A0.add(indRow, i2, -1);
        }
        z0[indRow] = 0;
      });

      const fullX0 = this.gaussianElimination(A0, z0);
      x0 = fullX0.slice(0, totalSize);
      inductors.forEach((_l, lIdx) => {
        prevIndCurrents[lIdx] = fullX0[totalSize + lIdx] ?? 0;
      });
    }

    results.push(Array.from(x0));
    capacitors.forEach((c, cIdx) => {
      const v1 = nodeIndex.get(c.n1) !== undefined ? (x0[nodeIndex.get(c.n1)!] ?? 0) : 0;
      const v2 = nodeIndex.get(c.n2) !== undefined ? (x0[nodeIndex.get(c.n2)!] ?? 0) : 0;
      prevCapVoltages[cIdx] = v1 - v2;
    });

    let currentX: Float64Array<ArrayBufferLike> = x0;

    for (let s = 1; s <= steps; s++) {
      const t = s * dt;
      timePoints.push(t);

      const getV = (node: string): number => {
        if (node === "0") return 0;
        const idx = nodeIndex.get(node);
        return idx !== undefined ? (currentX[idx] ?? 0) : 0;
      };

      const A = new FloatMatrix(totalSize);
      const z = new Float64Array(totalSize);

      for (let i = 0; i < numNodes; i++) A.add(i, i, 1e-12);

      for (const r of resistors) {
        const g = 1 / r.r;
        const i1 = nodeIndex.get(r.n1);
        const i2 = nodeIndex.get(r.n2);
        if (i1 !== undefined) A.add(i1, i1, g);
        if (i2 !== undefined) A.add(i2, i2, g);
        if (i1 !== undefined && i2 !== undefined) {
          A.add(i1, i2, -g);
          A.add(i2, i1, -g);
        }
      }

      // Diode effective resistance
      for (const d of diodes) {
        const vd = getV(d.a) - getV(d.k);
        const rEff = vd > 0.6 ? 1.0 : 1e8;
        const g = 1 / rEff;
        const i1 = nodeIndex.get(d.a);
        const i2 = nodeIndex.get(d.k);
        if (i1 !== undefined) A.add(i1, i1, g);
        if (i2 !== undefined) A.add(i2, i2, g);
        if (i1 !== undefined && i2 !== undefined) {
          A.add(i1, i2, -g);
          A.add(i2, i1, -g);
        }
      }

      // MOSFET effective resistance
      for (const m of mosfets) {
        const vgs = getV(m.g) - getV(m.s);
        const isPMOS = /pmos|bs250|9510/i.test(m.model);
        const isOn = isPMOS ? vgs < -2.0 : vgs > 2.0;
        const rEff = isOn ? 1.0 : 1e8;
        const g = 1 / rEff;
        const i1 = nodeIndex.get(m.d);
        const i2 = nodeIndex.get(m.s);
        if (i1 !== undefined) A.add(i1, i1, g);
        if (i2 !== undefined) A.add(i2, i2, g);
        if (i1 !== undefined && i2 !== undefined) {
          A.add(i1, i2, -g);
          A.add(i2, i1, -g);
        }
      }

      // BJT effective resistance
      for (const q of bjts) {
        const vbe = getV(q.b) - getV(q.e);
        const isOn = vbe > 0.65;
        const rce = isOn ? 10.0 : 1e8;
        const rbe = isOn ? 1000.0 : 1e8;
        const iC = nodeIndex.get(q.c);
        const iB = nodeIndex.get(q.b);
        const iE = nodeIndex.get(q.e);
        if (iC !== undefined) A.add(iC, iC, 1 / rce);
        if (iE !== undefined) A.add(iE, iE, 1 / rce);
        if (iC !== undefined && iE !== undefined) {
          A.add(iC, iE, -1 / rce);
          A.add(iE, iC, -1 / rce);
        }
        if (iB !== undefined) A.add(iB, iB, 1 / rbe);
        if (iE !== undefined) A.add(iE, iE, 1 / rbe);
        if (iB !== undefined && iE !== undefined) {
          A.add(iB, iE, -1 / rbe);
          A.add(iE, iB, -1 / rbe);
        }
      }

      // Capacitors companion model
      capacitors.forEach((c, cIdx) => {
        const geq = c.c / dt;
        const i1 = nodeIndex.get(c.n1);
        const i2 = nodeIndex.get(c.n2);
        if (i1 !== undefined) A.add(i1, i1, geq);
        if (i2 !== undefined) A.add(i2, i2, geq);
        if (i1 !== undefined && i2 !== undefined) {
          A.add(i1, i2, -geq);
          A.add(i2, i1, -geq);
        }
        const vPrev = prevCapVoltages[cIdx] ?? 0;
        const ieq = geq * vPrev;
        if (i1 !== undefined) z[i1] = (z[i1] ?? 0) + ieq;
        if (i2 !== undefined) z[i2] = (z[i2] ?? 0) - ieq;
      });

      // Inductors companion model
      inductors.forEach((l, lIdx) => {
        const geq = dt / l.l;
        const i1 = nodeIndex.get(l.n1);
        const i2 = nodeIndex.get(l.n2);
        if (i1 !== undefined) A.add(i1, i1, geq);
        if (i2 !== undefined) A.add(i2, i2, geq);
        if (i1 !== undefined && i2 !== undefined) {
          A.add(i1, i2, -geq);
          A.add(i2, i1, -geq);
        }
        const iPrev = prevIndCurrents[lIdx] ?? 0;
        if (i1 !== undefined) z[i1] = (z[i1] ?? 0) - iPrev;
        if (i2 !== undefined) z[i2] = (z[i2] ?? 0) + iPrev;
      });

      // Current sources
      for (const isrc of iSources) {
        const iPos = nodeIndex.get(isrc.pos);
        const iNeg = nodeIndex.get(isrc.neg);
        if (iPos !== undefined) z[iPos] = (z[iPos] ?? 0) - isrc.dc;
        if (iNeg !== undefined) z[iNeg] = (z[iNeg] ?? 0) + isrc.dc;
      }

      let vIdx = 0;
      // Independent V sources
      vSources.forEach((v) => {
        const srcRow = numNodes + vIdx;
        const iPos = nodeIndex.get(v.pos);
        const iNeg = nodeIndex.get(v.neg);
        if (iPos !== undefined) {
          A.add(iPos, srcRow, 1);
          A.add(srcRow, iPos, 1);
        }
        if (iNeg !== undefined) {
          A.add(iNeg, srcRow, -1);
          A.add(srcRow, iNeg, -1);
        }

        let vVal = v.dc;
        if (v.sin) {
          vVal = v.sin.ampl * Math.sin(2 * Math.PI * v.sin.freq * t);
        } else if (v.pulse) {
          const p = v.pulse;
          if (t < p.td) {
            vVal = p.v1;
          } else {
            const tRel = (t - p.td) % p.per;
            if (tRel < p.tr) {
              vVal = p.v1 + ((p.v2 - p.v1) * tRel) / p.tr;
            } else if (tRel < p.tr + p.pw) {
              vVal = p.v2;
            } else if (tRel < p.tr + p.pw + p.tf) {
              vVal = p.v2 - ((p.v2 - p.v1) * (tRel - p.tr - p.pw)) / p.tf;
            } else {
              vVal = p.v1;
            }
          }
        }
        z[srcRow] = vVal;
        vIdx++;
      });

      // Behavioral B sources
      for (const b of bSources) {
        const srcRow = numNodes + vIdx;
        const iPos = nodeIndex.get(b.pos);
        const iNeg = nodeIndex.get(b.neg);
        if (iPos !== undefined) {
          A.add(iPos, srcRow, 1);
          A.add(srcRow, iPos, 1);
        }
        if (iNeg !== undefined) {
          A.add(iNeg, srcRow, -1);
          A.add(srcRow, iNeg, -1);
        }
        z[srcRow] = this.evalBExpr(b.expr, getV);
        vIdx++;
      }

      // VCVS E sources
      for (const e of eSources) {
        const srcRow = numNodes + vIdx;
        const iPos = nodeIndex.get(e.pos);
        const iNeg = nodeIndex.get(e.neg);
        if (iPos !== undefined) {
          A.add(iPos, srcRow, 1);
          A.add(srcRow, iPos, 1);
        }
        if (iNeg !== undefined) {
          A.add(iNeg, srcRow, -1);
          A.add(srcRow, iNeg, -1);
        }
        const vDiff = getV(e.ctrlPos) - getV(e.ctrlNeg);
        z[srcRow] = Math.max(-1000, Math.min(1000, e.gain * vDiff));
        vIdx++;
      }

      const x = this.gaussianElimination(A, z);
      currentX = x;
      results.push(Array.from(x));

      capacitors.forEach((c, cIdx) => {
        const v1 = nodeIndex.get(c.n1) !== undefined ? (x[nodeIndex.get(c.n1)!] ?? 0) : 0;
        const v2 = nodeIndex.get(c.n2) !== undefined ? (x[nodeIndex.get(c.n2)!] ?? 0) : 0;
        prevCapVoltages[cIdx] = v1 - v2;
      });

      inductors.forEach((l, lIdx) => {
        const v1 = nodeIndex.get(l.n1) !== undefined ? (x[nodeIndex.get(l.n1)!] ?? 0) : 0;
        const v2 = nodeIndex.get(l.n2) !== undefined ? (x[nodeIndex.get(l.n2)!] ?? 0) : 0;
        const geq = dt / l.l;
        prevIndCurrents[lIdx] = (prevIndCurrents[lIdx] ?? 0) + geq * (v1 - v2);
      });
    }

    const lines: string[] = [
      "Title: SpiceBench Netlist",
      "Plotname: Transient Analysis",
      "Flags: real",
      `No. Variables: ${totalSize + 1}`,
      `No. Points: ${timePoints.length}`,
      "Variables:",
      "0\ttime\ttime",
    ];

    nodeList.forEach((n, idx) => {
      lines.push(`${idx + 1}\tv(${n})\tvoltage`);
    });
    allVSources.forEach((v, idx) => {
      lines.push(`${numNodes + 1 + idx}\ti(${v.name})\tcurrent`);
    });

    lines.push("Values:");
    for (let pIdx = 0; pIdx < timePoints.length; pIdx++) {
      const t = timePoints[pIdx]!;
      const row = results[pIdx]!;
      lines.push(`${pIdx}\t${t.toExponential(15)}`);
      for (let i = 0; i < totalSize; i++) {
        lines.push(`\t${(row[i] ?? 0).toExponential(15)}`);
      }
    }

    return lines.join("\n");
  }

  private solveAc(
    numNodes: number,
    nodeList: string[],
    nodeIndex: Map<string, number>,
    resistors: Resistor[],
    capacitors: Capacitor[],
    inductors: Inductor[],
    vSources: VSource[],
    params: { scale?: string; points: number; fstart: number; fstop: number },
  ): string {
    const numSources = vSources.length;
    const totalSize = numNodes + numSources;
    const fPoints: number[] = [];

    const logStart = Math.log10(params.fstart);
    const logStop = Math.log10(params.fstop);
    let numSteps: number;
    if (params.scale === "dec") {
      const decades = Math.max(0.1, logStop - logStart);
      numSteps = Math.max(2, Math.round(decades * params.points) + 1);
    } else {
      numSteps = Math.max(2, params.points);
    }

    for (let i = 0; i < numSteps; i++) {
      const exponent = logStart + (i / (numSteps - 1)) * (logStop - logStart);
      fPoints.push(Math.pow(10, exponent));
    }

    const lines: string[] = [
      "Title: SpiceBench Netlist",
      "Plotname: AC Analysis",
      "Flags: complex",
      `No. Variables: ${totalSize + 1}`,
      `No. Points: ${fPoints.length}`,
      "Variables:",
      "0\tfrequency\tfrequency",
    ];

    nodeList.forEach((n, idx) => {
      lines.push(`${idx + 1}\tv(${n})\tvoltage`);
    });
    vSources.forEach((v, idx) => {
      lines.push(`${numNodes + 1 + idx}\ti(${v.name})\tcurrent`);
    });

    lines.push("Values:");

    for (let pIdx = 0; pIdx < fPoints.length; pIdx++) {
      const f = fPoints[pIdx]!;
      const omega = 2 * Math.PI * f;

      const sysSize = totalSize * 2;
      const A = new FloatMatrix(sysSize);
      const z = new Float64Array(sysSize);

      const addG = (row: number, col: number, val: number) => {
        A.add(row, col, val);
        A.add(row + totalSize, col + totalSize, val);
      };
      const addB = (row: number, col: number, val: number) => {
        A.add(row, col + totalSize, -val);
        A.add(row + totalSize, col, val);
      };

      for (const r of resistors) {
        const g = 1 / r.r;
        const i1 = nodeIndex.get(r.n1);
        const i2 = nodeIndex.get(r.n2);
        if (i1 !== undefined) addG(i1, i1, g);
        if (i2 !== undefined) addG(i2, i2, g);
        if (i1 !== undefined && i2 !== undefined) {
          addG(i1, i2, -g);
          addG(i2, i1, -g);
        }
      }

      for (const c of capacitors) {
        const b = omega * c.c;
        const i1 = nodeIndex.get(c.n1);
        const i2 = nodeIndex.get(c.n2);
        if (i1 !== undefined) addB(i1, i1, b);
        if (i2 !== undefined) addB(i2, i2, b);
        if (i1 !== undefined && i2 !== undefined) {
          addB(i1, i2, -b);
          addB(i2, i1, -b);
        }
      }

      for (const l of inductors) {
        const b = -1 / (omega * l.l);
        const i1 = nodeIndex.get(l.n1);
        const i2 = nodeIndex.get(l.n2);
        if (i1 !== undefined) addB(i1, i1, b);
        if (i2 !== undefined) addB(i2, i2, b);
        if (i1 !== undefined && i2 !== undefined) {
          addB(i1, i2, -b);
          addB(i2, i1, -b);
        }
      }

      vSources.forEach((v, k) => {
        const srcRow = numNodes + k;
        const iPos = nodeIndex.get(v.pos);
        const iNeg = nodeIndex.get(v.neg);

        if (iPos !== undefined) {
          addG(iPos, srcRow, 1);
          addG(srcRow, iPos, 1);
        }
        if (iNeg !== undefined) {
          addG(iNeg, srcRow, -1);
          addG(srcRow, iNeg, -1);
        }

        z[srcRow] = v.ac ?? 1;
      });

      const x = this.gaussianElimination(A, z);

      lines.push(`${pIdx}\t${f.toExponential(15)},0.000000000000000e+00`);
      for (let i = 0; i < totalSize; i++) {
        const real = x[i] ?? 0;
        const imag = x[i + totalSize] ?? 0;
        lines.push(`\t${real.toExponential(15)},${imag.toExponential(15)}`);
      }
    }

    return lines.join("\n");
  }

  private gaussianElimination(A: FloatMatrix, b: Float64Array): Float64Array {
    const n = b.length;
    const x = new Float64Array(n);

    for (let p = 0; p < n; p++) {
      let maxRow = p;
      let maxVal = Math.abs(A.get(p, p));
      for (let i = p + 1; i < n; i++) {
        const val = Math.abs(A.get(i, p));
        if (val > maxVal) {
          maxVal = val;
          maxRow = i;
        }
      }

      if (maxVal < 1e-18) {
        continue;
      }

      if (maxRow !== p) {
        A.swapRows(p, maxRow);
        const tempB = b[p] ?? 0;
        b[p] = b[maxRow] ?? 0;
        b[maxRow] = tempB;
      }

      const pivot = A.get(p, p);
      for (let i = p + 1; i < n; i++) {
        const factor = A.get(i, p) / pivot;
        b[i] = (b[i] ?? 0) - factor * (b[p] ?? 0);
        for (let j = p; j < n; j++) {
          A.add(i, j, -factor * A.get(p, j));
        }
      }
    }

    for (let i = n - 1; i >= 0; i--) {
      let sum = b[i] ?? 0;
      for (let j = i + 1; j < n; j++) {
        sum -= A.get(i, j) * (x[j] ?? 0);
      }
      const diag = A.get(i, i);
      x[i] = Math.abs(diag) > 1e-18 ? sum / diag : 0;
    }

    return x;
  }

  private flattenSubcircuits(lines: string[]): string[] {
    const subckts = new Map<string, { params: string[]; body: string[] }>();
    let currentSub: { name: string; params: string[]; body: string[] } | null = null;
    const topLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("*")) {
        topLines.push(trimmed);
        continue;
      }
      const subMatch = trimmed.match(/^\.subckt\s+(\S+)\s+(.+)$/i);
      if (subMatch) {
        const name = subMatch[1]!.toLowerCase();
        const params = subMatch[2]!.trim().split(/\s+/).map((p) => p.toLowerCase());
        currentSub = { name, params, body: [] };
        continue;
      }
      if (/^\.ends(\s+.*)?$/i.test(trimmed)) {
        if (currentSub) {
          subckts.set(currentSub.name, currentSub);
          currentSub = null;
        }
        continue;
      }
      if (currentSub) {
        currentSub.body.push(trimmed);
      } else {
        topLines.push(trimmed);
      }
    }

    const expandLine = (l: string, prefix: string): string[] => {
      const trimmed = l.trim();
      if (!trimmed || trimmed.startsWith("*") || trimmed.startsWith(".")) {
        return [trimmed];
      }
      if (/^[xX]/i.test(trimmed)) {
        const tokens = trimmed.split(/\s+/);
        const instName = tokens[0]!.toLowerCase().replace(/^x_?/, "");
        const subName = tokens[tokens.length - 1]!.toLowerCase();
        const actualPins = tokens.slice(1, tokens.length - 1).map((p) => p.toLowerCase());

        const def = subckts.get(subName);
        if (!def) return [trimmed];

        const pinMap = new Map<string, string>();
        def.params.forEach((param, idx) => {
          if (idx < actualPins.length) {
            pinMap.set(param, actualPins[idx]!);
          }
        });

        const expanded: string[] = [];
        const nextPrefix = `${prefix}${instName}_`;
        for (const bLine of def.body) {
          const remapped = this.rewriteSubcircuitLine(bLine, nextPrefix, pinMap);
          expanded.push(...expandLine(remapped, nextPrefix));
        }
        return expanded;
      }
      return [trimmed];
    };

    const result: string[] = [];
    for (const line of topLines) {
      result.push(...expandLine(line, ""));
    }
    return result;
  }

  private rewriteSubcircuitLine(
    line: string,
    instPrefix: string,
    pinMap: Map<string, string>,
  ): string {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("*") || trimmed.startsWith(".")) {
      return trimmed;
    }
    const remapNode = (node: string): string => {
      const lower = node.toLowerCase();
      if (lower === "0" || lower === "gnd") return "0";
      return pinMap.get(lower) ?? `${instPrefix}${lower}`;
    };

    // Behavioral source B...
    if (/^[bB]/i.test(trimmed)) {
      const vMatch = trimmed.match(/^([bB]\S+)\s+(\S+)\s+(\S+)\s+(V=.+)$/i);
      if (vMatch) {
        const origName = vMatch[1]!.toLowerCase();
        const name = `b_${instPrefix}${origName.slice(1)}`;
        const pos = remapNode(vMatch[2]!);
        const neg = remapNode(vMatch[3]!);
        let expr = vMatch[4]!;
        expr = expr.replace(/V\s*\(\s*([a-zA-Z0-9_#]+)\s*\)/gi, (_, n) => {
          return `V(${remapNode(n)})`;
        });
        return `${name} ${pos} ${neg} ${expr}`;
      }
    }

    const tokens = trimmed.split(/\s+/);
    const origName = tokens[0]!.toLowerCase();
    const typeChar = origName.charAt(0);
    const restName = origName.slice(1).replace(/^_/, "");
    const compName = `${typeChar}_${instPrefix}${restName}`;

    if (typeChar === "r" || typeChar === "c" || typeChar === "l" || typeChar === "d") {
      if (tokens.length >= 4) {
        const n1 = remapNode(tokens[1]!);
        const n2 = remapNode(tokens[2]!);
        return `${compName} ${n1} ${n2} ${tokens.slice(3).join(" ")}`;
      }
    } else if (typeChar === "v" || typeChar === "i") {
      if (tokens.length >= 3) {
        const pos = remapNode(tokens[1]!);
        const neg = remapNode(tokens[2]!);
        return `${compName} ${pos} ${neg} ${tokens.slice(3).join(" ")}`;
      }
    } else if (typeChar === "q") {
      if (tokens.length >= 5) {
        const c = remapNode(tokens[1]!);
        const b = remapNode(tokens[2]!);
        const e = remapNode(tokens[3]!);
        return `${compName} ${c} ${b} ${e} ${tokens.slice(4).join(" ")}`;
      }
    } else if (typeChar === "m") {
      if (tokens.length >= 6) {
        const d = remapNode(tokens[1]!);
        const g = remapNode(tokens[2]!);
        const s = remapNode(tokens[3]!);
        const b = remapNode(tokens[4]!);
        return `${compName} ${d} ${g} ${s} ${b} ${tokens.slice(5).join(" ")}`;
      }
    } else if (typeChar === "e") {
      if (tokens.length >= 6) {
        const pos = remapNode(tokens[1]!);
        const neg = remapNode(tokens[2]!);
        const cp = remapNode(tokens[3]!);
        const cn = remapNode(tokens[4]!);
        return `${compName} ${pos} ${neg} ${cp} ${cn} ${tokens.slice(5).join(" ")}`;
      }
    } else if (typeChar === "x") {
      const pins = tokens.slice(1, -1).map(remapNode);
      const subName = tokens[tokens.length - 1]!;
      return `${compName} ${pins.join(" ")} ${subName}`;
    }

    return trimmed;
  }

  private evalBExpr(expr: string, getV: (node: string) => number): number {
    let clean = expr.trim();
    if (clean.toLowerCase().startsWith("v=")) {
      clean = clean.substring(2).trim();
    }

    // Replace V(node)
    clean = clean.replace(/v\s*\(\s*([a-zA-Z0-9_#]+)\s*\)/gi, (_, node) => {
      const val = getV(node.toLowerCase());
      return ` ${val >= 0 ? val : `(0 - ${Math.abs(val)})`} `;
    });

    const tokens: string[] = [];
    let i = 0;
    while (i < clean.length) {
      const ch = clean[i]!;
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch === "&") {
        if (clean[i + 1] === "&") {
          tokens.push("&&");
          i += 2;
        } else {
          tokens.push("&&");
          i++;
        }
      } else if (ch === "|") {
        if (clean[i + 1] === "|") {
          tokens.push("||");
          i += 2;
        } else {
          tokens.push("||");
          i++;
        }
      } else if (ch === "^") {
        tokens.push("^");
        i++;
      } else if (ch === "=" && clean[i + 1] === "=") {
        tokens.push("==");
        i += 2;
      } else if (ch === "!" && clean[i + 1] === "=") {
        tokens.push("!=");
        i += 2;
      } else if (ch === "<" && clean[i + 1] === "=") {
        tokens.push("<=");
        i += 2;
      } else if (ch === ">" && clean[i + 1] === "=") {
        tokens.push(">=");
        i += 2;
      } else if (
        ch === "<" ||
        ch === ">" ||
        ch === "?" ||
        ch === ":" ||
        ch === "+" ||
        ch === "-" ||
        ch === "*" ||
        ch === "/" ||
        ch === "(" ||
        ch === ")" ||
        ch === ","
      ) {
        tokens.push(ch);
        i++;
      } else if (/[0-9.]/.test(ch)) {
        let numStr = "";
        while (i < clean.length && /[0-9.eE+-]/.test(clean[i]!)) {
          if ((clean[i] === "+" || clean[i] === "-") && !/[eE]/.test(clean[i - 1] ?? "")) {
            break;
          }
          numStr += clean[i];
          i++;
        }
        tokens.push(numStr);
      } else if (/[a-zA-Z_]/.test(ch)) {
        let ident = "";
        while (i < clean.length && /[a-zA-Z0-9_]/.test(clean[i]!)) {
          ident += clean[i];
          i++;
        }
        tokens.push(ident.toLowerCase());
      } else {
        i++;
      }
    }

    let pos = 0;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    function parseExpression(): number {
      return parseTernary();
    }

    function parseTernary(): number {
      const val = parseLogicalOr();
      if (peek() === "?") {
        consume();
        const trueVal = parseExpression();
        if (peek() === ":") {
          consume();
          const falseVal = parseExpression();
          return val > 0.5 ? trueVal : falseVal;
        }
        return trueVal;
      }
      return val;
    }

    function parseLogicalOr(): number {
      let val = parseLogicalAnd();
      while (peek() === "||") {
        consume();
        const right = parseLogicalAnd();
        val = val > 0.5 || right > 0.5 ? 1 : 0;
      }
      return val;
    }

    function parseLogicalAnd(): number {
      let val = parseXor();
      while (peek() === "&&") {
        consume();
        const right = parseXor();
        val = val > 0.5 && right > 0.5 ? 1 : 0;
      }
      return val;
    }

    function parseXor(): number {
      let val = parseComparison();
      while (peek() === "^") {
        consume();
        const right = parseComparison();
        val = val > 0.5 !== (right > 0.5) ? 1 : 0;
      }
      return val;
    }

    function parseComparison(): number {
      let val = parseAdditive();
      while (["<", "<=", ">", ">=", "==", "!="].includes(peek() ?? "")) {
        const op = consume();
        const right = parseAdditive();
        switch (op) {
          case "<":
            val = val < right ? 1 : 0;
            break;
          case "<=":
            val = val <= right ? 1 : 0;
            break;
          case ">":
            val = val > right ? 1 : 0;
            break;
          case ">=":
            val = val >= right ? 1 : 0;
            break;
          case "==":
            val = Math.abs(val - right) < 1e-9 ? 1 : 0;
            break;
          case "!=":
            val = Math.abs(val - right) >= 1e-9 ? 1 : 0;
            break;
        }
      }
      return val;
    }

    function parseAdditive(): number {
      let val = parseMultiplicative();
      while (peek() === "+" || peek() === "-") {
        const op = consume();
        const right = parseMultiplicative();
        val = op === "+" ? val + right : val - right;
      }
      return val;
    }

    function parseMultiplicative(): number {
      let val = parseUnary();
      while (peek() === "*" || peek() === "/") {
        const op = consume();
        const right = parseUnary();
        val = op === "*" ? val * right : val / (right === 0 ? 1e-12 : right);
      }
      return val;
    }

    function parseUnary(): number {
      if (peek() === "+") {
        consume();
        return parseUnary();
      }
      if (peek() === "-") {
        consume();
        return -parseUnary();
      }
      if (peek() === "!") {
        consume();
        return parseUnary() > 0.5 ? 0 : 1;
      }
      return parsePrimary();
    }

    function parsePrimary(): number {
      const t = consume();
      if (!t) return 0;
      if (t === "(") {
        const val = parseExpression();
        if (peek() === ")") consume();
        return val;
      }
      if (t === "min") {
        if (peek() === "(") consume();
        const a = parseExpression();
        if (peek() === ",") consume();
        const b = parseExpression();
        if (peek() === ")") consume();
        return Math.min(a, b);
      }
      if (t === "max") {
        if (peek() === "(") consume();
        const a = parseExpression();
        if (peek() === ",") consume();
        const b = parseExpression();
        if (peek() === ")") consume();
        return Math.max(a, b);
      }
      const num = parseFloat(t);
      return isNaN(num) ? 0 : num;
    }

    try {
      return parseExpression();
    } catch {
      return 0;
    }
  }
}

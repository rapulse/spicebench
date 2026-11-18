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
    const lines = netlist.split(/\r?\n/).map((l) => l.trim());

    let mode: "op" | "tran" | "ac" = "op";
    const tranParams = { tstep: 1e-5, tstop: 1e-2, uic: false };
    const acParams = { points: 20, fstart: 10, fstop: 1e5 };

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
    }

    const resistors: Resistor[] = [];
    const capacitors: Capacitor[] = [];
    const inductors: Inductor[] = [];
    const vSources: VSource[] = [];

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

        if (line.includes("DC")) {
          const dcIdx = parts.indexOf("DC");
          if (dcIdx !== -1 && parts[dcIdx + 1]) {
            dcVal = parseEngineeringValue(parts[dcIdx + 1]!).value;
          }
        } else if (!sinMatch && parts[3]) {
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

        vSources.push({
          name,
          pos,
          neg,
          dc: dcVal,
          ac: acVal,
          sin: sinConfig,
        });
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

    const nodeList = Array.from(nodeSet).sort();
    const nodeIndex = new Map<string, number>();
    nodeList.forEach((n, idx) => nodeIndex.set(n, idx));

    const numNodes = nodeList.length;
    const numSources = vSources.length;
    const totalSize = numNodes + numSources;

    if (mode === "op") {
      return this.solveOp(numNodes, totalSize, nodeList, nodeIndex, resistors, vSources);
    } else if (mode === "tran") {
      return this.solveTran(
        numNodes,
        totalSize,
        nodeList,
        nodeIndex,
        resistors,
        capacitors,
        inductors,
        vSources,
        tranParams,
      );
    } else {
      return this.solveAc(
        numNodes,
        numSources,
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
    totalSize: number,
    nodeList: string[],
    nodeIndex: Map<string, number>,
    resistors: Array<{ name: string; n1: string; n2: string; r: number }>,
    vSources: Array<{ name: string; pos: string; neg: string; dc: number }>,
  ): string {
    const A = new FloatMatrix(totalSize);
    const z = new Float64Array(totalSize);

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

    vSources.forEach((v, k) => {
      const srcRow = numNodes + k;
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
    });

    const x = this.gaussianElimination(A, z);

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
    vSources.forEach((v, idx) => {
      lines.push(`${numNodes + 1 + idx}\ti(${v.name})\tcurrent`);
    });

    lines.push("Values:");
    lines.push("0\t0.000000000000000e+00");
    for (let i = 0; i < totalSize; i++) {
      lines.push(`\t${(x[i] ?? 0).toExponential(15)}`);
    }

    return lines.join("\n");
  }

  private solveTran(
    numNodes: number,
    totalSize: number,
    nodeList: string[],
    nodeIndex: Map<string, number>,
    resistors: Array<{ name: string; n1: string; n2: string; r: number }>,
    capacitors: Array<{ name: string; n1: string; n2: string; c: number; ic?: number }>,
    inductors: Array<{ name: string; n1: string; n2: string; l: number; ic?: number }>,
    vSources: Array<{
      name: string;
      pos: string;
      neg: string;
      dc: number;
      sin?: { ampl: number; freq: number };
    }>,
    params: { tstep: number; tstop: number; uic: boolean },
  ): string {
    const dt = params.tstep;
    const steps = Math.min(2000, Math.max(10, Math.ceil(params.tstop / dt)));
    const timePoints: number[] = [];
    const results: number[][] = [];

    const prevCapVoltages = new Float64Array(capacitors.length);
    const prevIndCurrents = new Float64Array(inductors.length);

    // Initial point (t = 0)
    timePoints.push(0);

    let x0: Float64Array;
    if (params.uic) {
      // With UIC: capacitors act as voltage sources of value c.ic ?? 0
      const initSize = totalSize + capacitors.length;
      const A0 = new FloatMatrix(initSize);
      const z0 = new Float64Array(initSize);

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

      vSources.forEach((v, k) => {
        const srcRow = numNodes + k;
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
        if (v.sin) vVal = 0; // sin(0) = 0
        z0[srcRow] = vVal;
      });

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
      // Without UIC: DC operating point (capacitors open, inductors short)
      const initSize = totalSize + inductors.length;
      const A0 = new FloatMatrix(initSize);
      const z0 = new Float64Array(initSize);

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

      vSources.forEach((v, k) => {
        const srcRow = numNodes + k;
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
        z0[srcRow] = vVal;
      });

      inductors.forEach((l, lIdx) => {
        const indRow = totalSize + lIdx;
        const i1 = nodeIndex.get(l.n1);
        const i2 = nodeIndex.get(l.n2);
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

    for (let s = 1; s <= steps; s++) {
      const t = s * dt;
      timePoints.push(t);

      const A = new FloatMatrix(totalSize);
      const z = new Float64Array(totalSize);

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

      vSources.forEach((v, k) => {
        const srcRow = numNodes + k;
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
        }
        z[srcRow] = vVal;
      });

      const x = this.gaussianElimination(A, z);
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
        const iPrev = prevIndCurrents[lIdx] ?? 0;
        prevIndCurrents[lIdx] = geq * (v1 - v2) + iPrev;
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
    vSources.forEach((v, idx) => {
      lines.push(`${numNodes + 1 + idx}\ti(${v.name})\tcurrent`);
    });

    lines.push("Values:");
    for (let s = 0; s < timePoints.length; s++) {
      const t = timePoints[s]!;
      const row = results[s]!;
      lines.push(`${s}\t${t.toExponential(15)}`);
      for (let i = 0; i < totalSize; i++) {
        lines.push(`\t${(row[i] ?? 0).toExponential(15)}`);
      }
    }

    return lines.join("\n");
  }

  private solveAc(
    numNodes: number,
    numSources: number,
    nodeList: string[],
    nodeIndex: Map<string, number>,
    resistors: Array<{ name: string; n1: string; n2: string; r: number }>,
    capacitors: Array<{ name: string; n1: string; n2: string; c: number }>,
    inductors: Array<{ name: string; n1: string; n2: string; l: number }>,
    vSources: Array<{ name: string; pos: string; neg: string; ac?: number }>,
    params: { points: number; fstart: number; fstop: number },
  ): string {
    const totalSize = numNodes + numSources;
    const fPoints: number[] = [];
    const decSteps = Math.max(5, params.points);
    const startLog = Math.log10(params.fstart);
    const stopLog = Math.log10(params.fstop);
    const numDecades = stopLog - startLog;
    const totalSteps = Math.ceil(numDecades * decSteps);

    for (let step = 0; step <= totalSteps; step++) {
      const logF = startLog + (step / totalSteps) * (stopLog - startLog);
      fPoints.push(Math.pow(10, logF));
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
}

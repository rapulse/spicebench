import {
  SimulationData,
  OpResult,
  TranResult,
  AcResult,
  DcResult,
} from "./types";

interface RawVariable {
  index: number;
  name: string;
  type: string;
}

export class SpiceRawParser {
  /**
   * Parses standard SPICE ASCII Rawfile text into structured SimulationData.
   */
  public static parse(rawText: string): SimulationData {
    const lines = rawText.split(/\r?\n/);
    let plotname = "";
    let isComplex = false;
    let numVars = 0;
    let numPoints = 0;

    const variables: RawVariable[] = [];
    let lineIdx = 0;

    // 1. Parse Headers
    while (lineIdx < lines.length) {
      const line = lines[lineIdx]!.trim();
      lineIdx++;

      if (line.startsWith("Plotname:")) {
        plotname = line.substring("Plotname:".length).trim().toLowerCase();
      } else if (line.startsWith("Flags:")) {
        const flags = line.substring("Flags:".length).trim().toLowerCase();
        if (flags.includes("complex")) {
          isComplex = true;
        }
      } else if (line.startsWith("No. Variables:")) {
        numVars = parseInt(line.substring("No. Variables:".length).trim(), 10);
      } else if (line.startsWith("No. Points:")) {
        numPoints = parseInt(line.substring("No. Points:".length).trim(), 10);
      } else if (line.startsWith("Variables:")) {
        // Read variable definitions
        while (lineIdx < lines.length) {
          const varLine = lines[lineIdx]!.trim();
          if (varLine.startsWith("Values:") || varLine === "") {
            break;
          }
          lineIdx++;
          const parts = varLine.split(/\s+/);
          if (parts.length >= 3) {
            const index = parseInt(parts[0]!, 10);
            const name = parts[1]!.toLowerCase();
            const type = parts[2]!.toLowerCase();
            variables.push({ index, name, type });
          }
        }
      } else if (line.startsWith("Values:")) {
        break;
      }
    }

    if (numVars === 0 && variables.length > 0) {
      numVars = variables.length;
    }

    // 2. Parse Values
    if (isComplex) {
      return SpiceRawParser.parseComplexData(lines, lineIdx, variables, numPoints);
    } else {
      return SpiceRawParser.parseRealData(lines, lineIdx, variables, numVars, plotname);
    }
  }

  private static parseRealData(
    lines: string[],
    startLineIdx: number,
    variables: RawVariable[],
    numVars: number,
    plotname: string,
  ): SimulationData {
    const varData: Record<string, number[]> = {};
    for (const v of variables) {
      varData[v.name] = [];
    }

    let lineIdx = startLineIdx;
    let pointIdx = 0;
    let currentVarIdx = 0;

    while (lineIdx < lines.length) {
      const line = lines[lineIdx]!.trim();
      lineIdx++;
      if (line === "") continue;

      const tokens = line.split(/\s+/);
      if (tokens.length === 0 || tokens[0] === "") continue;

      let valStr: string;

      // First token might be the point index (e.g. "0\t1.234")
      if (currentVarIdx === 0 && tokens.length >= 2 && !isNaN(Number(tokens[0]))) {
        pointIdx = parseInt(tokens[0]!, 10);
        valStr = tokens[1]!;
      } else {
        valStr = tokens[0]!;
      }

      const numVal = parseFloat(valStr);
      const varInfo = variables[currentVarIdx];
      if (varInfo) {
        varData[varInfo.name]!.push(numVal);
      }

      currentVarIdx++;
      if (currentVarIdx >= numVars) {
        currentVarIdx = 0;
        pointIdx++;
      }
    }

    // Determine simulation mode
    if (plotname.includes("transient") || varData["time"]) {
      const time = varData["time"] ?? [];
      const { time: _t, ...signals } = varData;
      const res: TranResult = {
        mode: "tran",
        time,
        variables: signals,
      };
      return res;
    } else if (plotname.includes("operating") || plotname.includes("op") || pointIdx <= 1) {
      const nodeVoltages: Record<string, number> = {};
      const branchCurrents: Record<string, number> = {};

      for (const [name, values] of Object.entries(varData)) {
        const val = values[0] ?? 0;
        const vMatch = name.match(/^v\((.+)\)$/);
        const iMatch = name.match(/^i\((.+)\)$/);

        if (vMatch && vMatch[1]) {
          nodeVoltages[vMatch[1]] = val;
        } else if (iMatch && iMatch[1]) {
          branchCurrents[iMatch[1]] = val;
        } else if (name.startsWith("v_") || name.startsWith("i_")) {
          branchCurrents[name] = val;
        } else {
          nodeVoltages[name] = val;
        }
      }

      const res: OpResult = {
        mode: "op",
        nodeVoltages,
        branchCurrents,
      };
      return res;
    } else {
      // DC sweep or generic
      const firstVar = variables[0]?.name ?? "sweep";
      const sweepVals = varData[firstVar] ?? [];
      const { [firstVar]: _s, ...rest } = varData;
      const res: DcResult = {
        mode: "dc",
        sweepSource: firstVar,
        sweepValues: sweepVals,
        variables: rest,
      };
      return res;
    }
  }

  private static parseComplexData(
    lines: string[],
    startLineIdx: number,
    variables: RawVariable[],
    _numPoints: number,
  ): AcResult {
    const numVars = variables.length;
    const frequencies: number[] = [];
    const complexData: Record<string, Array<{ real: number; imag: number }>> = {};
    const magnitudeDb: Record<string, number[]> = {};
    const phaseDeg: Record<string, number[]> = {};

    for (const v of variables) {
      if (v.name !== "frequency") {
        complexData[v.name] = [];
        magnitudeDb[v.name] = [];
        phaseDeg[v.name] = [];
      }
    }

    let lineIdx = startLineIdx;
    let currentVarIdx = 0;

    while (lineIdx < lines.length) {
      const line = lines[lineIdx]!.trim();
      lineIdx++;
      if (line === "") continue;

      const tokens = line.split(/\s+/);
      if (tokens.length === 0 || tokens[0] === "") continue;

      let pairStr: string;
      if (currentVarIdx === 0 && tokens.length >= 2 && !isNaN(Number(tokens[0]))) {
        pairStr = tokens[1]!;
      } else {
        pairStr = tokens[0]!;
      }

      // Complex number in rawfile is: "real,imag"
      const commaIdx = pairStr.indexOf(",");
      let real = 0;
      let imag = 0;
      if (commaIdx !== -1) {
        real = parseFloat(pairStr.substring(0, commaIdx));
        imag = parseFloat(pairStr.substring(commaIdx + 1));
      } else {
        real = parseFloat(pairStr);
      }

      const varInfo = variables[currentVarIdx];
      if (varInfo) {
        if (varInfo.name === "frequency") {
          frequencies.push(real);
        } else {
          complexData[varInfo.name]!.push({ real, imag });

          // Calculate magnitude in dB: 20 * log10(sqrt(real^2 + imag^2))
          const mag = Math.sqrt(real * real + imag * imag);
          const db = mag > 1e-12 ? 20 * Math.log10(mag) : -240;
          magnitudeDb[varInfo.name]!.push(db);

          // Calculate phase in degrees: atan2(imag, real) * 180 / PI
          const phase = (Math.atan2(imag, real) * 180) / Math.PI;
          phaseDeg[varInfo.name]!.push(phase);
        }
      }

      currentVarIdx++;
      if (currentVarIdx >= numVars) {
        currentVarIdx = 0;
      }
    }

    return {
      mode: "ac",
      frequency: frequencies,
      magnitudeDb,
      phaseDeg,
      complexValues: complexData,
    };
  }
}

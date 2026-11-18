import { OpResult, SimulationErrorDetails } from "./types";

export class SpiceStdoutParser {
  /**
   * Parses ngspice stdout text for Operating Point tables.
   */
  public static parseOpStdout(stdout: string): OpResult {
    const nodeVoltages: Record<string, number> = {};
    const branchCurrents: Record<string, number> = {};

    const lines = stdout.split(/\r?\n/);
    let inTable = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.includes("Node") && trimmed.includes("Voltage")) {
        inTable = true;
        continue;
      }

      if (inTable) {
        if (trimmed.startsWith("----") || trimmed === "") continue;
        if (trimmed.startsWith("******") || trimmed.startsWith("CPU time")) {
          inTable = false;
          continue;
        }

        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          const name = parts[0]!.toLowerCase();
          const val = parseFloat(parts[1]!);

          if (!isNaN(val)) {
            if (name.includes("#branch") || name.startsWith("i(") || name.startsWith("v_")) {
              const cleanName = name.replace("#branch", "").replace(/^i\(/, "").replace(/\)$/, "");
              branchCurrents[cleanName] = val;
            } else {
              const cleanNode = name.replace(/^v\(/, "").replace(/\)$/, "");
              nodeVoltages[cleanNode] = val;
            }
          }
        }
      }
    }

    return {
      mode: "op",
      nodeVoltages,
      branchCurrents,
    };
  }

  /**
   * Scans stdout and stderr for ngspice error indicators and extracts diagnostic details.
   */
  public static extractErrors(output: string): SimulationErrorDetails | undefined {
    const lines = output.split(/\r?\n/);
    const errorMessages: string[] = [];
    const problematicNodes = new Set<string>();
    const problematicComponents = new Set<string>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^Error:/i.test(trimmed) || /fatal error/i.test(trimmed)) {
        errorMessages.push(trimmed);

        // Check for node references: e.g. "nodes n001 and n002"
        const nodeMatches = trimmed.matchAll(/\b([nN]\d+|[nN]_[a-zA-Z0-9_]+)\b/g);
        for (const m of nodeMatches) {
          if (m[1]) problematicNodes.add(m[1].toLowerCase());
        }

        // Check for component references: e.g. "R_R1", "V_V1"
        const compMatches = trimmed.matchAll(/\b([rRcCvViIdDqQsS]_[a-zA-Z0-9_]+)\b/g);
        for (const m of compMatches) {
          if (m[1]) problematicComponents.add(m[1]);
        }
      }
    }

    if (errorMessages.length > 0) {
      return {
        code: "SPICE_ERROR",
        message: errorMessages.join("; "),
        rawOutput: output,
        problematicNodes: Array.from(problematicNodes),
        problematicComponents: Array.from(problematicComponents),
      };
    }

    return undefined;
  }
}

import {
  type EngineRunOutput,
  type SpiceEngine,
  SimulationError,
  extractProblematicElements,
} from "./engine-interface";
import { SpiceRawParser } from "../parser/spice-raw-parser";
import { SpiceStdoutParser } from "../parser/spice-stdout-parser";

interface RawSimulationOutput {
  rawFileText?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

/**
 * External ngspice CLI (`ngspice -b -r`). Optional developer/power-user engine:
 * the distributed app uses WasmNgspiceEngine (ADR-007).
 */
export class NativeNgspiceEngine implements SpiceEngine {
  public readonly name = "ngspice-native";

  constructor(private readonly customBinaryPath?: string) {}

  public async isAvailable(): Promise<boolean> {
    const binary = this.customBinaryPath || "ngspice";
    return new Promise((resolve) => {
      try {
        const proc = spawn(binary, ["-v"]);
        proc.on("error", () => resolve(false));
        proc.on("close", (code) => resolve(code === 0));
      } catch {
        resolve(false);
      }
    });
  }

  public async dispose(): Promise<void> {
    // Each run is a separate process; nothing to release.
  }

  public async run(netlist: string, timeoutMs: number): Promise<EngineRunOutput> {
    const out = await this.execute(netlist, timeoutMs);
    const log = `${out.stdout}\n${out.stderr}`;
    const detected = SpiceStdoutParser.extractErrors(log);
    if (out.exitCode !== 0 || (detected && !out.rawFileText)) {
      throw new SimulationError({
        code: "SPICE_ERROR",
        message: detected?.message || out.stderr.trim() || `ngspice exited with code ${out.exitCode}`,
        rawOutput: log,
        ...extractProblematicElements(log.split(/\r?\n/)),
      });
    }
    if (!out.rawFileText) {
      throw new SimulationError({ code: "ENGINE_ERROR", message: "ngspice produced no rawfile", rawOutput: log });
    }
    try {
      return { data: SpiceRawParser.parse(out.rawFileText), warnings: [], log };
    } catch (e) {
      throw new SimulationError({
        code: "PARSE_ERROR",
        message: `Failed to parse ngspice rawfile: ${e instanceof Error ? e.message : String(e)}`,
        rawOutput: log,
      });
    }
  }

  private async execute(netlist: string, timeoutMs: number): Promise<RawSimulationOutput> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "spicebench-"));
    const cirFile = path.join(tmpDir, "circuit.cir");
    const rawFile = path.join(tmpDir, "output.raw");

    try {
      await fs.writeFile(cirFile, netlist, "utf-8");

      const binary = this.customBinaryPath || "ngspice";
      const args = ["-b", "-r", rawFile, cirFile];

      const result = await new Promise<RawSimulationOutput>((resolve, reject) => {
        let stdout = "";
        let stderr = "";

        // ngspice writes binary rawfiles by default; SpiceRawParser expects ASCII.
        const proc = spawn(binary, args, { env: { ...process.env, SPICE_ASCIIRAWFILE: "1" } });

        const timer = setTimeout(() => {
          proc.kill("SIGKILL");
          reject(
            new SimulationError({
              code: "SIMULATION_TIMEOUT",
              message: `Simulation exceeded timeout of ${timeoutMs}ms. ngspice process killed.`,
            }),
          );
        }, timeoutMs);

        proc.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
        });
        proc.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });

        proc.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });

        proc.on("close", (code) => {
          clearTimeout(timer);
          resolve({
            stdout,
            stderr,
            exitCode: code ?? 0,
          });
        });
      });

      // Try reading rawfile if generated
      try {
        const rawContent = await fs.readFile(rawFile, "utf-8");
        result.rawFileText = rawContent;
      } catch {
        // Rawfile might not exist if simulation had fatal syntax error
      }

      return result;
    } finally {
      // Clean up temp directory
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup error
      }
    }
  }
}

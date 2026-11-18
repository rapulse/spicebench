import { SpiceEngine, RawSimulationOutput } from "./engine-interface";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

export class NativeNgspiceEngine implements SpiceEngine {
  public readonly name = "NativeNgspiceEngine";

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

  public async execute(netlist: string, timeoutMs: number): Promise<RawSimulationOutput> {
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

        const proc = spawn(binary, args);

        const timer = setTimeout(() => {
          proc.kill("SIGKILL");
          reject(new Error(`Simulation timed out after ${timeoutMs}ms`));
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

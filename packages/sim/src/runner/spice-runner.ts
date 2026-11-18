import { Worker } from "node:worker_threads";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { SimulationResult, SimulationErrorDetails } from "../parser/types";
import { SpiceRawParser } from "../parser/spice-raw-parser";
import { SpiceStdoutParser } from "../parser/spice-stdout-parser";
import { WorkerTaskMessage, WorkerResultMessage } from "./spice-worker";
import { BuiltinMnaEngine } from "./builtin-mna-engine";
import { NativeNgspiceEngine } from "./native-engine";

export interface SpiceRunnerConfig {
  timeoutMs?: number; // Default 5000ms as required by AGENTS.md rule 4
  preferNative?: boolean;
  customBinaryPath?: string;
  useWorkerThread?: boolean; // Defaults to true
}

export class SpiceRunner {
  public readonly timeoutMs: number;
  private worker?: Worker;
  private taskIdCounter = 1;

  constructor(private readonly config: SpiceRunnerConfig = {}) {
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  /**
   * Executes a SPICE netlist, parses the results, and returns structured SimulationResult.
   * Guarantees strict termination on timeout with automatic worker restart.
   */
  public async run(netlist: string, overrideTimeoutMs?: number): Promise<SimulationResult> {
    const timeout = overrideTimeoutMs ?? this.timeoutMs;
    const startTime = Date.now();

    const output = await (this.config.useWorkerThread !== false
      ? this.runInWorker(netlist, timeout)
      : this.runInline(netlist, timeout));

    const durationMs = Date.now() - startTime;

    // Check for errors in stdout/stderr or non-zero exit code
    const combinedLog = `${output.stdout}\n${output.stderr}`;
    const detectedError = SpiceStdoutParser.extractErrors(combinedLog);

    if (output.exitCode !== 0 || (detectedError && !output.rawFileText)) {
      const errMsg =
        detectedError?.message ||
        output.stderr.trim() ||
        output.stdout.trim() ||
        `Process exited with code ${output.exitCode}`;
      const prob = [
        ...(detectedError?.problematicComponents ?? []),
        ...(detectedError?.problematicNodes ?? []),
      ].filter(Boolean);
      throw new Error(
        `[SPICE_ERROR] ${errMsg}${prob.length > 0 ? `\nProblematic elements: ${prob.join(", ")}` : ""}`,
      );
    }

    // Parse simulation data
    if (output.rawFileText) {
      try {
        const data = SpiceRawParser.parse(output.rawFileText);
        return {
          mode: data.mode,
          success: true,
          data,
          rawOutput: output.rawFileText,
          durationMs,
        };
      } catch (parseErr) {
        throw new Error(
          `[PARSE_ERROR] Failed to parse SPICE rawfile: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        );
      }
    }

    // Fallback: parse operating point table from stdout
    if (output.stdout.includes("Node") && output.stdout.includes("Voltage")) {
      const opData = SpiceStdoutParser.parseOpStdout(output.stdout);
      return {
        mode: "op",
        success: true,
        data: opData,
        rawOutput: output.stdout,
        durationMs,
      };
    }

    throw new Error(`[ENGINE_ERROR] Simulation produced no parseable data.\nLog: ${combinedLog}`);
  }

  private async runInWorker(
    netlist: string,
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; rawFileText?: string; exitCode: number }> {
    const taskId = `task_${this.taskIdCounter++}`;

    return new Promise((resolve, reject) => {
      let isSettled = false;

      // Ensure worker exists
      if (!this.worker) {
        this.initWorker();
      }

      const timer = setTimeout(async () => {
        if (isSettled) return;
        isSettled = true;

        // Forcefully kill hung worker and recreate
        await this.terminateAndResetWorker();

        const err: SimulationErrorDetails = {
          code: "SIMULATION_TIMEOUT",
          message: `Simulation exceeded timeout of ${timeoutMs}ms. Worker terminated.`,
        };
        reject(new Error(`[${err.code}] ${err.message}`));
      }, timeoutMs);

      const messageHandler = (res: WorkerResultMessage) => {
        if (res.id !== taskId || isSettled) return;
        isSettled = true;
        clearTimeout(timer);
        this.worker?.off("message", messageHandler);

        if (res.success && res.output) {
          resolve(res.output);
        } else {
          reject(new Error(res.error || "Worker simulation failed"));
        }
      };

      this.worker!.on("message", messageHandler);

      const taskMsg: WorkerTaskMessage = {
        id: taskId,
        netlist,
        timeoutMs,
        preferNative: this.config.preferNative,
        customBinaryPath: this.config.customBinaryPath,
      };

      this.worker!.postMessage(taskMsg);
    });
  }

  private async runInline(
    netlist: string,
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; rawFileText?: string; exitCode: number }> {
    const engine = new BuiltinMnaEngine();
    if (this.config.preferNative) {
      const native = new NativeNgspiceEngine(this.config.customBinaryPath);
      if (await native.isAvailable()) {
        return native.execute(netlist, timeoutMs);
      }
    }
    return engine.execute(netlist, timeoutMs);
  }

  private initWorker(): void {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    // Determine worker file (supports both ts during dev and compiled js in dist)
    const workerTs = path.join(currentDir, "spice-worker.ts");
    const workerJs = path.join(currentDir, "spice-worker.js");

    const workerPath = workerJs; // Default path

    try {
      this.worker = new Worker(workerPath, {
        execArgv: process.execArgv,
      });
    } catch {
      // In TS test runner environment, fallback to ts worker or inline
      try {
        this.worker = new Worker(workerTs, {
          execArgv: ["--loader", "ts-node/esm", ...process.execArgv],
        });
      } catch {
        // Fallback to inline execution if worker cannot be spawned directly in ts environment
        this.config.useWorkerThread = false;
      }
    }

    if (this.worker) {
      this.worker.on("error", () => {
        this.terminateAndResetWorker();
      });
    }
  }

  public async terminateAndResetWorker(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {
        // Ignore termination error
      }
      this.worker = undefined;
    }
  }

  public async destroy(): Promise<void> {
    await this.terminateAndResetWorker();
  }
}

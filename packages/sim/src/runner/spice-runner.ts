import type { SimulationResult } from "../parser/types";
import { type SpiceEngine, SimulationError } from "./engine-interface";
import { WasmNgspiceEngine } from "./wasm-ngspice-engine";
import { NativeNgspiceEngine } from "./native-engine";

export interface SpiceRunnerConfig {
  /** Hard limit per run (AGENTS.md §4). Default 5000 ms. */
  timeoutMs?: number;
  /** "wasm" (default, bundled ngspice) or "native" (external `ngspice` CLI). */
  engine?: "wasm" | "native";
  /** Worker script for the WASM engine (Electron passes the bundled file). */
  workerPath?: string;
  /** Path to the ngspice binary for the native engine. */
  ngspiceBinaryPath?: string;
  /** Inject a custom engine (tests). Overrides `engine`. */
  customEngine?: SpiceEngine;
}

/**
 * Runs SPICE netlists through ngspice with a hard timeout.
 * Runs are serialized: one engine instance processes one netlist at a time.
 */
export class SpiceRunner {
  public readonly timeoutMs: number;
  private readonly engine: SpiceEngine;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(config: SpiceRunnerConfig = {}) {
    this.timeoutMs = config.timeoutMs ?? 5000;
    this.engine =
      config.customEngine ??
      (config.engine === "native"
        ? new NativeNgspiceEngine(config.ngspiceBinaryPath)
        : new WasmNgspiceEngine({ workerPath: config.workerPath }));
  }

  public get engineName(): string {
    return this.engine.name;
  }

  public run(netlist: string, overrideTimeoutMs?: number): Promise<SimulationResult> {
    const task = this.queue.then(() => this.runNow(netlist, overrideTimeoutMs ?? this.timeoutMs));
    this.queue = task.catch(() => undefined);
    return task;
  }

  private async runNow(netlist: string, timeoutMs: number): Promise<SimulationResult> {
    const started = Date.now();
    try {
      const out = await this.engine.run(netlist, timeoutMs);
      return {
        mode: out.data.mode,
        success: true,
        data: out.data,
        rawOutput: out.log,
        warnings: out.warnings,
        engine: this.engine.name,
        durationMs: Date.now() - started,
      };
    } catch (err) {
      if (err instanceof SimulationError) throw err;
      throw new SimulationError({
        code: "ENGINE_ERROR",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Pre-loads the engine (WASM init ≈0.3 s) so the first run is fast. */
  public async warmUp(): Promise<boolean> {
    return this.engine.isAvailable();
  }

  public async destroy(): Promise<void> {
    await this.engine.dispose();
  }
}

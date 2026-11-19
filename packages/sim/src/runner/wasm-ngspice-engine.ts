import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type EngineRunOutput,
  type SpiceEngine,
  SimulationError,
  extractProblematicElements,
} from "./engine-interface";
import type { NgspiceWorkerRequest, NgspiceWorkerResponse } from "./ngspice-protocol";
import { classifyNgspiceMessages, convertNgspiceResult } from "../parser/ngspice-result";

export interface WasmNgspiceEngineOptions {
  /**
   * Absolute path to the worker script. Electron Main passes the bundled
   * `dist-electron/ngspice-worker.js`; otherwise the sibling `ngspice-worker.{js,ts}` is used.
   */
  workerPath?: string;
  /** Time allowed for loading and initializing the WASM module (not counted in run timeout). */
  initTimeoutMs?: number;
}

type ResultMessage = Extract<NgspiceWorkerResponse, { type: "result" }>;

interface Pending {
  id: number;
  resolve: (msg: ResultMessage) => void;
  reject: (err: Error) => void;
}

/**
 * ngspice compiled to WebAssembly (eecircuit-engine), executed in a dedicated worker thread.
 * A run that exceeds the timeout terminates the worker; the next run spawns a fresh one.
 * See ADR-007.
 */
export class WasmNgspiceEngine implements SpiceEngine {
  public readonly name = "ngspice-wasm";

  private worker?: Worker;
  private ready?: Promise<void>;
  private pending?: Pending;
  private nextId = 1;

  constructor(private readonly options: WasmNgspiceEngineOptions = {}) {}

  public async isAvailable(): Promise<boolean> {
    try {
      await this.ensureWorker();
      return true;
    } catch {
      return false;
    }
  }

  public async run(netlist: string, timeoutMs: number): Promise<EngineRunOutput> {
    await this.ensureWorker();
    const worker = this.worker!;
    const id = this.nextId++;

    const msg = await new Promise<ResultMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = undefined;
        void this.reset();
        reject(
          new SimulationError({
            code: "SIMULATION_TIMEOUT",
            message: `Simulation exceeded timeout of ${timeoutMs}ms. Worker terminated.`,
          }),
        );
      }, timeoutMs);

      this.pending = {
        id,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      const req: NgspiceWorkerRequest = { id, netlist };
      worker.postMessage(req);
    });

    const log = msg.log.join("\n");
    if (!msg.ok) {
      throw new SimulationError({
        code: "ENGINE_ERROR",
        message: msg.message,
        rawOutput: log,
        ...extractProblematicElements(msg.errors),
      });
    }

    const hasData = msg.result.variableNames.length > 0 && msg.result.numPoints > 0;
    const { fatal, warnings } = classifyNgspiceMessages(msg.errors, hasData);
    if (fatal.length > 0) {
      throw new SimulationError({
        code: "SPICE_ERROR",
        message: fatal.join("; "),
        rawOutput: [...msg.errors, log].join("\n"),
        ...extractProblematicElements(msg.errors),
      });
    }

    return { data: convertNgspiceResult(msg.result), warnings, log };
  }

  public async dispose(): Promise<void> {
    await this.reset();
  }

  private ensureWorker(): Promise<void> {
    if (this.worker && this.ready) return this.ready;

    const worker = new Worker(this.resolveWorkerPath());
    this.worker = worker;
    const initTimeoutMs = this.options.initTimeoutMs ?? 20000;

    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        void this.reset();
        reject(
          new SimulationError({
            code: "ENGINE_ERROR",
            message: `ngspice WASM did not initialize within ${initTimeoutMs}ms`,
          }),
        );
      }, initTimeoutMs);

      worker.on("message", (m: NgspiceWorkerResponse) => {
        if (m.type === "ready") {
          clearTimeout(timer);
          resolve();
        } else if (m.type === "init-error") {
          clearTimeout(timer);
          void this.reset();
          reject(new SimulationError({ code: "ENGINE_ERROR", message: `ngspice init failed: ${m.message}` }));
        } else if (m.type === "result" && this.pending?.id === m.id) {
          const p = this.pending;
          this.pending = undefined;
          p.resolve(m);
        }
      });

      const fail = (reason: string): void => {
        clearTimeout(timer);
        const err = new SimulationError({ code: "ENGINE_ERROR", message: reason });
        if (this.worker === worker) {
          this.worker = undefined;
          this.ready = undefined;
        }
        const p = this.pending;
        this.pending = undefined;
        p?.reject(err);
        reject(err);
      };
      worker.on("error", (e) => fail(`ngspice worker crashed: ${e.message}`));
      worker.on("exit", (code) => fail(`ngspice worker exited with code ${code}`));
    });
    // Avoid unhandled rejection if nobody awaits a failed init.
    this.ready.catch(() => undefined);
    return this.ready;
  }

  private async reset(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    this.ready = undefined;
    if (worker) {
      worker.removeAllListeners("exit");
      worker.removeAllListeners("error");
      worker.on("error", () => undefined);
      await worker.terminate().catch(() => undefined);
    }
  }

  private resolveWorkerPath(): string {
    if (this.options.workerPath) return this.options.workerPath;
    const dir = path.dirname(fileURLToPath(import.meta.url));
    for (const name of ["ngspice-worker.js", "ngspice-worker.mjs", "ngspice-worker.ts"]) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    throw new SimulationError({
      code: "ENGINE_ERROR",
      message: `ngspice worker script not found next to ${dir}`,
    });
  }
}

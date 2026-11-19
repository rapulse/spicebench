/**
 * ngspice (WASM, eecircuit-engine) worker thread.
 *
 * Must stay self-contained: only `import type` for project modules, because this file
 * is executed directly by Node (type stripping) in tests and the headless MCP server,
 * and bundled as a separate entry for Electron Main. See ADR-007.
 *
 * Protocol:
 *   parent -> worker: { id, netlist }
 *   worker -> parent: { type: "ready" } | { type: "init-error", message }
 *                     | { type: "result", id, ok: true, result, errors, log }
 *                     | { type: "result", id, ok: false, message, errors, log }
 */
import { parentPort } from "node:worker_threads";
import type { NgspiceWorkerRequest, NgspiceWorkerResponse } from "./ngspice-protocol";

// ngspice prints to console. In stdio MCP mode any stray stdout output would corrupt
// JSON-RPC, so all console output of this thread is captured into a per-run log.
let logBuffer: string[] = [];
const capture = (...args: unknown[]): void => {
  logBuffer.push(args.map((a) => String(a)).join(" "));
  if (logBuffer.length > 2000) logBuffer = logBuffer.slice(-1000);
};
console.log = capture;
console.info = capture;
console.warn = capture;
console.error = capture;
console.debug = capture;

const port = parentPort;
if (!port) {
  throw new Error("ngspice-worker must be started as a worker thread");
}

const post = (msg: NgspiceWorkerResponse): void => port.postMessage(msg);

async function main(): Promise<void> {
  const { Simulation } = await import("eecircuit-engine");
  const sim = new Simulation();
  await sim.start();
  post({ type: "ready" });

  // Requests are serialized by the parent; one Simulation instance handles one run at a time.
  port!.on("message", async (req: NgspiceWorkerRequest) => {
    logBuffer = [];
    try {
      sim.setNetList(req.netlist);
      const result = await sim.runSim();
      post({ type: "result", id: req.id, ok: true, result, errors: sim.getError(), log: logBuffer });
    } catch (err) {
      post({
        type: "result",
        id: req.id,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        errors: safeErrors(sim),
        log: logBuffer,
      });
    }
  });
}

function safeErrors(sim: { getError: () => string[] }): string[] {
  try {
    return sim.getError();
  } catch {
    return [];
  }
}

main().catch((err: unknown) => {
  post({ type: "init-error", message: err instanceof Error ? err.message : String(err) });
});

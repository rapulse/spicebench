import { parentPort } from "node:worker_threads";
import { BuiltinMnaEngine } from "./builtin-mna-engine";
import { NativeNgspiceEngine } from "./native-engine";
import { RawSimulationOutput, SpiceEngine } from "./engine-interface";

export interface WorkerTaskMessage {
  id: string;
  netlist: string;
  timeoutMs: number;
  preferNative?: boolean;
  customBinaryPath?: string;
}

export interface WorkerResultMessage {
  id: string;
  success: boolean;
  output?: RawSimulationOutput;
  error?: string;
}

if (parentPort) {
  parentPort.on("message", async (msg: WorkerTaskMessage) => {
    try {
      let engine: SpiceEngine;

      if (msg.preferNative) {
        const native = new NativeNgspiceEngine(msg.customBinaryPath);
        if (await native.isAvailable()) {
          engine = native;
        } else {
          engine = new BuiltinMnaEngine();
        }
      } else {
        engine = new BuiltinMnaEngine();
      }

      const output = await engine.execute(msg.netlist, msg.timeoutMs);
      const res: WorkerResultMessage = {
        id: msg.id,
        success: output.exitCode === 0,
        output,
      };
      parentPort!.postMessage(res);
    } catch (err) {
      const res: WorkerResultMessage = {
        id: msg.id,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
      parentPort!.postMessage(res);
    }
  });
}

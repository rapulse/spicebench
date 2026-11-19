import type { ResultType } from "eecircuit-engine";

/** Message types exchanged between WasmNgspiceEngine and ngspice-worker. Types only. */
export interface NgspiceWorkerRequest {
  id: number;
  netlist: string;
}

export type NgspiceWorkerResponse =
  | { type: "ready" }
  | { type: "init-error"; message: string }
  | {
      type: "result";
      id: number;
      ok: true;
      result: ResultType;
      errors: string[];
      log: string[];
    }
  | {
      type: "result";
      id: number;
      ok: false;
      message: string;
      errors: string[];
      log: string[];
    };

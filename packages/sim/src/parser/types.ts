export type SimulationMode = "op" | "tran" | "ac" | "dc";

export interface OpResult {
  mode: "op";
  nodeVoltages: Record<string, number>; // node name -> voltage (V)
  branchCurrents: Record<string, number>; // source name -> current (A)
}

export interface TranResult {
  mode: "tran";
  time: number[]; // time vector (s)
  variables: Record<string, number[]>; // signal name -> array of values
}

export interface AcResult {
  mode: "ac";
  frequency: number[]; // frequency vector (Hz)
  magnitudeDb: Record<string, number[]>; // signal name -> magnitude (dB)
  phaseDeg: Record<string, number[]>; // signal name -> phase (degrees)
  complexValues: Record<string, Array<{ real: number; imag: number }>>;
}

export interface DcResult {
  mode: "dc";
  sweepSource: string;
  sweepValues: number[];
  variables: Record<string, number[]>;
}

export type SimulationData = OpResult | TranResult | AcResult | DcResult;

export interface SimulationResult {
  mode: SimulationMode;
  success: boolean;
  data: SimulationData;
  rawOutput?: string;
  /** Non-fatal ngspice notes and warnings. */
  warnings: string[];
  /** Engine that produced the result, e.g. "ngspice-wasm". */
  engine: string;
  durationMs: number;
}

export interface SimulationErrorDetails {
  code: "SIMULATION_TIMEOUT" | "SPICE_ERROR" | "PARSE_ERROR" | "ENGINE_ERROR";
  message: string;
  rawOutput?: string;
  problematicNodes?: string[];
  problematicComponents?: string[];
}

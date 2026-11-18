export interface RawSimulationOutput {
  rawFileText?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SpiceEngine {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  execute(netlist: string, timeoutMs: number): Promise<RawSimulationOutput>;
}

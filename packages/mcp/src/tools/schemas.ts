import { z } from "zod";
import { ComponentTypeSchema } from "@spicebench/core";

export const PlaceComponentInputSchema = {
  type: ComponentTypeSchema.describe(
    "Component type: 'RESISTOR', 'CAPACITOR', 'INDUCTOR', 'DC_VOLTAGE_SOURCE', 'AC_VOLTAGE_SOURCE', 'GROUND', 'DIODE', 'ZENER_DIODE', 'LED', 'BJT_NPN', 'BJT_PNP', 'MULTIMETER', 'OSCILLOSCOPE', 'BODE_PLOTTER', etc.",
  ),
  x: z.number().int().describe("Integer grid X coordinate"),
  y: z.number().int().describe("Integer grid Y coordinate"),
  id: z.string().optional().describe("Optional component ID (e.g. 'R1', 'V1'). Auto-generated if omitted."),
  label: z.string().optional().describe("Optional display label for schematic"),
  params: z
    .record(z.string())
    .optional()
    .describe("Component parameters (e.g. { resistance: '10k' }, { voltage: '12V' })"),
  rotation: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .optional()
    .describe("Rotation in degrees: 0, 90, 180, 270 (clockwise)"),
};

export const UpdateComponentInputSchema = {
  id: z.string().describe("ID of the component to update (e.g. 'R1')"),
  params: z.record(z.string()).optional().describe("New parameter values to merge into component"),
  label: z.string().optional().describe("New display label"),
  x: z.number().int().optional().describe("New X grid coordinate"),
  y: z.number().int().optional().describe("New Y grid coordinate"),
  rotation: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .optional()
    .describe("New rotation in degrees (0, 90, 180, 270)"),
};

export const RemoveComponentInputSchema = {
  id: z.string().describe("ID of the component to remove (e.g. 'R1')"),
};

export const ConnectPinsInputSchema = {
  fromComponentId: z.string().describe("Source component ID (e.g. 'V1')"),
  fromPinId: z.string().describe("Source pin ID (e.g. 'pos', 'neg', '1', '2')"),
  toComponentId: z.string().describe("Target component ID (e.g. 'R1')"),
  toPinId: z.string().describe("Target pin ID (e.g. '1', '2')"),
  id: z.string().optional().describe("Optional wire ID (auto-generated if omitted)"),
};

export const ValidateCircuitInputSchema = {};

export const GetCircuitStateInputSchema = {
  includeNetlist: z
    .boolean()
    .optional()
    .describe("Whether to include the compiled SPICE netlist in the response"),
};

export const RunSimulationInputSchema = {
  mode: z
    .enum(["op", "tran", "ac", "dc"])
    .optional()
    .describe("Simulation mode ('op' by default or inferred from sources/instruments)"),
  tran: z
    .object({
      tstep: z.string().optional().describe("Time step (e.g. '10u', '1m')"),
      tstop: z.string().describe("Stop time (e.g. '10m', '1s')"),
      tstart: z.string().optional().describe("Start time (default 0)"),
      uic: z.boolean().optional().describe("Use Initial Conditions flag"),
    })
    .optional()
    .describe("Transient analysis parameters"),
  ac: z
    .object({
      scale: z.enum(["dec", "oct", "lin"]).optional().describe("Decade, Octave, or Linear frequency scale"),
      points: z.number().int().optional().describe("Points per decade or total points (default 20)"),
      fstart: z.string().describe("Start frequency in Hz (e.g. '10', '100Hz')"),
      fstop: z.string().describe("Stop frequency in Hz (e.g. '100k', '1MHz')"),
    })
    .optional()
    .describe("AC frequency analysis parameters"),
  dc: z
    .object({
      source: z.string().describe("Independent source name to sweep (e.g. 'V1')"),
      vstart: z.number().describe("Start value"),
      vstop: z.number().describe("Stop value"),
      vstep: z.number().describe("Step size"),
    })
    .optional()
    .describe("DC transfer curve sweep parameters"),
  timeoutMs: z.number().optional().describe("Watchdog timeout in milliseconds (default 5000)"),
};

export const ReadInstrumentInputSchema = {
  instrumentId: z.string().describe("ID of the instrument to read (e.g. 'XMM1', 'XSC1', 'XBP1')"),
};

export const ExportSpiceInputSchema = {
  mode: z.enum(["op", "tran", "ac", "dc"]).optional().describe("Target analysis directive mode"),
};

export const ResetCircuitInputSchema = {};

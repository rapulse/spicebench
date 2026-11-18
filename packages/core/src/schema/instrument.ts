import { z } from "zod";

export const WindowPositionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});

export const MultimeterStateSchema = z.object({
  instrumentId: z.string(),
  isOpen: z.boolean().default(false),
  windowPosition: WindowPositionSchema.default({ x: 100, y: 100 }),
  mode: z.enum(["V", "A", "R", "dB"]).default("V"),
  currentType: z.enum(["DC", "AC"]).default("DC"),
});

export type MultimeterState = z.infer<typeof MultimeterStateSchema>;

export const FunctionGeneratorStateSchema = z.object({
  instrumentId: z.string(),
  isOpen: z.boolean().default(false),
  windowPosition: WindowPositionSchema.default({ x: 100, y: 100 }),
  waveform: z.enum(["sine", "square", "triangle"]).default("sine"),
  frequency: z.string().default("1kHz"),
  dutyCycle: z.number().min(1).max(99).default(50),
  amplitude: z.string().default("5V"),
  offset: z.string().default("0V"),
});

export type FunctionGeneratorState = z.infer<typeof FunctionGeneratorStateSchema>;

export const ChannelCouplingSchema = z.enum(["DC", "AC", "0"]);

export const OscilloscopeChannelSchema = z.object({
  scale: z.string().default("5V/div"),
  yPos: z.number().default(0),
  coupling: ChannelCouplingSchema.default("DC"),
});

export const TriggerModeSchema = z.enum(["auto", "normal", "single", "none"]);
export const TriggerEdgeSchema = z.enum(["positive", "negative"]);
export const TriggerSourceSchema = z.enum(["chA", "chB", "ext"]);

export const OscilloscopeStateSchema = z.object({
  instrumentId: z.string(),
  isOpen: z.boolean().default(false),
  windowPosition: WindowPositionSchema.default({ x: 100, y: 100 }),
  timebase: z.string().default("1ms/div"),
  xPos: z.number().default(0),
  chA: OscilloscopeChannelSchema.default({ scale: "5V/div", yPos: 0, coupling: "DC" }),
  chB: OscilloscopeChannelSchema.default({ scale: "5V/div", yPos: 0, coupling: "DC" }),
  trigger: z
    .object({
      mode: TriggerModeSchema.default("auto"),
      edge: TriggerEdgeSchema.default("positive"),
      level: z.number().default(0),
      source: TriggerSourceSchema.default("chA"),
    })
    .default({
      mode: "auto",
      edge: "positive",
      level: 0,
      source: "chA",
    }),
});

export type OscilloscopeState = z.infer<typeof OscilloscopeStateSchema>;

export const BodePlotterStateSchema = z.object({
  instrumentId: z.string(),
  isOpen: z.boolean().default(false),
  windowPosition: WindowPositionSchema.default({ x: 100, y: 100 }),
  mode: z.enum(["magnitude", "phase"]).default("magnitude"),
  scaleH: z.enum(["log", "lin"]).default("log"),
  scaleV: z.enum(["log", "lin"]).default("log"),
  fstart: z.string().default("10Hz"),
  fstop: z.string().default("100kHz"),
  vMin: z.number().default(-60),
  vMax: z.number().default(20),
});

export type BodePlotterState = z.infer<typeof BodePlotterStateSchema>;

export const InstrumentStateSchema = z.union([
  MultimeterStateSchema,
  FunctionGeneratorStateSchema,
  OscilloscopeStateSchema,
  BodePlotterStateSchema,
]);

export type InstrumentState = z.infer<typeof InstrumentStateSchema>;

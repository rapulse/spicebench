import { z } from "zod";
import { PositionSchema } from "./geometry";

export const ComponentTypeSchema = z.enum([
  // Sources
  "GROUND",
  "DC_VOLTAGE_SOURCE",
  "AC_VOLTAGE_SOURCE",
  "DC_CURRENT_SOURCE",
  "PULSE_VOLTAGE_SOURCE",
  // Basic
  "RESISTOR",
  "CAPACITOR",
  "POLARIZED_CAPACITOR",
  "INDUCTOR",
  "SWITCH_SPST",
  "POTENTIOMETER",
  // Diodes & Semiconductors
  "DIODE",
  "ZENER_DIODE",
  "LED",
  "BJT_NPN",
  "BJT_PNP",
  "OPAMP",
  // Instruments
  "MULTIMETER",
  "FUNCTION_GENERATOR",
  "OSCILLOSCOPE",
  "BODE_PLOTTER",
]);

export type ComponentType = z.infer<typeof ComponentTypeSchema>;

export const ComponentCategorySchema = z.enum([
  "Sources",
  "Basic",
  "Diodes",
  "Transistors",
  "Analog",
  "Instruments",
]);

export type ComponentCategory = z.infer<typeof ComponentCategorySchema>;

export const PinDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  offset: PositionSchema,
});

export type PinDefinition = z.infer<typeof PinDefinitionSchema>;

export interface ComponentMetadata {
  type: ComponentType;
  category: ComponentCategory;
  name: string;
  prefix: string;
  defaultParams: Record<string, string>;
  pins: PinDefinition[];
}

export const COMPONENT_CATALOG: Record<ComponentType, ComponentMetadata> = {
  // Sources
  GROUND: {
    type: "GROUND",
    category: "Sources",
    name: "Ground",
    prefix: "GND",
    defaultParams: {},
    pins: [{ id: "0", label: "0", offset: { x: 0, y: 0 } }],
  },
  DC_VOLTAGE_SOURCE: {
    type: "DC_VOLTAGE_SOURCE",
    category: "Sources",
    name: "Battery (DC Voltage)",
    prefix: "V",
    defaultParams: { voltage: "12V" },
    pins: [
      { id: "pos", label: "+", offset: { x: 0, y: -2 } },
      { id: "neg", label: "-", offset: { x: 0, y: 2 } },
    ],
  },
  AC_VOLTAGE_SOURCE: {
    type: "AC_VOLTAGE_SOURCE",
    category: "Sources",
    name: "AC Voltage Source",
    prefix: "V",
    defaultParams: { voltage: "120V", frequency: "60Hz" },
    pins: [
      { id: "pos", label: "+", offset: { x: 0, y: -2 } },
      { id: "neg", label: "-", offset: { x: 0, y: 2 } },
    ],
  },
  DC_CURRENT_SOURCE: {
    type: "DC_CURRENT_SOURCE",
    category: "Sources",
    name: "DC Current Source",
    prefix: "I",
    defaultParams: { current: "1A" },
    pins: [
      { id: "pos", label: "+", offset: { x: 0, y: -2 } },
      { id: "neg", label: "-", offset: { x: 0, y: 2 } },
    ],
  },
  PULSE_VOLTAGE_SOURCE: {
    type: "PULSE_VOLTAGE_SOURCE",
    category: "Sources",
    name: "Clock / Pulse Source",
    prefix: "V",
    defaultParams: {
      v1: "0V",
      v2: "5V",
      delay: "0",
      riseTime: "10ns",
      fallTime: "10ns",
      width: "0.5ms",
      period: "1ms",
    },
    pins: [
      { id: "pos", label: "+", offset: { x: 0, y: -2 } },
      { id: "neg", label: "-", offset: { x: 0, y: 2 } },
    ],
  },

  // Basic
  RESISTOR: {
    type: "RESISTOR",
    category: "Basic",
    name: "Resistor",
    prefix: "R",
    defaultParams: { resistance: "1k" },
    pins: [
      { id: "1", label: "1", offset: { x: -2, y: 0 } },
      { id: "2", label: "2", offset: { x: 2, y: 0 } },
    ],
  },
  CAPACITOR: {
    type: "CAPACITOR",
    category: "Basic",
    name: "Capacitor",
    prefix: "C",
    defaultParams: { capacitance: "1uF" },
    pins: [
      { id: "1", label: "1", offset: { x: -2, y: 0 } },
      { id: "2", label: "2", offset: { x: 2, y: 0 } },
    ],
  },
  POLARIZED_CAPACITOR: {
    type: "POLARIZED_CAPACITOR",
    category: "Basic",
    name: "Polarized Capacitor",
    prefix: "C",
    defaultParams: { capacitance: "10uF" },
    pins: [
      { id: "pos", label: "+", offset: { x: -2, y: 0 } },
      { id: "neg", label: "-", offset: { x: 2, y: 0 } },
    ],
  },
  INDUCTOR: {
    type: "INDUCTOR",
    category: "Basic",
    name: "Inductor",
    prefix: "L",
    defaultParams: { inductance: "1mH" },
    pins: [
      { id: "1", label: "1", offset: { x: -2, y: 0 } },
      { id: "2", label: "2", offset: { x: 2, y: 0 } },
    ],
  },
  SWITCH_SPST: {
    type: "SWITCH_SPST",
    category: "Basic",
    name: "SPST Switch",
    prefix: "S",
    defaultParams: { state: "open", key: "Space" },
    pins: [
      { id: "1", label: "1", offset: { x: -2, y: 0 } },
      { id: "2", label: "2", offset: { x: 2, y: 0 } },
    ],
  },
  POTENTIOMETER: {
    type: "POTENTIOMETER",
    category: "Basic",
    name: "Potentiometer",
    prefix: "R",
    defaultParams: { resistance: "10k", percent: "50", key: "R" },
    pins: [
      { id: "1", label: "1", offset: { x: -2, y: 0 } },
      { id: "wiper", label: "W", offset: { x: 0, y: 2 } },
      { id: "2", label: "2", offset: { x: 2, y: 0 } },
    ],
  },

  // Diodes & Active
  DIODE: {
    type: "DIODE",
    category: "Diodes",
    name: "Diode",
    prefix: "D",
    defaultParams: { model: "1N4148" },
    pins: [
      { id: "anode", label: "A", offset: { x: -2, y: 0 } },
      { id: "cathode", label: "K", offset: { x: 2, y: 0 } },
    ],
  },
  ZENER_DIODE: {
    type: "ZENER_DIODE",
    category: "Diodes",
    name: "Zener Diode",
    prefix: "D",
    defaultParams: { vz: "5.1V", model: "BZX55C5V1" },
    pins: [
      { id: "anode", label: "A", offset: { x: -2, y: 0 } },
      { id: "cathode", label: "K", offset: { x: 2, y: 0 } },
    ],
  },
  LED: {
    type: "LED",
    category: "Diodes",
    name: "LED",
    prefix: "LED",
    defaultParams: { color: "red", forwardVoltage: "2V" },
    pins: [
      { id: "anode", label: "A", offset: { x: -2, y: 0 } },
      { id: "cathode", label: "K", offset: { x: 2, y: 0 } },
    ],
  },
  BJT_NPN: {
    type: "BJT_NPN",
    category: "Transistors",
    name: "NPN BJT",
    prefix: "Q",
    defaultParams: { model: "2N3904" },
    pins: [
      { id: "base", label: "B", offset: { x: -2, y: 0 } },
      { id: "collector", label: "C", offset: { x: 1, y: -2 } },
      { id: "emitter", label: "E", offset: { x: 1, y: 2 } },
    ],
  },
  BJT_PNP: {
    type: "BJT_PNP",
    category: "Transistors",
    name: "PNP BJT",
    prefix: "Q",
    defaultParams: { model: "2N3906" },
    pins: [
      { id: "base", label: "B", offset: { x: -2, y: 0 } },
      { id: "collector", label: "C", offset: { x: 1, y: -2 } },
      { id: "emitter", label: "E", offset: { x: 1, y: 2 } },
    ],
  },
  OPAMP: {
    type: "OPAMP",
    category: "Analog",
    name: "Op-Amp (741 / Ideal)",
    prefix: "U",
    defaultParams: { model: "LM741" },
    pins: [
      { id: "inv", label: "-", offset: { x: -3, y: -1 } },
      { id: "non_inv", label: "+", offset: { x: -3, y: 1 } },
      { id: "v_pos", label: "V+", offset: { x: 0, y: -2 } },
      { id: "v_neg", label: "V-", offset: { x: 0, y: 2 } },
      { id: "out", label: "OUT", offset: { x: 3, y: 0 } },
    ],
  },

  // Instruments
  MULTIMETER: {
    type: "MULTIMETER",
    category: "Instruments",
    name: "Multimeter",
    prefix: "XMM",
    defaultParams: { mode: "V", currentType: "DC" },
    pins: [
      { id: "pos", label: "+", offset: { x: -2, y: 1 } },
      { id: "neg", label: "-", offset: { x: 2, y: 1 } },
    ],
  },
  FUNCTION_GENERATOR: {
    type: "FUNCTION_GENERATOR",
    category: "Instruments",
    name: "Function Generator",
    prefix: "XFG",
    defaultParams: { waveform: "sine", frequency: "1kHz", amplitude: "5V", offset: "0V" },
    pins: [
      { id: "pos", label: "+", offset: { x: -2, y: 1 } },
      { id: "com", label: "COM", offset: { x: 0, y: 1 } },
      { id: "neg", label: "-", offset: { x: 2, y: 1 } },
    ],
  },
  OSCILLOSCOPE: {
    type: "OSCILLOSCOPE",
    category: "Instruments",
    name: "Oscilloscope",
    prefix: "XSC",
    defaultParams: { timebase: "1ms/div", chA_scale: "5V/div", chB_scale: "5V/div" },
    pins: [
      { id: "ch_a_pos", label: "A+", offset: { x: -3, y: 1 } },
      { id: "ch_a_neg", label: "A-", offset: { x: -1, y: 1 } },
      { id: "ch_b_pos", label: "B+", offset: { x: 1, y: 1 } },
      { id: "ch_b_neg", label: "B-", offset: { x: 3, y: 1 } },
    ],
  },
  BODE_PLOTTER: {
    type: "BODE_PLOTTER",
    category: "Instruments",
    name: "Bode Plotter",
    prefix: "XBP",
    defaultParams: { fstart: "10Hz", fstop: "100kHz", mode: "magnitude" },
    pins: [
      { id: "in_pos", label: "IN+", offset: { x: -3, y: 1 } },
      { id: "in_neg", label: "IN-", offset: { x: -1, y: 1 } },
      { id: "out_pos", label: "OUT+", offset: { x: 1, y: 1 } },
      { id: "out_neg", label: "OUT-", offset: { x: 3, y: 1 } },
    ],
  },
};

import { describe, it, expect } from "vitest";
import {
  parseEngineeringValue,
  formatForSpice,
  formatEngineeringValue,
} from "../src/schema/units";

describe("Engineering Units & SPICE Notation", () => {
  describe("parseEngineeringValue", () => {
    it("parses plain integers and floats", () => {
      expect(parseEngineeringValue("10").value).toBe(10);
      expect(parseEngineeringValue("-5.5").value).toBe(-5.5);
      expect(parseEngineeringValue(100).value).toBe(100);
    });

    it("parses standard SI prefixes", () => {
      expect(parseEngineeringValue("10k").value).toBe(10000);
      expect(parseEngineeringValue("1K").value).toBe(1000);
      expect(parseEngineeringValue("100u").value).toBeCloseTo(0.0001, 8);
      expect(parseEngineeringValue("4.7uF").value).toBeCloseTo(4.7e-6, 10);
      expect(parseEngineeringValue("100 nF").value).toBeCloseTo(1e-7, 10);
      expect(parseEngineeringValue("22pF").value).toBeCloseTo(2.2e-11, 15);
      expect(parseEngineeringValue("10mH").value).toBeCloseTo(0.01, 6);
      expect(parseEngineeringValue("1.5GHz").value).toBe(1.5e9);
    });

    it("parses Mega notation correctly ('meg', 'Meg', 'M')", () => {
      expect(parseEngineeringValue("1M").value).toBe(1e6);
      expect(parseEngineeringValue("10Meg").value).toBe(10e6);
      expect(parseEngineeringValue("2.2meg").value).toBe(2.2e6);
      expect(parseEngineeringValue("10MOhm").value).toBe(10e6);
    });

    it("distinguishes milli ('m') from Mega ('M')", () => {
      const milli = parseEngineeringValue("10m");
      const mega = parseEngineeringValue("10M");
      expect(milli.value).toBe(0.01);
      expect(mega.value).toBe(10_000_000);
    });

    it("parses scientific notation strings", () => {
      expect(parseEngineeringValue("1e-6").value).toBe(1e-6);
      expect(parseEngineeringValue("2.5e3").value).toBe(2500);
    });

    it("throws on invalid formats", () => {
      expect(() => parseEngineeringValue("abc")).toThrow();
      expect(() => parseEngineeringValue("")).toThrow();
      expect(() => parseEngineeringValue("10kilo")).toThrow();
    });
  });

  describe("formatForSpice", () => {
    it("formats 0 correctly", () => {
      expect(formatForSpice(0)).toBe("0");
    });

    it("converts 10^6 to 'meg', NOT 'M' (which means milli in SPICE)", () => {
      expect(formatForSpice(1e6)).toBe("1meg");
      expect(formatForSpice(10e6)).toBe("10meg");
      expect(formatForSpice(2.2e6)).toBe("2.2meg");
    });

    it("formats milli, micro, nano, pico", () => {
      expect(formatForSpice(0.01)).toBe("10m");
      expect(formatForSpice(1e-6)).toBe("1u");
      expect(formatForSpice(100e-9)).toBe("100n");
      expect(formatForSpice(15e-12)).toBe("15p");
    });

    it("formats kilo", () => {
      expect(formatForSpice(1000)).toBe("1k");
      expect(formatForSpice(4700)).toBe("4.7k");
    });

    it("handles negative values", () => {
      expect(formatForSpice(-10000)).toBe("-10k");
      expect(formatForSpice(-0.005)).toBe("-5m");
      expect(formatForSpice(-2e6)).toBe("-2meg");
    });
  });

  describe("formatEngineeringValue", () => {
    it("formats with standard metric prefixes and units", () => {
      expect(formatEngineeringValue(10000, "Ω")).toBe("10 kΩ");
      expect(formatEngineeringValue(0.00001, "F")).toBe("10 µF");
      expect(formatEngineeringValue(1000000, "Hz")).toBe("1 MHz");
      expect(formatEngineeringValue(0.005, "V")).toBe("5 mV");
      expect(formatEngineeringValue(0, "V")).toBe("0 V");
    });
  });
});

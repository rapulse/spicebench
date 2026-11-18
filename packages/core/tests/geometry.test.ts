import { describe, it, expect } from "vitest";
import {
  PositionSchema,
  RotationSchema,
  rotatePoint,
  normalizeRotation,
} from "../src/schema/geometry";

describe("Geometry Schema & Math", () => {
  describe("PositionSchema", () => {
    it("accepts integer coordinates", () => {
      const valid = PositionSchema.parse({ x: 10, y: -5 });
      expect(valid).toEqual({ x: 10, y: -5 });
    });

    it("rejects non-integer floating point coordinates", () => {
      expect(() => PositionSchema.parse({ x: 10.5, y: 0 })).toThrow();
      expect(() => PositionSchema.parse({ x: 0, y: -2.3 })).toThrow();
    });
  });

  describe("RotationSchema", () => {
    it("accepts 0, 90, 180, 270", () => {
      expect(RotationSchema.parse(0)).toBe(0);
      expect(RotationSchema.parse(90)).toBe(90);
      expect(RotationSchema.parse(180)).toBe(180);
      expect(RotationSchema.parse(270)).toBe(270);
    });

    it("rejects non-orthogonal angles", () => {
      expect(() => RotationSchema.parse(45)).toThrow();
      expect(() => RotationSchema.parse(360)).toThrow();
    });
  });

  describe("rotatePoint", () => {
    const pt = { x: 2, y: 0 };

    it("keeps coordinates unchanged on 0 deg", () => {
      expect(rotatePoint(pt, 0)).toEqual({ x: 2, y: 0 });
    });

    it("rotates clockwise 90 deg (screen coords: y down)", () => {
      expect(rotatePoint(pt, 90)).toEqual({ x: 0, y: 2 });
    });

    it("rotates 180 deg", () => {
      expect(rotatePoint(pt, 180)).toEqual({ x: -2, y: 0 });
    });

    it("rotates 270 deg (counter-clockwise 90 deg)", () => {
      expect(rotatePoint(pt, 270)).toEqual({ x: 0, y: -2 });
    });

    it("rotates relative to a non-zero origin", () => {
      const origin = { x: 10, y: 10 };
      const point = { x: 12, y: 10 }; // 2 units right of origin
      expect(rotatePoint(point, 90, origin)).toEqual({ x: 10, y: 12 });
      expect(rotatePoint(point, 180, origin)).toEqual({ x: 8, y: 10 });
    });
  });

  describe("normalizeRotation", () => {
    it("normalizes arbitrary angles to orthogonal steps", () => {
      expect(normalizeRotation(0)).toBe(0);
      expect(normalizeRotation(30)).toBe(0);
      expect(normalizeRotation(85)).toBe(90);
      expect(normalizeRotation(100)).toBe(90);
      expect(normalizeRotation(190)).toBe(180);
      expect(normalizeRotation(260)).toBe(270);
      expect(normalizeRotation(350)).toBe(0);
      expect(normalizeRotation(-90)).toBe(270);
    });
  });
});

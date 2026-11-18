import { describe, it, expect } from "vitest";
import { SpiceRawParser } from "../src/parser/spice-raw-parser";
import { SpiceStdoutParser } from "../src/parser/spice-stdout-parser";
import { OpResult, TranResult, AcResult } from "../src/parser/types";

describe("SpiceRawParser & SpiceStdoutParser", () => {
  describe("SpiceRawParser - Operating Point (.op)", () => {
    const rawOp = `
Title: SpiceBench Netlist: Voltage Divider
Date: Wed Nov 18 2026
Plotname: Operating Point
Flags: real
No. Variables: 3
No. Points: 1
Variables:
\t0\tv(n001)\tvoltage
\t1\tv(n002)\tvoltage
\t2\ti(v_v1)\tcurrent
Values:
0\t1.000000000000000e+01
\t5.000000000000000e+00
\t-5.000000000000000e-04
`;

    it("parses OP rawfile into structured OpResult", () => {
      const result = SpiceRawParser.parse(rawOp) as OpResult;
      expect(result.mode).toBe("op");
      expect(result.nodeVoltages["n001"]).toBeCloseTo(10.0, 5);
      expect(result.nodeVoltages["n002"]).toBeCloseTo(5.0, 5);
      expect(result.branchCurrents["v_v1"]).toBeCloseTo(-0.0005, 7);
    });
  });

  describe("SpiceRawParser - Transient Analysis (.tran)", () => {
    const rawTran = `
Title: RC Transient Step
Plotname: Transient Analysis
Flags: real
No. Variables: 2
No. Points: 3
Variables:
\t0\ttime\ttime
\t1\tv(n001)\tvoltage
Values:
0\t0.000000000000000e+00
\t0.000000000000000e+00
1\t1.000000000000000e-03
\t3.160600000000000e+00
2\t2.000000000000000e-03
\t4.323300000000000e+00
`;

    it("parses TRAN rawfile into time vector and signals", () => {
      const result = SpiceRawParser.parse(rawTran) as TranResult;
      expect(result.mode).toBe("tran");
      expect(result.time).toEqual([0, 0.001, 0.002]);
      expect(result.variables["v(n001)"]?.length).toBe(3);
      expect(result.variables["v(n001)"]![1]).toBeCloseTo(3.1606, 4);
    });
  });

  describe("SpiceRawParser - AC Frequency Analysis (.ac)", () => {
    const rawAc = `
Title: RLC Resonance
Plotname: AC Analysis
Flags: complex
No. Variables: 2
No. Points: 2
Variables:
\t0\tfrequency\tfrequency
\t1\tv(n001)\tvoltage
Values:
0\t1.000000000000000e+02,0.000000000000000e+00
\t1.000000000000000e-01,0.000000000000000e+00
1\t1.000000000000000e+03,0.000000000000000e+00
\t1.000000000000000e+00,0.000000000000000e+00
`;

    it("parses AC rawfile into frequency vector, dB magnitude, and phase degrees", () => {
      const result = SpiceRawParser.parse(rawAc) as AcResult;
      expect(result.mode).toBe("ac");
      expect(result.frequency).toEqual([100, 1000]);
      // At 100 Hz, magnitude 0.1 -> -20 dB
      expect(result.magnitudeDb["v(n001)"]![0]).toBeCloseTo(-20.0, 1);
      // At 1000 Hz, magnitude 1.0 -> 0 dB
      expect(result.magnitudeDb["v(n001)"]![1]).toBeCloseTo(0.0, 1);
    });
  });

  describe("SpiceStdoutParser", () => {
    it("parses stdout operating point table", () => {
      const stdout = `
Circuit: Voltage Divider

******
** Operating Point **
******

Node                                   Voltage
----                                   -------
n001                                   1.200000e+01
n002                                   6.000000e+00
v_v1#branch                           -6.000000e-04
`;

      const result = SpiceStdoutParser.parseOpStdout(stdout);
      expect(result.nodeVoltages["n001"]).toBeCloseTo(12.0, 4);
      expect(result.nodeVoltages["n002"]).toBeCloseTo(6.0, 4);
      expect(result.branchCurrents["v_v1"]).toBeCloseTo(-0.0006, 6);
    });

    it("extracts error details and problematic node names from ngspice log", () => {
      const errorLog = `
Doing analysis at TEMP = 27.000000 and TNOM = 27.000000
Error: singular matrix: check nodes N001 and N002
Error: no ground node found in circuit
`;

      const err = SpiceStdoutParser.extractErrors(errorLog);
      expect(err).toBeDefined();
      expect(err?.code).toBe("SPICE_ERROR");
      expect(err?.message).toContain("singular matrix");
      expect(err?.problematicNodes).toContain("n001");
      expect(err?.problematicNodes).toContain("n002");
    });
  });
});

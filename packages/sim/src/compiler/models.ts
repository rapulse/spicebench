/**
 * Standard open-source SPICE semiconductor device models.
 * Compatible with ngspice 3f5 / XSPICE.
 */

export const STANDARD_SPICE_MODELS: Record<string, string> = {
  // Switching diode
  "1N4148": ".model 1N4148 D(IS=2.52n RS=0.568 N=1.752 CJO=4p M=0.333 TT=5.76n BV=100 IBV=0.1u)",
  // Generic diode fallback
  DEFAULT_DIODE: ".model DEFAULT_DIODE D(IS=1e-14 RS=0.1 N=1.0 CJO=2p BV=100 IBV=1u)",
  // Zener diode 5.1V
  BZX55C5V1: ".model BZX55C5V1 D(IS=1e-14 RS=0.5 N=1.0 BV=5.1 IBV=5m)",
  // Red LED
  LED: ".model LED D(IS=1e-22 N=1.8 RS=2.0 BV=5 IBV=10u)",
  // General purpose NPN transistor
  "2N3904":
    ".model 2N3904 NPN(IS=1e-14 BF=300 VAF=100 IKF=0.4 ISE=2.7e-15 NE=1.3 BR=4 VAR=20 IKR=0.09 ISC=0 NC=2 RB=10 RE=0.1 RC=1 CJE=4.5p VJE=0.75 MJE=0.33 CJC=3.5p VJC=0.75 MJC=0.33 TF=0.4n TR=30n)",
  // General purpose PNP transistor
  "2N3906":
    ".model 2N3906 PNP(IS=1e-14 BF=200 VAF=100 IKF=0.4 ISE=2.7e-15 NE=1.3 BR=4 VAR=20 IKR=0.09 ISC=0 NC=2 RB=10 RE=0.1 RC=1 CJE=4.5p VJE=0.75 MJE=0.33 CJC=3.5p VJC=0.75 MJC=0.33 TF=0.4n TR=30n)",

  // MOSFETs
  "2N7000": ".model 2N7000 NMOS(VTO=2.1 KP=0.12 RD=1.2 RS=1.2 CBD=25p CBS=25p CGDO=20p CGSO=20p)",
  BS250: ".model BS250 PMOS(VTO=-2.0 KP=0.08 RD=2.0 RS=2.0 CBD=30p CBS=30p CGDO=25p CGSO=25p)",
  IRF510: ".model IRF510 NMOS(LEVEL=3 VTO=3.6 KP=1.8 RD=0.1 RS=0.1 CBD=140p CBS=140p)",
  IRF9510: ".model IRF9510 PMOS(LEVEL=3 VTO=-3.6 KP=1.2 RD=0.2 RS=0.2 CBD=180p CBS=180p)",
  DEFAULT_NMOS: ".model DEFAULT_NMOS NMOS(VTO=1.5 KP=0.1 RD=0.5 RS=0.5)",
  DEFAULT_PMOS: ".model DEFAULT_PMOS PMOS(VTO=-1.5 KP=0.1 RD=0.5 RS=0.5)",
};

export const STANDARD_SUBCIRCUITS: Record<string, string> = {
  OPAMP_IDEAL: [
    ".subckt OPAMP_IDEAL inv non_inv out",
    "Rin inv non_inv 100meg",
    "E1 out 0 non_inv inv 100000",
    "Rout out 0 100",
    ".ends OPAMP_IDEAL",
  ].join("\n"),

  LM741: [
    ".subckt LM741 inv non_inv v_pos v_neg out",
    "Rin inv non_inv 2meg",
    "E1 int 0 non_inv inv 200000",
    "R1 int 0 1k",
    "Bout out 0 V=min(V(v_pos)-1.5, max(V(v_neg)+1.5, V(int)))",
    "Rout out 0 75",
    ".ends LM741",
  ].join("\n"),

  TIMER_555: [
    ".subckt TIMER_555 gnd trig out reset ctrl thresh disch vcc",
    "R1 vcc ctrl 5k",
    "R2 ctrl v2 5k",
    "R3 v2 gnd 5k",
    // RS latch: trigger (< 1/3 Vcc) sets, threshold (> ctrl = 2/3 Vcc) resets, hold otherwise.
    // State q is delayed by R_q*C_q = 10 ns so the feedback is causal in .tran.
    // An astable 555 has no DC operating point; .tran with 555 is compiled with `uic` (ADR-009).
    "B_latch qd gnd V=V(reset,gnd) < 0.7 ? 0 : (V(trig,gnd) < V(v2,gnd) ? 1 : (V(thresh,gnd) > V(ctrl,gnd) ? 0 : (V(q,gnd) > 0.5 ? 1 : 0)))",
    "R_q qd q 1k",
    "C_q q gnd 10p",
    "B_out out gnd V=V(q,gnd) > 0.5 ? max(V(vcc,gnd)-1.7, 0) : 0.1",
    // Discharge switch: ~10 Ohm to gnd while the latch is reset.
    "B_dis disch gnd I=V(q,gnd) < 0.5 ? V(disch,gnd)/10 : 0",
    ".ends TIMER_555",
  ].join("\n"),

  GATE_AND: [
    ".subckt GATE_AND in1 in2 out",
    "Rin1 in1 0 100meg",
    "Rin2 in2 0 100meg",
    "B1 out 0 V=(V(in1) > 2.0 && V(in2) > 2.0) ? 5.0 : 0.0",
    "Rout out 0 50",
    ".ends GATE_AND",
  ].join("\n"),

  GATE_OR: [
    ".subckt GATE_OR in1 in2 out",
    "Rin1 in1 0 100meg",
    "Rin2 in2 0 100meg",
    "B1 out 0 V=(V(in1) > 2.0 || V(in2) > 2.0) ? 5.0 : 0.0",
    "Rout out 0 50",
    ".ends GATE_OR",
  ].join("\n"),

  GATE_NOT: [
    ".subckt GATE_NOT in out",
    "Rin in 0 100meg",
    "B1 out 0 V=(V(in) > 2.0) ? 0.0 : 5.0",
    "Rout out 0 50",
    ".ends GATE_NOT",
  ].join("\n"),

  GATE_NAND: [
    ".subckt GATE_NAND in1 in2 out",
    "Rin1 in1 0 100meg",
    "Rin2 in2 0 100meg",
    "B1 out 0 V=(V(in1) > 2.0 && V(in2) > 2.0) ? 0.0 : 5.0",
    "Rout out 0 50",
    ".ends GATE_NAND",
  ].join("\n"),

  GATE_NOR: [
    ".subckt GATE_NOR in1 in2 out",
    "Rin1 in1 0 100meg",
    "Rin2 in2 0 100meg",
    "B1 out 0 V=(V(in1) > 2.0 || V(in2) > 2.0) ? 0.0 : 5.0",
    "Rout out 0 50",
    ".ends GATE_NOR",
  ].join("\n"),

  GATE_XOR: [
    ".subckt GATE_XOR in1 in2 out",
    "Rin1 in1 0 100meg",
    "Rin2 in2 0 100meg",
    "B1 out 0 V=((V(in1) > 2.0) != (V(in2) > 2.0)) ? 5.0 : 0.0",
    "Rout out 0 50",
    ".ends GATE_XOR",
  ].join("\n"),
};

/**
 * Returns SPICE .model statement for the given model name or type.
 */
export function getModelDefinition(modelName: string): string | undefined {
  return STANDARD_SPICE_MODELS[modelName];
}

/**
 * Returns SPICE .subckt definition for the given macromodel.
 */
export function getSubcircuitDefinition(subcircuitName: string): string | undefined {
  return STANDARD_SUBCIRCUITS[subcircuitName];
}

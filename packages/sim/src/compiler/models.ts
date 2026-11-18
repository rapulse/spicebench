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
};

/**
 * Returns SPICE .model statement for the given model name or type.
 */
export function getModelDefinition(modelName: string): string | undefined {
  return STANDARD_SPICE_MODELS[modelName];
}

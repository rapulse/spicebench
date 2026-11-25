import React from "react";
import type { Component } from "@spicebench/core";
import type { InstrumentData } from "@spicebench/sim";

interface SchematicSymbolProps {
  component: Component;
  isSelected?: boolean;
  pinVoltages?: Record<string, number>;
  instrumentData?: InstrumentData;
}

function formatMeterReadout(data: InstrumentData | undefined): { valueText: string; prefix: string } {
  if (!data || (data.type !== "VOLTMETER" && data.type !== "AMMETER")) {
    return { valueText: "---", prefix: "" };
  }
  if (data.status !== "ok" || data.value === null || !Number.isFinite(data.value)) {
    return { valueText: data.status === "not_connected" ? "----" : "---", prefix: "" };
  }
  const a = Math.abs(data.value);
  const steps: Array<[number, string]> = [
    [1e6, "M"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
  ];
  const [scale, p] = a === 0 ? [1, ""] : (steps.find(([s]) => a >= s) ?? [1e-9, "n"]);
  return { valueText: (data.value / scale).toFixed(3), prefix: p };
}

export const SchematicSymbol: React.FC<SchematicSymbolProps> = ({
  component,
  isSelected,
  pinVoltages,
  instrumentData,
}) => {
  const { type, rotation = 0, params } = component;
  const strokeColor = isSelected ? "#0000ff" : "#000000";
  const strokeWidth = isSelected ? 2.5 : 2;

  // Render symbol centered at local (0, 0)
  const renderShape = () => {
    switch (type) {
      case "RESISTOR":
        return (
          <g>
            <line x1="-40" y1="0" x2="-12" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline
              points="-12,0 -9,-6 -4,6 1,-6 6,6 9,-6 12,0"
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
            <line x1="12" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "POTENTIOMETER": {
        const pct = Math.min(100, Math.max(0, parseFloat(params["percent"] || "50")));
        const wiperX = -10 + (pct / 100) * 20;
        return (
          <g>
            <line x1="-40" y1="0" x2="-12" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline
              points="-12,0 -9,-6 -4,6 1,-6 6,6 9,-6 12,0"
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
            <line x1="12" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Wiper arrow to pin (0, 40) */}
            <line x1="0" y1="40" x2="0" y2="14" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="0" y1="14" x2={wiperX} y2="5" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polygon
              points={`${wiperX},2 ${wiperX - 3},8 ${wiperX + 3},8`}
              fill={strokeColor}
            />
          </g>
        );
      }

      case "SWITCH_SPST": {
        const isClosed = params["state"] === "closed";
        return (
          <g>
            <line x1="-40" y1="0" x2="-8" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <circle cx="-8" cy="0" r="2.5" fill={strokeColor} />
            {isClosed ? (
              <line x1="-8" y1="0" x2="8" y2="0" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            ) : (
              <line x1="-8" y1="0" x2="6" y2="-12" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            )}
            <circle cx="8" cy="0" r="2.5" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="8" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );
      }

      case "CAPACITOR":
        return (
          <g>
            <line x1="-40" y1="0" x2="-4" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-4" y1="-10" x2="-4" y2="10" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <line x1="4" y1="-10" x2="4" y2="10" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <line x1="4" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "POLARIZED_CAPACITOR":
        return (
          <g>
            <line x1="-40" y1="0" x2="-4" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-4" y1="-10" x2="-4" y2="10" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <path d="M 4 -10 Q 0 0 4 10" fill="none" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <line x1="4" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <text x="-12" y="-6" fontSize="9" fill={strokeColor} fontWeight="bold">+</text>
          </g>
        );

      case "INDUCTOR":
        return (
          <g>
            <line x1="-40" y1="0" x2="-12" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <path
              d="M -12 0 A 3 3 0 0 1 -6 0 A 3 3 0 0 1 0 0 A 3 3 0 0 1 6 0 A 3 3 0 0 1 12 0"
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            <line x1="12" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "GROUND":
        return (
          <g>
            <line x1="0" y1="0" x2="0" y2="8" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-10" y1="8" x2="10" y2="8" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <line x1="-6" y1="12" x2="6" y2="12" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-2" y1="16" x2="2" y2="16" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "DC_VOLTAGE_SOURCE":
        return (
          <g>
            <line x1="0" y1="-40" x2="0" y2="-4" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-12" y1="-4" x2="12" y2="-4" stroke={strokeColor} strokeWidth={strokeWidth + 1} />
            <line x1="-6" y1="4" x2="6" y2="4" stroke={strokeColor} strokeWidth={strokeWidth + 2} />
            <line x1="0" y1="4" x2="0" y2="40" stroke={strokeColor} strokeWidth={strokeWidth} />
            <text x="-14" y="-8" fontSize="10" fill="#cc0000" fontWeight="bold">+</text>
            <text x="-14" y="14" fontSize="10" fill="#0000cc" fontWeight="bold">-</text>
          </g>
        );

      case "AC_VOLTAGE_SOURCE":
        return (
          <g>
            <circle cx="0" cy="0" r="14" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="0" y1="-40" x2="0" y2="-14" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="0" y1="14" x2="0" y2="40" stroke={strokeColor} strokeWidth={strokeWidth} />
            <path d="M -8 0 Q -4 -7 0 0 Q 4 7 8 0" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "DC_CURRENT_SOURCE":
        return (
          <g>
            <circle cx="0" cy="0" r="14" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="0" y1="-40" x2="0" y2="-14" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="0" y1="14" x2="0" y2="40" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="0" y1="-6" x2="0" y2="6" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline points="-4,2 0,6 4,2" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "PULSE_VOLTAGE_SOURCE":
        return (
          <g>
            <circle cx="0" cy="0" r="14" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="0" y1="-40" x2="0" y2="-14" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="0" y1="14" x2="0" y2="40" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline points="-8,4 -8,-4 0,-4 0,4 8,4 8,-4" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "DIODE":
        return (
          <g>
            <line x1="-40" y1="0" x2="-8" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polygon points="-8,-8 8,0 -8,8" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="8" y1="-8" x2="8" y2="8" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <line x1="8" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "ZENER_DIODE":
        return (
          <g>
            <line x1="-40" y1="0" x2="-8" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polygon points="-8,-8 8,0 -8,8" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <path d="M 5 -8 L 8 -8 L 8 8 L 11 8" fill="none" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <line x1="8" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "LED": {
        const vA = pinVoltages?.[`${component.id}:anode`];
        const vK = pinVoltages?.[`${component.id}:cathode`];
        const isLedLit = vA !== undefined && vK !== undefined && vA - vK > 1.5;
        const ledFill = isLedLit ? "#ff3333" : "#ffffff";
        return (
          <g>
            {isLedLit && <circle cx="0" cy="0" r="16" fill="#ff0000" opacity="0.3" />}
            <line x1="-40" y1="0" x2="-8" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polygon points="-8,-8 8,0 -8,8" fill={ledFill} stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="8" y1="-8" x2="8" y2="8" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <line x1="8" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-2" y1="-10" x2="4" y2="-16" stroke="#ff8800" strokeWidth="1.5" />
            <polyline points="1,-16 4,-16 4,-13" fill="none" stroke="#ff8800" strokeWidth="1.5" />
            <line x1="4" y1="-7" x2="10" y2="-13" stroke="#ff8800" strokeWidth="1.5" />
            <polyline points="7,-13 10,-13 10,-10" fill="none" stroke="#ff8800" strokeWidth="1.5" />
          </g>
        );
      }

      case "BJT_NPN":
        return (
          <g>
            <circle cx="0" cy="0" r="16" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-6" y1="-10" x2="-6" y2="10" stroke={strokeColor} strokeWidth={strokeWidth + 1} />
            <line x1="-40" y1="0" x2="-6" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-6" y1="-5" x2="8" y2="-12" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline points="8,-12 20,-12 20,-40" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-6" y1="5" x2="8" y2="12" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline points="8,12 20,12 20,40" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polygon points="7,10 8,14 4,13" fill={strokeColor} />
          </g>
        );

      case "BJT_PNP":
        return (
          <g>
            <circle cx="0" cy="0" r="16" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-6" y1="-10" x2="-6" y2="10" stroke={strokeColor} strokeWidth={strokeWidth + 1} />
            <line x1="-40" y1="0" x2="-6" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-6" y1="-5" x2="8" y2="-12" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline points="8,-12 20,-12 20,-40" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-6" y1="5" x2="8" y2="12" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline points="8,12 20,12 20,40" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polygon points="-4,5 -1,8 -5,9" fill={strokeColor} />
          </g>
        );

      case "NMOS":
      case "PMOS": {
        const isPMOS = type === "PMOS";
        return (
          <g>
            <circle cx="0" cy="0" r="16" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Gate */}
            <line x1="-40" y1="0" x2="-10" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-10" y1="-10" x2="-10" y2="10" stroke={strokeColor} strokeWidth={strokeWidth + 1} />
            {/* Channel segments */}
            <line x1="-6" y1="-10" x2="-6" y2="10" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            {/* Top terminal (20, -40) */}
            <polyline points="-6,-7 20,-7 20,-40" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Bottom terminal (20, 40) */}
            <polyline points="-6,7 20,7 20,40" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Arrow */}
            {isPMOS ? (
              <polygon points="-2,7 2,4 2,10" fill={strokeColor} />
            ) : (
              <polygon points="2,7 -2,4 -2,10" fill={strokeColor} />
            )}
          </g>
        );
      }

      case "OPAMP":
      case "OPAMP_IDEAL":
      case "OPAMP_741":
        return (
          <g>
            {/* Inputs: (-60, -20) and (-60, 20) */}
            <polyline points="-60,-20 -24,-20 -24,-10 -12,-10" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline points="-60,20 -24,20 -24,10 -12,10" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Triangle body */}
            <polygon
              points="-12,-18 16,0 -12,18"
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            {/* Output: (60, 0) */}
            <line x1="16" y1="0" x2="60" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* +/- marks */}
            <text x="-9" y="-7" fontSize="9" fontWeight="bold" fill="#000">-</text>
            <text x="-9" y="13" fontSize="9" fontWeight="bold" fill="#000">+</text>
            {/* 741 supply pins: (0, -40) and (0, 40) */}
            {(type === "OPAMP_741" || type === "OPAMP") && (
              <>
                <line x1="0" y1="-40" x2="0" y2="-9" stroke={strokeColor} strokeWidth={strokeWidth} />
                <line x1="0" y1="9" x2="0" y2="40" stroke={strokeColor} strokeWidth={strokeWidth} />
                <text x="4" y="-14" fontSize="7" fill="#888">V+</text>
                <text x="4" y="20" fontSize="7" fill="#888">V-</text>
              </>
            )}
          </g>
        );

      case "TIMER_555":
        return (
          <g>
            <rect x="-20" y="-20" width="40" height="40" rx="2" fill="#dcdcdc" stroke={strokeColor} strokeWidth={strokeWidth} />
            <circle cx="0" cy="-18" r="2.5" fill="#888" />
            <text x="0" y="2" fontSize="9" fontWeight="bold" fill="#000" textAnchor="middle">NE555</text>
            {/* Pin leads */}
            <line x1="-20" y1="-10" x2="-26" y2="-10" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-20" y1="0" x2="-26" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-20" y1="10" x2="-26" y2="10" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="20" y1="-10" x2="26" y2="-10" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="20" y1="0" x2="26" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="20" y1="10" x2="26" y2="10" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "AND_GATE":
        return (
          <g>
            <polyline points="-40,-20 -20,-20 -20,-10 -10,-10" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline points="-40,20 -20,20 -20,10 -10,10" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <path
              d="M -10 -16 L 2 -16 A 16 16 0 0 1 2 16 L -10 16 Z"
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            <line x1="16" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "NAND_GATE":
        return (
          <g>
            <polyline points="-40,-20 -20,-20 -20,-10 -10,-10" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline points="-40,20 -20,20 -20,10 -10,10" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <path
              d="M -10 -16 L 0 -16 A 16 16 0 0 1 0 16 L -10 16 Z"
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            <circle cx="16" cy="0" r="2.5" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="18.5" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "OR_GATE":
        return (
          <g>
            <polyline points="-40,-20 -20,-20 -20,-10 -8,-10" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline points="-40,20 -20,20 -20,10 -8,10" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <path
              d="M -12 -16 Q -2 -14 16 0 Q -2 14 -12 16 Q -6 0 -12 -16 Z"
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            <line x1="16" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "NOR_GATE":
        return (
          <g>
            <polyline points="-40,-20 -20,-20 -20,-10 -8,-10" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline points="-40,20 -20,20 -20,10 -8,10" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <path
              d="M -12 -16 Q -4 -14 13 0 Q -4 14 -12 16 Q -6 0 -12 -16 Z"
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            <circle cx="16" cy="0" r="2.5" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="18.5" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "NOT_GATE":
        return (
          <g>
            <line x1="-40" y1="0" x2="-10" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polygon
              points="-10,-12 10,0 -10,12"
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            <circle cx="13" cy="0" r="2.5" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="15.5" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "XOR_GATE":
        return (
          <g>
            <polyline points="-40,-20 -20,-20 -20,-10 -12,-10" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline points="-40,20 -20,20 -20,10 -12,10" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <path d="M -16 -16 Q -10 0 -16 16" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
            <path
              d="M -12 -16 Q -2 -14 16 0 Q -2 14 -12 16 Q -6 0 -12 -16 Z"
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            <line x1="16" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "BULB": {
        const v1 = pinVoltages?.[`${component.id}:1`];
        const v2 = pinVoltages?.[`${component.id}:2`];
        const diff = v1 !== undefined && v2 !== undefined ? Math.abs(v1 - v2) : 0;
        const glowOpacity = Math.min(1.0, Math.max(0, (diff - 0.5) / 10.0));
        return (
          <g>
            <line x1="-40" y1="0" x2="-12" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            {glowOpacity > 0 && (
              <circle cx="0" cy="0" r={16 + glowOpacity * 8} fill="#ffdd00" opacity={glowOpacity * 0.5} />
            )}
            <circle
              cx="0"
              cy="0"
              r="12"
              fill={glowOpacity > 0 ? "#ffffaa" : "#ffffff"}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            {/* Filament */}
            <path d="M -5 -5 L 5 5 M -5 5 L 5 -5" stroke={glowOpacity > 0 ? "#ff6600" : strokeColor} strokeWidth="1.5" />
            <line x1="12" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );
      }

      case "SEVEN_SEGMENT": {
        const isSegOn = (s: string) => (pinVoltages?.[`${component.id}:${s}`] ?? 0) > 2.0;
        const segColor = (s: string) => (isSegOn(s) ? "#ff2020" : "#2a0505");
        return (
          <g>
            <rect x="-16" y="-24" width="32" height="48" rx="2" fill="#111111" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* a: top */}
            <rect x="-8" y="-18" width="16" height="3" rx="1" fill={segColor("a")} />
            {/* b: top-right */}
            <rect x="7" y="-16" width="3" height="13" rx="1" fill={segColor("b")} />
            {/* c: bottom-right */}
            <rect x="7" y="1" width="3" height="13" rx="1" fill={segColor("c")} />
            {/* d: bottom */}
            <rect x="-8" y="13" width="16" height="3" rx="1" fill={segColor("d")} />
            {/* e: bottom-left */}
            <rect x="-10" y="1" width="3" height="13" rx="1" fill={segColor("e")} />
            {/* f: top-left */}
            <rect x="-10" y="-16" width="3" height="13" rx="1" fill={segColor("f")} />
            {/* g: middle */}
            <rect x="-8" y="-2" width="16" height="3" rx="1" fill={segColor("g")} />
          </g>
        );
      }

      case "VOLTMETER":
      case "AMMETER": {
        const unitChar = type === "VOLTMETER" ? "V" : "A";
        const { valueText, prefix } = formatMeterReadout(instrumentData);
        const modeTag = String(params["mode"] ?? "DC").toUpperCase();
        return (
          <g>
            {/* Leads at (-40, 0) and (+40, 0) matching pin offsets -2/+2 */}
            <line x1="-40" y1="0" x2="-34" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="34" y1="0" x2="40" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* EWB 5.12 double-frame digital meter box (Image-1 2.jpeg) */}
            <rect
              x="-34"
              y="-12"
              width="68"
              height="24"
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={1.6}
            />
            <rect
              x="-31"
              y="-9"
              width="62"
              height="18"
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={0.9}
            />
            <text
              x="16"
              y="4"
              fontSize="10"
              fontFamily="'Courier New', monospace"
              fontWeight="bold"
              textAnchor="end"
              fill="#000000"
            >
              {valueText}
              {prefix}
            </text>
            <text
              x="25"
              y="4"
              fontSize="11"
              fontFamily="sans-serif"
              fontWeight="bold"
              textAnchor="middle"
              fill="#000000"
            >
              {unitChar}
            </text>
            {modeTag === "AC" && (
              <text x="-28" y="4" fontSize="8" fill="#000080" fontWeight="bold">
                ~
              </text>
            )}
          </g>
        );
      }

      case "AC_CURRENT_SOURCE":
        return (
          <g>
            <line x1="0" y1="-40" x2="0" y2="-14" stroke={strokeColor} strokeWidth={strokeWidth} />
            <circle cx="0" cy="0" r="14" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Upward arrow + sine wave */}
            <line x1="0" y1="9" x2="0" y2="-8" stroke={strokeColor} strokeWidth={1.4} />
            <polygon points="0,-10 -3.5,-4 3.5,-4" fill={strokeColor} />
            <path d="M -8 2 Q -4 -3 0 2 T 8 2" fill="none" stroke={strokeColor} strokeWidth={1.2} />
            <line x1="0" y1="14" x2="0" y2="40" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "VCC":
      case "VDD":
        return (
          <g>
            <line x1="0" y1="40" x2="0" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-12" y1="0" x2="12" y2="0" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <text x="0" y="-5" fontSize="10" fontWeight="bold" textAnchor="middle" fill={strokeColor}>
              {type === "VCC" ? "Vcc" : "Vdd"}
            </text>
          </g>
        );

      case "VCVS":
      case "VCCS":
      case "CCVS":
      case "CCCS": {
        const isVoltageIn = type === "VCVS" || type === "VCCS";
        const isVoltageOut = type === "VCVS" || type === "CCVS";
        return (
          <g>
            {/* Input port pins (-40,-20) and (-40,+20) */}
            <line x1="-40" y1="-20" x2="-24" y2="-20" stroke={strokeColor} strokeWidth={1.5} />
            <line x1="-24" y1="-20" x2="-24" y2="-12" stroke={strokeColor} strokeWidth={1.5} />
            <line x1="-40" y1="20" x2="-24" y2="20" stroke={strokeColor} strokeWidth={1.5} />
            <line x1="-24" y1="20" x2="-24" y2="12" stroke={strokeColor} strokeWidth={1.5} />
            <rect x="-32" y="-12" width="16" height="24" fill="#ffffff" stroke={strokeColor} strokeWidth={1.4} />
            {isVoltageIn ? (
              <>
                <text x="-24" y="-3" fontSize="9" textAnchor="middle" fill={strokeColor}>+</text>
                <text x="-24" y="9" fontSize="9" textAnchor="middle" fill={strokeColor}>-</text>
              </>
            ) : (
              <>
                <line x1="-24" y1="8" x2="-24" y2="-6" stroke={strokeColor} strokeWidth={1.3} />
                <polygon points="-24,-9 -27,-3 -21,-3" fill={strokeColor} />
              </>
            )}

            {/* Dashed coupling line */}
            <line x1="-16" y1="0" x2="6" y2="0" stroke={strokeColor} strokeWidth={1} strokeDasharray="3 2" />

            {/* Output diamond port pins (+40,-20) and (+40,+20) */}
            <line x1="20" y1="-20" x2="40" y2="-20" stroke={strokeColor} strokeWidth={1.5} />
            <line x1="20" y1="-20" x2="20" y2="-14" stroke={strokeColor} strokeWidth={1.5} />
            <line x1="20" y1="20" x2="40" y2="20" stroke={strokeColor} strokeWidth={1.5} />
            <line x1="20" y1="20" x2="20" y2="14" stroke={strokeColor} strokeWidth={1.5} />
            <polygon
              points="20,-14 34,0 20,14 6,0"
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={1.5}
            />
            {isVoltageOut ? (
              <>
                <text x="20" y="-3" fontSize="9" textAnchor="middle" fill={strokeColor}>+</text>
                <text x="20" y="9" fontSize="9" textAnchor="middle" fill={strokeColor}>-</text>
              </>
            ) : (
              <>
                <line x1="20" y1="-7" x2="20" y2="7" stroke={strokeColor} strokeWidth={1.3} />
                <polygon points="20,9 17,3 23,3" fill={strokeColor} />
              </>
            )}
          </g>
        );
      }

      case "MULTIMETER":
      case "OSCILLOSCOPE":
      case "BODE_PLOTTER":
      case "FUNCTION_GENERATOR":
        return (
          <g>
            <rect x="-24" y="-16" width="48" height="32" rx="2" fill="#d4d0c8" stroke={strokeColor} strokeWidth={strokeWidth} />
            <rect x="-20" y="-12" width="40" height="14" fill="#000000" rx="1" />
            <text x="0" y="-2" fontSize="8" fill="#00ff00" fontFamily="monospace" textAnchor="middle">
              {type === "MULTIMETER" ? "DMM" : type === "OSCILLOSCOPE" ? "SCOPE" : type === "BODE_PLOTTER" ? "BODE" : "GEN"}
            </text>
            <circle cx="-12" cy="10" r="3" fill="#cc0000" stroke="#000" strokeWidth="0.5" />
            <circle cx="12" cy="10" r="3" fill="#000000" stroke="#000" strokeWidth="0.5" />
          </g>
        );

      default:
        return (
          <g>
            <rect x="-16" y="-12" width="32" height="24" fill="#f0f0f0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <text x="0" y="4" fontSize="8" textAnchor="middle" fill={strokeColor}>{(type as string).substring(0, 4)}</text>
          </g>
        );
    }
  };

  const getParamLabel = () => {
    if (!params) return "";
    if (type === "VOLTMETER" || type === "AMMETER") return "";
    if (params["resistance"]) return params["resistance"];
    if (params["capacitance"]) return params["capacitance"];
    if (params["inductance"]) return params["inductance"];
    if (params["voltage"]) return params["voltage"];
    if (params["current"]) return params["current"];
    if (params["transconductance"]) return `${params["transconductance"]} mho`;
    if (params["transresistance"]) return `${params["transresistance"]} Ohm`;
    if (params["gain"]) return `x${params["gain"]}`;
    if (params["model"]) return params["model"];
    if (params["percent"]) return `${params["percent"]}%`;
    if (params["state"]) return params["state"].toUpperCase();
    return "";
  };

  const paramLabel = getParamLabel();

  return (
    <g id={`symbol-${component.id}`} transform={`rotate(${rotation})`}>
      {renderShape()}
      {/* Component ID and Label */}
      <text
        x="0"
        y="-18"
        fontSize="10"
        fontWeight="bold"
        textAnchor="middle"
        fill="#000080"
        transform={rotation === 90 || rotation === 270 ? `rotate(-${rotation})` : undefined}
      >
        {component.label || component.id}
      </text>
      {paramLabel && (
        <text
          x="0"
          y="24"
          fontSize="9"
          textAnchor="middle"
          fill="#333333"
          transform={rotation === 90 || rotation === 270 ? `rotate(-${rotation})` : undefined}
        >
          {paramLabel}
        </text>
      )}
    </g>
  );
};

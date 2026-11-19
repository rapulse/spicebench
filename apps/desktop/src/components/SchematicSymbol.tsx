import React from "react";
import type { Component } from "@spicebench/core";

interface SchematicSymbolProps {
  component: Component;
  isSelected?: boolean;
}

export const SchematicSymbol: React.FC<SchematicSymbolProps> = ({ component, isSelected }) => {
  const { type, rotation = 0, params } = component;
  const strokeColor = isSelected ? "#0000ff" : "#000000";
  const strokeWidth = isSelected ? 2.5 : 2;

  // Render symbol centered at local (0, 0)
  const renderShape = () => {
    switch (type) {
      case "RESISTOR":
        return (
          <g>
            {/* Terminal leads: (-20, 0) to (-12, 0) and (12, 0) to (20, 0) */}
            <line x1="-20" y1="0" x2="-12" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Zigzag body */}
            <polyline
              points="-12,0 -9,-6 -4,6 1,-6 6,6 9,-6 12,0"
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
            <line x1="12" y1="0" x2="20" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "CAPACITOR":
        return (
          <g>
            <line x1="-20" y1="0" x2="-4" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-4" y1="-10" x2="-4" y2="10" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <line x1="4" y1="-10" x2="4" y2="10" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <line x1="4" y1="0" x2="20" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "POLARIZED_CAPACITOR":
        return (
          <g>
            <line x1="-20" y1="0" x2="-4" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-4" y1="-10" x2="-4" y2="10" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <path d="M 4 -10 Q 0 0 4 10" fill="none" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <line x1="4" y1="0" x2="20" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <text x="-12" y="-6" fontSize="9" fill={strokeColor} fontWeight="bold">+</text>
          </g>
        );

      case "INDUCTOR":
        return (
          <g>
            <line x1="-20" y1="0" x2="-12" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <path
              d="M -12 0 A 3 3 0 0 1 -6 0 A 3 3 0 0 1 0 0 A 3 3 0 0 1 6 0 A 3 3 0 0 1 12 0"
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            <line x1="12" y1="0" x2="20" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
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
            {/* Battery / DC source: positive (long plate), negative (short plate) */}
            <line x1="-20" y1="0" x2="-4" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-4" y1="-12" x2="-4" y2="12" stroke={strokeColor} strokeWidth={strokeWidth + 1} />
            <line x1="4" y1="-6" x2="4" y2="6" stroke={strokeColor} strokeWidth={strokeWidth + 2} />
            <line x1="4" y1="0" x2="20" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <text x="-14" y="-8" fontSize="10" fill="#cc0000" fontWeight="bold">+</text>
            <text x="10" y="-8" fontSize="10" fill="#0000cc" fontWeight="bold">-</text>
          </g>
        );

      case "AC_VOLTAGE_SOURCE":
        return (
          <g>
            <circle cx="0" cy="0" r="14" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-20" y1="0" x2="-14" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="14" y1="0" x2="20" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Sine wave ~ */}
            <path d="M -8 0 Q -4 -7 0 0 Q 4 7 8 0" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "DC_CURRENT_SOURCE":
        return (
          <g>
            <circle cx="0" cy="0" r="14" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-20" y1="0" x2="-14" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="14" y1="0" x2="20" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Arrow pointing right */}
            <line x1="-6" y1="0" x2="6" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polyline points="2,-4 6,0 2,4" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "DIODE":
        return (
          <g>
            <line x1="-20" y1="0" x2="-8" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polygon points="-8,-8 8,0 -8,8" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="8" y1="-8" x2="8" y2="8" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <line x1="8" y1="0" x2="20" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "ZENER_DIODE":
        return (
          <g>
            <line x1="-20" y1="0" x2="-8" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polygon points="-8,-8 8,0 -8,8" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Zener cathode bent line */}
            <path d="M 5 -8 L 8 -8 L 8 8 L 11 8" fill="none" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <line x1="8" y1="0" x2="20" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );

      case "LED":
        return (
          <g>
            <line x1="-20" y1="0" x2="-8" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polygon points="-8,-8 8,0 -8,8" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="8" y1="-8" x2="8" y2="8" stroke={strokeColor} strokeWidth={strokeWidth + 0.5} />
            <line x1="8" y1="0" x2="20" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Light emission arrows */}
            <line x1="-2" y1="-10" x2="4" y2="-16" stroke="#ff8800" strokeWidth="1.5" />
            <polyline points="1,-16 4,-16 4,-13" fill="none" stroke="#ff8800" strokeWidth="1.5" />
            <line x1="4" y1="-7" x2="10" y2="-13" stroke="#ff8800" strokeWidth="1.5" />
            <polyline points="7,-13 10,-13 10,-10" fill="none" stroke="#ff8800" strokeWidth="1.5" />
          </g>
        );

      case "BJT_NPN":
        return (
          <g>
            <circle cx="0" cy="0" r="16" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Base bar */}
            <line x1="-6" y1="-10" x2="-6" y2="10" stroke={strokeColor} strokeWidth={strokeWidth + 1} />
            {/* Base lead */}
            <line x1="-20" y1="0" x2="-6" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Collector */}
            <line x1="-6" y1="-5" x2="8" y2="-12" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="8" y1="-12" x2="8" y2="-20" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Emitter with arrow pointing OUT */}
            <line x1="-6" y1="5" x2="8" y2="12" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="8" y1="12" x2="8" y2="20" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polygon points="7,10 8,14 4,13" fill={strokeColor} />
          </g>
        );

      case "BJT_PNP":
        return (
          <g>
            <circle cx="0" cy="0" r="16" fill="#ffffff" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="-6" y1="-10" x2="-6" y2="10" stroke={strokeColor} strokeWidth={strokeWidth + 1} />
            <line x1="-20" y1="0" x2="-6" y2="0" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Collector */}
            <line x1="-6" y1="-5" x2="8" y2="-12" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="8" y1="-12" x2="8" y2="-20" stroke={strokeColor} strokeWidth={strokeWidth} />
            {/* Emitter with arrow pointing IN */}
            <line x1="-6" y1="5" x2="8" y2="12" stroke={strokeColor} strokeWidth={strokeWidth} />
            <line x1="8" y1="12" x2="8" y2="20" stroke={strokeColor} strokeWidth={strokeWidth} />
            <polygon points="-4,5 -1,8 -5,9" fill={strokeColor} />
          </g>
        );

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
            {/* Terminals */}
            <circle cx="-12" cy="10" r="3" fill="#cc0000" stroke="#000" strokeWidth="0.5" />
            <circle cx="12" cy="10" r="3" fill="#000000" stroke="#000" strokeWidth="0.5" />
          </g>
        );

      default:
        return (
          <g>
            <rect x="-16" y="-12" width="32" height="24" fill="#f0f0f0" stroke={strokeColor} strokeWidth={strokeWidth} />
            <text x="0" y="4" fontSize="8" textAnchor="middle" fill={strokeColor}>{type.substring(0, 4)}</text>
          </g>
        );
    }
  };

  // Determine parameter label text to display below component
  const getParamLabel = () => {
    if (!params) return "";
    if (params["resistance"]) return params["resistance"];
    if (params["capacitance"]) return params["capacitance"];
    if (params["inductance"]) return params["inductance"];
    if (params["voltage"]) return params["voltage"];
    if (params["current"]) return params["current"];
    if (params["model"]) return params["model"];
    return "";
  };

  const paramLabel = getParamLabel();

  return (
    <g id={`symbol-${component.id}`} transform={`rotate(${rotation})`}>
      {renderShape()}
      {/* Component ID and Label */}
      <text
        x="0"
        y="-16"
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
          y="22"
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

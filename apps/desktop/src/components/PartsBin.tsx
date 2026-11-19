import React, { useState } from "react";
import type { ComponentType } from "@spicebench/core";

interface PartsBinProps {
  onSelectComponent: (type: ComponentType) => void;
}

interface PartDef {
  type: ComponentType;
  label: string;
  icon: string;
}

export const PartsBin: React.FC<PartsBinProps> = ({ onSelectComponent }) => {
  const [activeTab, setActiveTab] = useState<string>("Basic");

  const categories: Record<string, PartDef[]> = {
    Sources: [
      { type: "GROUND", label: "Ground", icon: "⏚" },
      { type: "DC_VOLTAGE_SOURCE", label: "DC Source", icon: "🔋" },
      { type: "AC_VOLTAGE_SOURCE", label: "AC Source", icon: "⚡" },
      { type: "DC_CURRENT_SOURCE", label: "Current Src", icon: "➔" },
      { type: "PULSE_VOLTAGE_SOURCE", label: "Pulse/Clock", icon: "⎍" },
    ],
    Basic: [
      { type: "RESISTOR", label: "Resistor", icon: "∿" },
      { type: "CAPACITOR", label: "Capacitor", icon: "⫠" },
      { type: "POLARIZED_CAPACITOR", label: "Cap (Pol)", icon: "⫡" },
      { type: "INDUCTOR", label: "Inductor", icon: "∱" },
      { type: "SWITCH_SPST", label: "Switch", icon: "⌿" },
      { type: "POTENTIOMETER", label: "Potentiometer", icon: "⌥" },
    ],
    Diodes: [
      { type: "DIODE", label: "Diode", icon: "▷|" },
      { type: "ZENER_DIODE", label: "Zener", icon: "▷⫾" },
      { type: "LED", label: "LED", icon: "▷|⇗" },
    ],
    Transistors: [
      { type: "BJT_NPN", label: "BJT NPN", icon: "◓" },
      { type: "BJT_PNP", label: "BJT PNP", icon: "◑" },
      { type: "NMOS", label: "NMOS", icon: "⊣" },
      { type: "PMOS", label: "PMOS", icon: "⊢" },
    ],
    Analog: [
      { type: "OPAMP_IDEAL", label: "Op-Amp (Ideal)", icon: "▷" },
      { type: "OPAMP_741", label: "LM741", icon: "▷+" },
      { type: "TIMER_555", label: "555 Timer", icon: "⌗" },
    ],
    Digital: [
      { type: "AND_GATE", label: "AND Gate", icon: "&" },
      { type: "OR_GATE", label: "OR Gate", icon: "≥1" },
      { type: "NOT_GATE", label: "NOT Inverter", icon: "1°" },
      { type: "NAND_GATE", label: "NAND Gate", icon: "&°" },
      { type: "NOR_GATE", label: "NOR Gate", icon: "≥1°" },
      { type: "XOR_GATE", label: "XOR Gate", icon: "=1" },
    ],
    Indicators: [
      { type: "BULB", label: "Lamp/Bulb", icon: "💡" },
      { type: "SEVEN_SEGMENT", label: "7-Segment", icon: "🈲" },
      { type: "LED", label: "Red LED", icon: "🔴" },
    ],
    Instruments: [
      { type: "MULTIMETER", label: "Multimeter", icon: "📟" },
      { type: "FUNCTION_GENERATOR", label: "Func Gen", icon: "📈" },
      { type: "OSCILLOSCOPE", label: "Oscilloscope", icon: "📺" },
      { type: "BODE_PLOTTER", label: "Bode Plotter", icon: "📉" },
    ],
  };

  const currentParts = categories[activeTab] || [];

  return (
    <div className="ewb-parts-bin">
      <div className="ewb-bin-tabs">
        {Object.keys(categories).map((tab) => (
          <div
            key={tab}
            className={`ewb-bin-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </div>
        ))}
      </div>

      <div className="ewb-bin-shelf">
        {currentParts.map((part) => (
          <div
            key={part.type}
            className="ewb-part-item"
            title={`Drag to schematic or click to place: ${part.label}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/spicebench-component", part.type);
              e.dataTransfer.setData("text/plain", part.type);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onSelectComponent(part.type)}
          >
            <span style={{ fontSize: "14px", lineHeight: 1 }}>{part.icon}</span>
            <span style={{ fontSize: "9px", marginTop: "2px" }}>{part.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

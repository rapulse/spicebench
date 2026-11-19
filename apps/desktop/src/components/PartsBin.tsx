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

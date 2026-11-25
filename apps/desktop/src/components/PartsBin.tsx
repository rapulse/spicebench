import React, { useState } from "react";
import type { ComponentType } from "@spicebench/core";
import {
  BinIconFavorites,
  BinIconSources,
  BinIconBasic,
  BinIconDiodes,
  BinIconTransistors,
  BinIconAnalogIC,
  BinIconMixedIC,
  BinIconDigitalIC,
  BinIconLogicGates,
  BinIconDigital,
  BinIconIndicators,
  BinIconControls,
  BinIconMisc,
  BinIconInstruments,
} from "./EwbIcons";

interface PartsBinProps {
  onSelectComponent: (type: ComponentType) => void;
}

interface PartDef {
  type: ComponentType;
  label: string;
  icon: string;
}

interface CategoryDef {
  id: string;
  label: string;
  renderIcon: () => React.ReactNode;
  parts: PartDef[];
}

// Exact 14-bin order from EWB 5.12 (Image-1.jpeg)
const CATEGORIES: CategoryDef[] = [
  {
    id: "Favorites",
    label: "Favorites",
    renderIcon: () => <BinIconFavorites />,
    parts: [
      { type: "GROUND", label: "Ground", icon: "⏚" },
      { type: "DC_VOLTAGE_SOURCE", label: "DC Source", icon: "⏦" },
      { type: "RESISTOR", label: "Resistor", icon: "∿" },
      { type: "CAPACITOR", label: "Capacitor", icon: "⫠" },
      { type: "MULTIMETER", label: "Multimeter", icon: "M" },
      { type: "OSCILLOSCOPE", label: "Oscilloscope", icon: "⊞" },
    ],
  },
  {
    id: "Sources",
    label: "Sources",
    renderIcon: () => <BinIconSources />,
    parts: [
      { type: "GROUND", label: "Ground", icon: "⏚" },
      { type: "DC_VOLTAGE_SOURCE", label: "Battery", icon: "⏦" },
      { type: "DC_CURRENT_SOURCE", label: "DC Current", icon: "↑" },
      { type: "AC_VOLTAGE_SOURCE", label: "AC Voltage", icon: "∿" },
      { type: "AC_CURRENT_SOURCE", label: "AC Current", icon: "↑~" },
      { type: "VCVS", label: "VCVS", icon: "◇V" },
      { type: "VCCS", label: "VCCS", icon: "◇I" },
      { type: "CCVS", label: "CCVS", icon: "I◇V" },
      { type: "CCCS", label: "CCCS", icon: "I◇I" },
      { type: "VCC", label: "Vcc", icon: "Vcc" },
      { type: "VDD", label: "Vdd", icon: "Vdd" },
      { type: "PULSE_VOLTAGE_SOURCE", label: "Clock/Pulse", icon: "⎍" },
    ],
  },
  {
    id: "Basic",
    label: "Basic",
    renderIcon: () => <BinIconBasic />,
    parts: [
      { type: "RESISTOR", label: "Resistor", icon: "∿" },
      { type: "CAPACITOR", label: "Capacitor", icon: "⫠" },
      { type: "POLARIZED_CAPACITOR", label: "Cap (Pol)", icon: "⫡" },
      { type: "INDUCTOR", label: "Inductor", icon: "∱" },
      { type: "SWITCH_SPST", label: "Switch", icon: "⌿" },
      { type: "POTENTIOMETER", label: "Potentiometer", icon: "⌥" },
    ],
  },
  {
    id: "Diodes",
    label: "Diodes",
    renderIcon: () => <BinIconDiodes />,
    parts: [
      { type: "DIODE", label: "Diode", icon: "▷|" },
      { type: "ZENER_DIODE", label: "Zener", icon: "▷⫾" },
      { type: "LED", label: "LED", icon: "▷|⇗" },
    ],
  },
  {
    id: "Transistors",
    label: "Transistors",
    renderIcon: () => <BinIconTransistors />,
    parts: [
      { type: "BJT_NPN", label: "BJT NPN", icon: "◓" },
      { type: "BJT_PNP", label: "BJT PNP", icon: "◑" },
      { type: "NMOS", label: "NMOS", icon: "⊣" },
      { type: "PMOS", label: "PMOS", icon: "⊢" },
    ],
  },
  {
    id: "Analog",
    label: "Analog ICs",
    renderIcon: () => <BinIconAnalogIC />,
    parts: [
      { type: "OPAMP_IDEAL", label: "Op-Amp (Ideal)", icon: "▷" },
      { type: "OPAMP_741", label: "LM741", icon: "▷+" },
    ],
  },
  {
    id: "Mixed",
    label: "Mixed ICs",
    renderIcon: () => <BinIconMixedIC />,
    parts: [{ type: "TIMER_555", label: "555 Timer", icon: "555" }],
  },
  {
    id: "DigitalICs",
    label: "Digital ICs",
    renderIcon: () => <BinIconDigitalIC />,
    parts: [],
  },
  {
    id: "LogicGates",
    label: "Logic Gates",
    renderIcon: () => <BinIconLogicGates />,
    parts: [
      { type: "AND_GATE", label: "AND Gate", icon: "&" },
      { type: "OR_GATE", label: "OR Gate", icon: "≥1" },
      { type: "NOT_GATE", label: "NOT Inverter", icon: "1°" },
      { type: "NAND_GATE", label: "NAND Gate", icon: "&°" },
      { type: "NOR_GATE", label: "NOR Gate", icon: "≥1°" },
      { type: "XOR_GATE", label: "XOR Gate", icon: "=1" },
    ],
  },
  {
    id: "Digital",
    label: "Digital",
    renderIcon: () => <BinIconDigital />,
    parts: [],
  },
  {
    id: "Indicators",
    label: "Indicators",
    renderIcon: () => <BinIconIndicators />,
    parts: [
      { type: "VOLTMETER", label: "Voltmeter", icon: "V" },
      { type: "AMMETER", label: "Ammeter", icon: "A" },
      { type: "BULB", label: "Bulb", icon: "⊗" },
      { type: "SEVEN_SEGMENT", label: "7-Segment", icon: "8" },
      { type: "LED", label: "Red LED", icon: "◉" },
    ],
  },
  {
    id: "Controls",
    label: "Controls",
    renderIcon: () => <BinIconControls />,
    parts: [],
  },
  {
    id: "Miscellaneous",
    label: "Miscellaneous",
    renderIcon: () => <BinIconMisc />,
    parts: [],
  },
  {
    id: "Instruments",
    label: "Instruments",
    renderIcon: () => <BinIconInstruments />,
    parts: [
      { type: "MULTIMETER", label: "Multimeter", icon: "M" },
      { type: "FUNCTION_GENERATOR", label: "Func Gen", icon: "∿" },
      { type: "OSCILLOSCOPE", label: "Oscilloscope", icon: "⊞" },
      { type: "BODE_PLOTTER", label: "Bode Plotter", icon: "◿" },
    ],
  },
];

export const PartsBin: React.FC<PartsBinProps> = ({ onSelectComponent }) => {
  const [openBinId, setOpenBinId] = useState<string | null>(null);
  const openCategory = CATEGORIES.find((c) => c.id === openBinId) ?? null;

  return (
    <div className="ewb-parts-bin" style={{ position: "relative" }}>
      {/* EWB 5.12 Parts Bin Toolbar (14 icon buttons with dropdown arrow) */}
      <div className="ewb-bin-toolbar">
        {CATEGORIES.map((cat) => {
          const isOpen = openBinId === cat.id;
          return (
            <button
              key={cat.id}
              className={`ewb-bin-cat-btn ${isOpen ? "active" : ""}`}
              title={cat.label}
              onClick={() => setOpenBinId(isOpen ? null : cat.id)}
            >
              <span className="ewb-bin-cat-icon">{cat.renderIcon()}</span>
              <span className="ewb-bin-cat-arrow">▼</span>
            </button>
          );
        })}
      </div>

      {/* Floating Parts Bin Window (matches EWB 5.12 Image-1.jpeg) */}
      {openCategory && (
        <div className="ewb-floating-bin window">
          <div className="title-bar" style={{ padding: "2px 4px" }}>
            <div className="title-bar-text" style={{ fontSize: "11px" }}>
              {openCategory.label}
            </div>
            <div className="title-bar-controls">
              <button aria-label="Close" onClick={() => setOpenBinId(null)} />
            </div>
          </div>
          <div className="ewb-floating-bin-grid">
            {openCategory.parts.length === 0 ? (
              <div style={{ padding: "8px 12px", fontSize: "11px", color: "#555555" }}>
                No components in this bin yet.
              </div>
            ) : (
              openCategory.parts.map((part) => (
                <div
                  key={`${openCategory.id}-${part.type}`}
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
                  <span style={{ fontSize: "13px", lineHeight: 1, fontWeight: "bold" }}>
                    {part.icon}
                  </span>
                  <span style={{ fontSize: "9px", marginTop: "2px", textAlign: "center" }}>
                    {part.label}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

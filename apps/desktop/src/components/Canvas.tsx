import React, { useState, useRef, useCallback } from "react";
import type { CircuitProject, Component, Wire, Junction } from "@spicebench/core";
import type { SimulationSummary } from "@spicebench/mcp";
import { SchematicSymbol } from "./SchematicSymbol";

interface CanvasProps {
  circuit: CircuitProject;
  simulation: SimulationSummary | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCursorMove: (gridPos: { x: number; y: number }) => void;
}

const GRID_SPACING = 20; // 20 pixels per grid unit

export const Canvas: React.FC<CanvasProps> = ({
  circuit,
  simulation,
  selectedId,
  onSelect,
  onCursorMove,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan and Zoom state
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 60, y: 60 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Handle Zoom via Wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prevZoom) => {
      const nextZoom = Math.min(3.0, Math.max(0.4, prevZoom * zoomFactor));
      return nextZoom;
    });
  }, []);

  // Handle Pan via mouse drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 0 && e.altKey) {
      // Middle click or Alt+Left click to pan
      e.preventDefault();
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    } else if (e.target === e.currentTarget) {
      onSelect(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    }

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - pan.x;
      const mouseY = e.clientY - rect.top - pan.y;

      // Convert pixel position to logical grid coordinates
      const gridX = Math.round(mouseX / (GRID_SPACING * zoom));
      const gridY = Math.round(mouseY / (GRID_SPACING * zoom));
      onCursorMove({ x: gridX, y: gridY });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  return (
    <div
      ref={containerRef}
      className="ewb-workspace-container"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <svg className="ewb-canvas-svg">
        <defs>
          {/* Dot grid pattern */}
          <pattern
            id="ewb-grid-pattern"
            width={GRID_SPACING * zoom}
            height={GRID_SPACING * zoom}
            patternUnits="userSpaceOnUse"
            x={pan.x % (GRID_SPACING * zoom)}
            y={pan.y % (GRID_SPACING * zoom)}
          >
            <circle
              cx={(GRID_SPACING * zoom) / 2}
              cy={(GRID_SPACING * zoom) / 2}
              r={1 * Math.max(0.8, zoom)}
              fill="#c8c8c8"
            />
          </pattern>
        </defs>

        {/* Background dot grid */}
        <rect width="100%" height="100%" fill="url(#ewb-grid-pattern)" />

        {/* Circuit Contents Group transformed by Pan and Zoom */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* 1. Wires */}
          {circuit.wires.map((wire: Wire) => {
            const pointsStr = wire.points
              .map((p) => `${p.x * GRID_SPACING},${p.y * GRID_SPACING}`)
              .join(" ");

            const isWireSelected = selectedId === wire.id;
            return (
              <g key={wire.id} onClick={(e) => { e.stopPropagation(); onSelect(wire.id); }}>
                {/* Thick invisible line for easier click detection */}
                <polyline
                  points={pointsStr}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={10}
                  cursor="pointer"
                />
                {/* Visible orthogonal wire */}
                <polyline
                  points={pointsStr}
                  fill="none"
                  stroke={isWireSelected ? "#0000ff" : wire.color || "#000000"}
                  strokeWidth={isWireSelected ? 2.5 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {/* 2. Junction Dots */}
          {circuit.junctions.map((junc: Junction) => (
            <circle
              key={junc.id}
              cx={junc.position.x * GRID_SPACING}
              cy={junc.position.y * GRID_SPACING}
              r={3.5}
              fill="#000000"
            />
          ))}

          {/* 3. Components */}
          {circuit.components.map((comp: Component) => {
            const isCompSelected = selectedId === comp.id;
            const px = comp.position.x * GRID_SPACING;
            const py = comp.position.y * GRID_SPACING;

            return (
              <g
                key={comp.id}
                transform={`translate(${px}, ${py})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(comp.id);
                }}
                cursor="pointer"
              >
                <SchematicSymbol component={comp} isSelected={isCompSelected} />

                {/* Live Simulation Node Voltage Overlays when simulation is active */}
                {simulation?.pinVoltages && (
                  <g>
                    {comp.type === "RESISTOR" && (
                      <>
                        {simulation.pinVoltages[`${comp.id}:1`] !== undefined && (
                          <rect
                            x="-32"
                            y="-10"
                            width="24"
                            height="12"
                            fill="#ffffcc"
                            stroke="#808000"
                            strokeWidth="0.5"
                            rx="1"
                          />
                        )}
                        {simulation.pinVoltages[`${comp.id}:1`] !== undefined && (
                          <text x="-20" y="-1" fontSize="8" fill="#000" textAnchor="middle">
                            {simulation.pinVoltages[`${comp.id}:1`]!.toFixed(2)}V
                          </text>
                        )}

                        {simulation.pinVoltages[`${comp.id}:2`] !== undefined && (
                          <rect
                            x="10"
                            y="-10"
                            width="24"
                            height="12"
                            fill="#ffffcc"
                            stroke="#808000"
                            strokeWidth="0.5"
                            rx="1"
                          />
                        )}
                        {simulation.pinVoltages[`${comp.id}:2`] !== undefined && (
                          <text x="22" y="-1" fontSize="8" fill="#000" textAnchor="middle">
                            {simulation.pinVoltages[`${comp.id}:2`]!.toFixed(2)}V
                          </text>
                        )}
                      </>
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

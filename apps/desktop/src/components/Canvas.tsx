import React, { useState, useRef, useCallback } from "react";
import type { CircuitProject, Component, Wire, Junction, ComponentType } from "@spicebench/core";
import type { SimulationSummary } from "@spicebench/mcp";
import { SchematicSymbol } from "./SchematicSymbol";

interface CanvasProps {
  circuit: CircuitProject;
  simulation: SimulationSummary | null;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onCursorMove: (gridPos: { x: number; y: number }) => void;
  onDropComponent: (type: ComponentType, gridPos: { x: number; y: number }) => void;
  onMoveComponent: (id: string, newPos: { x: number; y: number }) => void;
}

const GRID_SPACING = 20; // 20 pixels per logical grid unit

interface DraggedComponentState {
  id: string;
  startX: number;
  startY: number;
  startClientX: number;
  startClientY: number;
}

interface MarqueeState {
  start: { x: number; y: number };
  current: { x: number; y: number };
}

export const Canvas: React.FC<CanvasProps> = ({
  circuit,
  simulation,
  selectedIds,
  onSelect,
  onCursorMove,
  onDropComponent,
  onMoveComponent,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan and Zoom
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 60, y: 60 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Component Dragging
  const [draggingComp, setDraggingComp] = useState<DraggedComponentState | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Marquee Selection
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);

  // Convert mouse event to logical grid coordinates
  const getGridCoordsFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = clientX - rect.left - pan.x;
      const mouseY = clientY - rect.top - pan.y;
      const gridX = Math.round(mouseX / (GRID_SPACING * zoom));
      const gridY = Math.round(mouseY / (GRID_SPACING * zoom));
      return { x: gridX, y: gridY };
    },
    [pan, zoom]
  );

  // Convert mouse event to local SVG workspace coordinates (unscaled)
  const getLocalCoordsFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  // Handle Zoom via Wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prevZoom) => {
      return Math.min(3.0, Math.max(0.4, prevZoom * zoomFactor));
    });
  }, []);

  // Handle Drag & Drop from PartsBin
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const typeStr =
      e.dataTransfer.getData("application/spicebench-component") ||
      e.dataTransfer.getData("text/plain");

    if (typeStr) {
      const gridPos = getGridCoordsFromEvent(e.clientX, e.clientY);
      onDropComponent(typeStr as ComponentType, gridPos);
    }
  };

  // Mouse Down on background or components
  const handleMouseDown = (e: React.MouseEvent) => {
    // 1. Pan with Middle Button or Alt + Left Click
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // 2. Click on empty background: start marquee selection box
    if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "rect") {
      const local = getLocalCoordsFromEvent(e.clientX, e.clientY);
      setMarquee({ start: local, current: local });

      if (!e.shiftKey) {
        onSelect([]);
      }
    }
  };

  // Mouse Move
  const handleMouseMove = (e: React.MouseEvent) => {
    // Update cursor position in status bar
    const gridPos = getGridCoordsFromEvent(e.clientX, e.clientY);
    onCursorMove(gridPos);

    // 1. Handle Panning
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
      return;
    }

    // 2. Handle Component Dragging
    if (draggingComp) {
      const deltaX = Math.round((e.clientX - draggingComp.startClientX) / (GRID_SPACING * zoom));
      const deltaY = Math.round((e.clientY - draggingComp.startClientY) / (GRID_SPACING * zoom));
      setDragOffset({ dx: deltaX, dy: deltaY });
      return;
    }

    // 3. Handle Marquee Selection
    if (marquee) {
      const local = getLocalCoordsFromEvent(e.clientX, e.clientY);
      setMarquee((prev) => (prev ? { ...prev, current: local } : null));
    }
  };

  // Mouse Up
  const handleMouseUp = (e: React.MouseEvent) => {
    if (isPanning) {
      setIsPanning(false);
    }

    // Finish Component Drag
    if (draggingComp) {
      const deltaX = Math.round((e.clientX - draggingComp.startClientX) / (GRID_SPACING * zoom));
      const deltaY = Math.round((e.clientY - draggingComp.startClientY) / (GRID_SPACING * zoom));

      if (deltaX !== 0 || deltaY !== 0) {
        const newX = draggingComp.startX + deltaX;
        const newY = draggingComp.startY + deltaY;
        onMoveComponent(draggingComp.id, { x: newX, y: newY });
      }

      setDraggingComp(null);
      setDragOffset({ dx: 0, dy: 0 });
    }

    // Finish Marquee Selection
    if (marquee) {
      const x1 = Math.min(marquee.start.x, marquee.current.x);
      const x2 = Math.max(marquee.start.x, marquee.current.x);
      const y1 = Math.min(marquee.start.y, marquee.current.y);
      const y2 = Math.max(marquee.start.y, marquee.current.y);

      // Only perform marquee if dragged more than 5 pixels
      if (Math.abs(x2 - x1) > 5 || Math.abs(y2 - y1) > 5) {
        const selected = circuit.components
          .filter((comp) => {
            const cx = comp.position.x * GRID_SPACING;
            const cy = comp.position.y * GRID_SPACING;
            return cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2;
          })
          .map((c) => c.id);

        if (e.shiftKey) {
          const merged = Array.from(new Set([...selectedIds, ...selected]));
          onSelect(merged);
        } else {
          onSelect(selected);
        }
      }
      setMarquee(null);
    }
  };

  // Component Mouse Down: start drag & select
  const handleComponentMouseDown = (e: React.MouseEvent, comp: Component) => {
    e.stopPropagation();

    if (e.button === 0 && !e.altKey) {
      // If holding shift, toggle in selection
      if (e.shiftKey) {
        if (selectedIds.includes(comp.id)) {
          onSelect(selectedIds.filter((id) => id !== comp.id));
        } else {
          onSelect([...selectedIds, comp.id]);
        }
      } else {
        // Normal single click: select if not already selected
        if (!selectedIds.includes(comp.id)) {
          onSelect([comp.id]);
        }
      }

      // Start drag
      setDraggingComp({
        id: comp.id,
        startX: comp.position.x,
        startY: comp.position.y,
        startClientX: e.clientX,
        startClientY: e.clientY,
      });
      setDragOffset({ dx: 0, dy: 0 });
    }
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
      onDragOver={handleDragOver}
      onDrop={handleDrop}
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

            const isWireSelected = selectedIds.includes(wire.id);
            return (
              <g
                key={wire.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(e.shiftKey ? [...selectedIds, wire.id] : [wire.id]);
                }}
              >
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
            const isCompSelected = selectedIds.includes(comp.id);
            const isBeingDragged = draggingComp?.id === comp.id;

            const posX = (comp.position.x + (isBeingDragged ? dragOffset.dx : 0)) * GRID_SPACING;
            const posY = (comp.position.y + (isBeingDragged ? dragOffset.dy : 0)) * GRID_SPACING;

            return (
              <g
                key={comp.id}
                transform={`translate(${posX}, ${posY})`}
                onMouseDown={(e) => handleComponentMouseDown(e, comp)}
                cursor={isBeingDragged ? "grabbing" : "grab"}
              >
                <SchematicSymbol component={comp} isSelected={isCompSelected} />

                {/* Live Simulation Node Voltage Overlays when simulation is active */}
                {simulation?.pinVoltages && (
                  <g pointerEvents="none">
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

          {/* 4. Marquee Selection Rectangle */}
          {marquee && (
            <rect
              x={Math.min(marquee.start.x, marquee.current.x)}
              y={Math.min(marquee.start.y, marquee.current.y)}
              width={Math.abs(marquee.current.x - marquee.start.x)}
              height={Math.abs(marquee.current.y - marquee.start.y)}
              fill="rgba(0, 0, 255, 0.08)"
              stroke="#0000ff"
              strokeWidth={1 / zoom}
              strokeDasharray={`${3 / zoom},${3 / zoom}`}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>
    </div>
  );
};

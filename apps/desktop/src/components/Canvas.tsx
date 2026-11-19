import React, { useState, useRef, useCallback, useEffect } from "react";
import type {
  CircuitProject,
  Component,
  Wire,
  Junction,
  ComponentType,
  Position,
} from "@spicebench/core";
import {
  getComponentPins,
  getAbsolutePinPosition,
  createSimpleOrthogonalRoute,
} from "@spicebench/core";
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
  onConnectPins: (options: {
    from: { componentId: string; pinId: string };
    to: { componentId: string; pinId: string };
  }) => void;
  onConnectToWire: (options: {
    from: { componentId: string; pinId: string };
    targetWireId: string;
    hitPoint: { x: number; y: number };
  }) => void;
  onWiringStatusChange?: (status: string | null) => void;
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

interface WiringDraft {
  from: { componentId: string; pinId: string };
  startPos: Position;
}

// Find nearest point on orthogonal wire polyline to given grid coordinate
export function findNearestPointOnWire(
  wire: Wire,
  pos: { x: number; y: number }
): { point: Position; distance: number } | null {
  if (!wire.points || wire.points.length < 2) return null;

  let bestPoint: Position | null = null;
  let minDistance = Infinity;

  for (let i = 0; i < wire.points.length - 1; i++) {
    const p1 = wire.points[i]!;
    const p2 = wire.points[i + 1]!;

    let projX = pos.x;
    let projY = pos.y;

    if (p1.y === p2.y) {
      // Horizontal segment
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      projX = Math.max(minX, Math.min(maxX, Math.round(pos.x)));
      projY = p1.y;
    } else if (p1.x === p2.x) {
      // Vertical segment
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      projX = p1.x;
      projY = Math.max(minY, Math.min(maxY, Math.round(pos.y)));
    } else {
      continue;
    }

    const dist = Math.hypot(pos.x - projX, pos.y - projY);
    if (dist < minDistance) {
      minDistance = dist;
      bestPoint = { x: projX, y: projY };
    }
  }

  return bestPoint ? { point: bestPoint, distance: minDistance } : null;
}

export const Canvas: React.FC<CanvasProps> = ({
  circuit,
  simulation,
  selectedIds,
  onSelect,
  onCursorMove,
  onDropComponent,
  onMoveComponent,
  onConnectPins,
  onConnectToWire,
  onWiringStatusChange,
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

  // Wiring State (Interactive Pin-to-Pin and Wire Splitting)
  const [wiring, setWiring] = useState<WiringDraft | null>(null);
  const [mouseGridPos, setMouseGridPos] = useState<Position>({ x: 0, y: 0 });
  const [hoveredPin, setHoveredPin] = useState<{
    componentId: string;
    pinId: string;
    pos: Position;
  } | null>(null);
  const [hoveredWireHit, setHoveredWireHit] = useState<{
    wireId: string;
    hitPoint: Position;
  } | null>(null);

  // Convert client coordinate to logical grid coordinates
  const getGridCoordsFromEvent = useCallback(
    (clientX: number, clientY: number): Position => {
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

  // Convert client coordinate to local SVG workspace coordinates (unscaled)
  const getLocalCoordsFromEvent = useCallback(
    (clientX: number, clientY: number): Position => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  // Notify parent of wiring status change
  useEffect(() => {
    if (wiring) {
      onWiringStatusChange?.(
        `Wiring from ${wiring.from.componentId}:${wiring.from.pinId} — Click pin or wire to connect (Esc to cancel)`
      );
    } else {
      onWiringStatusChange?.(null);
    }
  }, [wiring, onWiringStatusChange]);

  // Cancel wiring on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && wiring) {
        setWiring(null);
        setHoveredPin(null);
        setHoveredWireHit(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [wiring]);

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

  // Find nearest pin to logical grid coordinate
  const findPinNear = useCallback(
    (pos: Position, maxDist = 1.0) => {
      for (const comp of circuit.components) {
        const pins = getComponentPins(comp.type);
        for (const p of pins) {
          const pinPos = getAbsolutePinPosition(comp, p.id);
          const dist = Math.hypot(pos.x - pinPos.x, pos.y - pinPos.y);
          if (dist <= maxDist) {
            return { componentId: comp.id, pinId: p.id, pos: pinPos };
          }
        }
      }
      return null;
    },
    [circuit.components]
  );

  // Mouse Down on background or elements
  const handleMouseDown = (e: React.MouseEvent) => {
    // 1. Middle Button or Alt + Left Click: Pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // 2. Right Click: Cancel wiring if active
    if (e.button === 2) {
      e.preventDefault();
      if (wiring) {
        setWiring(null);
        setHoveredPin(null);
        setHoveredWireHit(null);
      }
      return;
    }

    // 3. Left click while in wiring mode
    if (wiring && e.button === 0) {
      if (hoveredPin) {
        // Connect to target pin
        if (
          hoveredPin.componentId !== wiring.from.componentId ||
          hoveredPin.pinId !== wiring.from.pinId
        ) {
          onConnectPins({
            from: wiring.from,
            to: { componentId: hoveredPin.componentId, pinId: hoveredPin.pinId },
          });
        }
        setWiring(null);
        setHoveredPin(null);
        setHoveredWireHit(null);
        return;
      }

      if (hoveredWireHit) {
        // Connect to target wire (insert junction)
        onConnectToWire({
          from: wiring.from,
          targetWireId: hoveredWireHit.wireId,
          hitPoint: hoveredWireHit.hitPoint,
        });
        setWiring(null);
        setHoveredPin(null);
        setHoveredWireHit(null);
        return;
      }

      // Clicking empty space cancels wiring draft
      setWiring(null);
      setHoveredPin(null);
      setHoveredWireHit(null);
      return;
    }

    // 4. Click on empty background: start marquee selection
    if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "rect") {
      const local = getLocalCoordsFromEvent(e.clientX, e.clientY);
      setMarquee({ start: local, current: local });

      if (!e.shiftKey) {
        onSelect([]);
      }
    }
  };

  // Mouse Move: cursor tracking, drag feedback, marquee, and wire snapping
  const handleMouseMove = (e: React.MouseEvent) => {
    const gridPos = getGridCoordsFromEvent(e.clientX, e.clientY);
    setMouseGridPos(gridPos);
    onCursorMove(gridPos);

    // 1. Panning
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
      return;
    }

    // 2. Component Dragging
    if (draggingComp) {
      const deltaX = Math.round((e.clientX - draggingComp.startClientX) / (GRID_SPACING * zoom));
      const deltaY = Math.round((e.clientY - draggingComp.startClientY) / (GRID_SPACING * zoom));
      setDragOffset({ dx: deltaX, dy: deltaY });
      return;
    }

    // 3. Marquee Selection
    if (marquee) {
      const local = getLocalCoordsFromEvent(e.clientX, e.clientY);
      setMarquee((prev) => (prev ? { ...prev, current: local } : null));
      return;
    }

    // 4. Snapping logic while wiring or hovering over pins
    const nearPin = findPinNear(gridPos, 0.8);
    if (nearPin) {
      setHoveredPin(nearPin);
      setHoveredWireHit(null);
    } else {
      setHoveredPin(null);

      // If wiring, check for snap to existing wire segment
      if (wiring) {
        let bestWireHit: { wireId: string; hitPoint: Position } | null = null;
        let minWireDist = Infinity;

        for (const wire of circuit.wires) {
          const nearest = findNearestPointOnWire(wire, gridPos);
          if (nearest && nearest.distance <= 0.8 && nearest.distance < minWireDist) {
            minWireDist = nearest.distance;
            bestWireHit = { wireId: wire.id, hitPoint: nearest.point };
          }
        }

        setHoveredWireHit(bestWireHit);
      } else {
        setHoveredWireHit(null);
      }
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

  // Component Mouse Down: start drag or selection
  const handleComponentMouseDown = (e: React.MouseEvent, comp: Component) => {
    e.stopPropagation();

    if (wiring) {
      // If wiring mode is active, clicking on component should let pin hit detection take over
      return;
    }

    if (e.button === 0 && !e.altKey) {
      if (e.shiftKey) {
        if (selectedIds.includes(comp.id)) {
          onSelect(selectedIds.filter((id) => id !== comp.id));
        } else {
          onSelect([...selectedIds, comp.id]);
        }
      } else {
        if (!selectedIds.includes(comp.id)) {
          onSelect([comp.id]);
        }
      }

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

  // Pin Mouse Down: start or complete wire
  const handlePinClick = (e: React.MouseEvent, comp: Component, pinId: string) => {
    e.stopPropagation();

    const pinPos = getAbsolutePinPosition(comp, pinId);

    if (!wiring) {
      // Start wiring from this pin
      setWiring({
        from: { componentId: comp.id, pinId },
        startPos: pinPos,
      });
    } else {
      // Complete wiring to this pin
      if (wiring.from.componentId !== comp.id || wiring.from.pinId !== pinId) {
        onConnectPins({
          from: wiring.from,
          to: { componentId: comp.id, pinId },
        });
      }
      setWiring(null);
      setHoveredPin(null);
      setHoveredWireHit(null);
    }
  };

  // Calculate live preview route for wire being drawn
  const previewRoute = wiring
    ? createSimpleOrthogonalRoute(
        wiring.startPos,
        hoveredPin ? hoveredPin.pos : hoveredWireHit ? hoveredWireHit.hitPoint : mouseGridPos
      )
    : [];

  const previewRouteStr = previewRoute
    .map((p) => `${p.x * GRID_SPACING},${p.y * GRID_SPACING}`)
    .join(" ");

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
      onContextMenu={(e) => e.preventDefault()}
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
                  if (wiring) {
                    const nearest = findNearestPointOnWire(wire, mouseGridPos);
                    if (nearest) {
                      onConnectToWire({
                        from: wiring.from,
                        targetWireId: wire.id,
                        hitPoint: nearest.point,
                      });
                      setWiring(null);
                      setHoveredPin(null);
                      setHoveredWireHit(null);
                    }
                  } else {
                    onSelect(e.shiftKey ? [...selectedIds, wire.id] : [wire.id]);
                  }
                }}
              >
                {/* Thick invisible polyline for easy hit-testing */}
                <polyline
                  points={pointsStr}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={12}
                  cursor={wiring ? "crosshair" : "pointer"}
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

            const pins = getComponentPins(comp.type);

            return (
              <g
                key={comp.id}
                transform={`translate(${posX}, ${posY})`}
                onMouseDown={(e) => handleComponentMouseDown(e, comp)}
                cursor={wiring ? "crosshair" : isBeingDragged ? "grabbing" : "grab"}
              >
                <SchematicSymbol component={comp} isSelected={isCompSelected} />

                {/* Component Pin Terminals (Interactive Click/Hover Dots) */}
                {pins.map((pin) => {
                  const absPos = getAbsolutePinPosition(comp, pin.id);
                  // Local pin coordinates relative to component (0, 0)
                  const localPinX = (absPos.x - comp.position.x) * GRID_SPACING;
                  const localPinY = (absPos.y - comp.position.y) * GRID_SPACING;

                  const isStartPin =
                    wiring?.from.componentId === comp.id && wiring?.from.pinId === pin.id;
                  const isHovered =
                    hoveredPin?.componentId === comp.id && hoveredPin?.pinId === pin.id;

                  return (
                    <g
                      key={pin.id}
                      transform={`translate(${localPinX}, ${localPinY})`}
                      onClick={(e) => handlePinClick(e, comp, pin.id)}
                      cursor="crosshair"
                    >
                      {/* Invisible larger hit area for easy click targeting */}
                      <circle r={8} fill="transparent" />

                      {/* Visible terminal indicator */}
                      {(isHovered || wiring || isStartPin) && (
                        <circle
                          r={isHovered ? 4.5 : 3.5}
                          fill={isStartPin ? "#0000ff" : isHovered ? "#00ff00" : "#ffffff"}
                          stroke={isStartPin ? "#000080" : isHovered ? "#008000" : "#0000ff"}
                          strokeWidth={1.5}
                        />
                      )}
                    </g>
                  );
                })}

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

          {/* 4. Live Wire Preview while drawing */}
          {wiring && previewRouteStr && (
            <polyline
              points={previewRouteStr}
              fill="none"
              stroke="#0000ff"
              strokeWidth={2}
              strokeDasharray="4,4"
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          )}

          {/* 5. Wire Splitting Junction Dot Preview */}
          {wiring && hoveredWireHit && (
            <circle
              cx={hoveredWireHit.hitPoint.x * GRID_SPACING}
              cy={hoveredWireHit.hitPoint.y * GRID_SPACING}
              r={4.5}
              fill="#0000ff"
              stroke="#ffffff"
              strokeWidth={1}
              pointerEvents="none"
            />
          )}

          {/* 6. Marquee Selection Rectangle */}
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

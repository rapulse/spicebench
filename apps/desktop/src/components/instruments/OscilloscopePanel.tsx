import React, { useRef, useEffect, useState, useMemo } from "react";
import type { OscilloscopeState, Component } from "@spicebench/core";
import type { SimulationSummary } from "@spicebench/mcp";

export interface OscilloscopePanelProps {
  component: Component;
  state: OscilloscopeState;
  simulation: SimulationSummary | null;
  onStateChange: (state: OscilloscopeState) => void;
}

const TIMEBASE_STEPS = [
  "10us/div",
  "20us/div",
  "50us/div",
  "0.10ms/div",
  "0.20ms/div",
  "0.50ms/div",
  "1ms/div",
  "2ms/div",
  "5ms/div",
  "10ms/div",
  "20ms/div",
  "50ms/div",
  "0.10s/div",
];

const VOLT_SCALE_STEPS = [
  "10mV/div",
  "20mV/div",
  "50mV/div",
  "0.1V/div",
  "0.2V/div",
  "0.5V/div",
  "1V/div",
  "2V/div",
  "5V/div",
  "10V/div",
  "20V/div",
  "50V/div",
];

function getTimebaseSec(tb: string): number {
  const match = tb.match(/([\d.]+)\s*([a-zA-Z]+)/);
  if (!match) return 0.001;
  const val = parseFloat(match[1] || "1");
  const unit = (match[2] || "").toLowerCase();
  if (unit.startsWith("n")) return val * 1e-9;
  if (unit.startsWith("u")) return val * 1e-6;
  if (unit.startsWith("m")) return val * 1e-3;
  return val;
}

function getVoltScale(scaleStr: string): number {
  const match = scaleStr.match(/([\d.]+)\s*([a-zA-Z]+)/);
  if (!match) return 5;
  const val = parseFloat(match[1] || "5");
  const unit = (match[2] || "").toLowerCase();
  if (unit.startsWith("m")) return val * 1e-3;
  return val;
}

function formatTime(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return "---";
  const a = Math.abs(sec);
  if (a === 0) return "0.0000 ms";
  if (a < 1e-6) return `${(sec * 1e9).toFixed(4)} ns`;
  if (a < 1e-3) return `${(sec * 1e6).toFixed(4)} µs`;
  if (a < 1) return `${(sec * 1e3).toFixed(4)} ms`;
  return `${sec.toFixed(4)} s`;
}

function formatVoltage(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "---";
  const a = Math.abs(v);
  if (a > 0 && a < 1) return `${(v * 1e3).toFixed(4)} mV`;
  return `${v.toFixed(4)} V`;
}

function sampleAtTime(time: number[], values: number[] | null, targetT: number): number | null {
  if (!values || time.length === 0 || values.length !== time.length) return null;
  if (targetT <= time[0]!) return values[0]!;
  const last = time.length - 1;
  if (targetT >= time[last]!) return values[last]!;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (time[mid]! <= targetT) lo = mid;
    else hi = mid;
  }
  const t0 = time[lo]!;
  const t1 = time[hi]!;
  const frac = t1 > t0 ? (targetT - t0) / (t1 - t0) : 0;
  return values[lo]! + frac * (values[hi]! - values[lo]!);
}

function stepOption(list: string[], current: string, dir: -1 | 1): string {
  const idx = list.findIndex((item) => item.toLowerCase() === current.toLowerCase());
  if (idx === -1) return list[Math.floor(list.length / 2)]!;
  const next = Math.max(0, Math.min(list.length - 1, idx + dir));
  return list[next]!;
}

export const OscilloscopePanel: React.FC<OscilloscopePanelProps> = ({
  component,
  state,
  simulation,
  onStateChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [displayMode, setDisplayMode] = useState<"Y/T" | "B/A" | "A/B">("Y/T");
  const [reversed, setReversed] = useState<boolean>(false); // false = EWB white screen, true = black screen
  const [reduced, setReduced] = useState<boolean>(false);
  const [cursor1, setCursor1] = useState<number>(0.56); // 0..1 ratio across screen
  const [cursor2, setCursor2] = useState<number>(0.65);
  const [draggingCursor, setDraggingCursor] = useState<1 | 2 | null>(null);
  const [scrollPos, setScrollPos] = useState<number>(0); // 0..1 horizontal scroll

  const xDivs = 10;
  const yDivs = 6;
  const canvasWidth = reduced ? 320 : 520;
  const canvasHeight = reduced ? 170 : 250;

  const scopeData = useMemo(() => {
    const inst = simulation?.instruments?.[component.id];
    if (inst && inst.type === "OSCILLOSCOPE" && inst.status === "ok") {
      return inst;
    }
    return null;
  }, [component.id, simulation]);

  const timebaseSec = getTimebaseSec(state.timebase);
  const windowDuration = timebaseSec * xDivs;
  const maxDataTime = scopeData && scopeData.time.length > 0 ? scopeData.time[scopeData.time.length - 1]! : windowDuration;
  const maxScrollTime = Math.max(0, maxDataTime - windowDuration);
  const viewStartTime = scrollPos * maxScrollTime - state.xPos * timebaseSec;

  // Cursor readouts from backend arrays (no physics in renderer)
  const readouts = useMemo(() => {
    const t1 = viewStartTime + cursor1 * windowDuration;
    const t2 = viewStartTime + cursor2 * windowDuration;
    if (!scopeData) {
      return {
        t1: null,
        t2: null,
        dt: null,
        va1: null,
        va2: null,
        dva: null,
        vb1: null,
        vb2: null,
        dvb: null,
      };
    }
    const va1 = state.chA.coupling === "0" ? 0 : sampleAtTime(scopeData.time, scopeData.chA, t1);
    const va2 = state.chA.coupling === "0" ? 0 : sampleAtTime(scopeData.time, scopeData.chA, t2);
    const vb1 = state.chB.coupling === "0" ? 0 : sampleAtTime(scopeData.time, scopeData.chB, t1);
    const vb2 = state.chB.coupling === "0" ? 0 : sampleAtTime(scopeData.time, scopeData.chB, t2);
    return {
      t1,
      t2,
      dt: t2 - t1,
      va1,
      va2,
      dva: va1 !== null && va2 !== null ? va2 - va1 : null,
      vb1,
      vb2,
      dvb: vb1 !== null && vb2 !== null ? vb2 - vb1 : null,
    };
  }, [scopeData, viewStartTime, cursor1, cursor2, windowDuration, state.chA.coupling, state.chB.coupling]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const dx = width / xDivs;
    const dy = height / yDivs;
    const midY = height / 2;
    const midX = width / 2;

    // 1. Screen Background (EWB 5.12 default = white, Reverse = black)
    ctx.fillStyle = reversed ? "#081008" : "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // 2. Graticule Grid (10x6 divisions as in EWB 5.12 Image-1 3.jpeg)
    ctx.strokeStyle = reversed ? "#2a4a2a" : "#c8c8c8";
    ctx.lineWidth = 1;
    for (let i = 1; i < xDivs; i++) {
      const x = Math.round(i * dx) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let j = 1; j < yDivs; j++) {
      const y = Math.round(j * dy) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 3. Waveforms from backend InstrumentData
    if (scopeData) {
      const timeArr = scopeData.time;
      const chAVoltsPerDiv = getVoltScale(state.chA.scale);
      const chBVoltsPerDiv = getVoltScale(state.chB.scale);

      if (displayMode === "Y/T") {
        // Channel A (Red trace, matching EWB 5.12)
        if (state.chA.coupling !== "0" && scopeData.chA) {
          ctx.strokeStyle = reversed ? "#ff5555" : "#cc0000";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          let started = false;
          for (let i = 0; i < timeArr.length; i++) {
            const t = timeArr[i]!;
            const px = ((t - viewStartTime) / windowDuration) * width;
            const v = scopeData.chA[i]! + state.chA.yPos * chAVoltsPerDiv;
            const py = midY - (v / (chAVoltsPerDiv * yDivs)) * height;
            if (!started) {
              ctx.moveTo(px, py);
              started = true;
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.stroke();
        }

        // Channel B (Black on white / Cyan on black, matching EWB 5.12)
        if (state.chB.coupling !== "0" && scopeData.chB) {
          ctx.strokeStyle = reversed ? "#00e5ff" : "#000000";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          let started = false;
          for (let i = 0; i < timeArr.length; i++) {
            const t = timeArr[i]!;
            const px = ((t - viewStartTime) / windowDuration) * width;
            const v = scopeData.chB[i]! + state.chB.yPos * chBVoltsPerDiv;
            const py = midY - (v / (chBVoltsPerDiv * yDivs)) * height;
            if (!started) {
              ctx.moveTo(px, py);
              started = true;
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.stroke();
        }
      } else if (scopeData.chA && scopeData.chB) {
        // X-Y modes: B/A or A/B
        const xArr = displayMode === "B/A" ? scopeData.chA : scopeData.chB;
        const yArr = displayMode === "B/A" ? scopeData.chB : scopeData.chA;
        const xScale = displayMode === "B/A" ? chAVoltsPerDiv : chBVoltsPerDiv;
        const yScale = displayMode === "B/A" ? chBVoltsPerDiv : chAVoltsPerDiv;
        ctx.strokeStyle = reversed ? "#00ff88" : "#0000aa";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < xArr.length; i++) {
          const px = midX + (xArr[i]! / (xScale * xDivs)) * width;
          const py = midY - (yArr[i]! / (yScale * yDivs)) * height;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }

    // 4. Vertical Cursors 1 (Red) & 2 (Blue) in Y/T mode
    if (displayMode === "Y/T") {
      const c1x = Math.round(cursor1 * width) + 0.5;
      const c2x = Math.round(cursor2 * width) + 0.5;

      ctx.strokeStyle = "#cc0000";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c1x, 0);
      ctx.lineTo(c1x, height);
      ctx.stroke();

      ctx.strokeStyle = "#0000cc";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c2x, 0);
      ctx.lineTo(c2x, height);
      ctx.stroke();
    }
  }, [
    scopeData,
    state,
    reversed,
    displayMode,
    cursor1,
    cursor2,
    viewStartTime,
    windowDuration,
    canvasWidth,
    canvasHeight,
  ]);

  const handleScreenPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (Math.abs(ratio - cursor1) <= Math.abs(ratio - cursor2)) {
      setDraggingCursor(1);
      setCursor1(ratio);
    } else {
      setDraggingCursor(2);
      setCursor2(ratio);
    }
  };

  const handleScreenPointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingCursor) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (draggingCursor === 1) setCursor1(ratio);
    else setCursor2(ratio);
  };

  const handleSaveCsv = () => {
    if (!scopeData) return;
    const lines = ["time,chA,chB"];
    for (let i = 0; i < scopeData.time.length; i++) {
      const t = scopeData.time[i]!;
      const a = scopeData.chA?.[i] ?? "";
      const b = scopeData.chB?.[i] ?? "";
      lines.push(`${t},${a},${b}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${component.id}-trace.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const spinBtnStyle: React.CSSProperties = {
    width: "14px",
    height: "10px",
    padding: 0,
    fontSize: "7px",
    lineHeight: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "14px",
  };

  return (
    <div
      className="ewb-scope-panel"
      style={{ width: reduced ? "340px" : "540px", userSelect: "none", fontSize: "11px" }}
      onMouseUp={() => setDraggingCursor(null)}
      onMouseLeave={() => setDraggingCursor(null)}
    >
      {/* 1. Cursor Flags Track + CRT Screen */}
      <div
        style={{ position: "relative", paddingTop: "12px" }}
        onMouseDown={handleScreenPointerDown}
        onMouseMove={handleScreenPointerMove}
      >
        {/* Cursor 1 (Red) & Cursor 2 (Blue) triangular flags */}
        {displayMode === "Y/T" && (
          <>
            <div
              title="Drag Cursor 1"
              style={{
                position: "absolute",
                top: 0,
                left: `calc(${cursor1 * 100}% - 7px)`,
                width: "14px",
                height: "12px",
                background: "#cc0000",
                color: "#ffffff",
                fontSize: "9px",
                fontWeight: "bold",
                textAlign: "center",
                lineHeight: "11px",
                clipPath: "polygon(0 0, 100% 0, 50% 100%)",
                cursor: "ew-resize",
                zIndex: 2,
              }}
            >
              1
            </div>
            <div
              title="Drag Cursor 2"
              style={{
                position: "absolute",
                top: 0,
                left: `calc(${cursor2 * 100}% - 7px)`,
                width: "14px",
                height: "12px",
                background: "#0000cc",
                color: "#ffffff",
                fontSize: "9px",
                fontWeight: "bold",
                textAlign: "center",
                lineHeight: "11px",
                clipPath: "polygon(0 0, 100% 0, 50% 100%)",
                cursor: "ew-resize",
                zIndex: 2,
              }}
            >
              2
            </div>
          </>
        )}

        <div
          style={{
            border: "2px inset #ffffff",
            background: reversed ? "#081008" : "#ffffff",
            cursor: "crosshair",
          }}
        >
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            style={{ display: "block", width: "100%" }}
          />
        </div>
      </div>

      {/* 2. Horizontal Scrollbar under screen (EWB 5.12) */}
      <div style={{ display: "flex", alignItems: "center", gap: "2px", margin: "4px 0 6px" }}>
        <button
          style={{ minWidth: "16px", height: "16px", padding: 0, fontSize: "9px" }}
          onClick={() => setScrollPos((p) => Math.max(0, p - 0.1))}
        >
          ◀
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={scrollPos}
          onChange={(e) => setScrollPos(parseFloat(e.target.value))}
          style={{ flex: 1, margin: 0 }}
        />
        <button
          style={{ minWidth: "16px", height: "16px", padding: 0, fontSize: "9px" }}
          onClick={() => setScrollPos((p) => Math.min(1, p + 0.1))}
        >
          ▶
        </button>
      </div>

      {/* 3. Cursor Readouts Bar (3 columns: T1/VA1/VB1 | T2/VA2/VB2 | T2-T1/VA2-VA1/VB2-VB1) */}
      {!reduced && (
        <div
          style={{
            border: "2px groove #ffffff",
            padding: "4px 6px",
            marginBottom: "6px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "8px",
            background: "#c0c0c0",
          }}
        >
          {[
            [
              ["T1", formatTime(readouts.t1)],
              ["VA1", formatVoltage(readouts.va1)],
              ["VB1", formatVoltage(readouts.vb1)],
            ],
            [
              ["T2", formatTime(readouts.t2)],
              ["VA2", formatVoltage(readouts.va2)],
              ["VB2", formatVoltage(readouts.vb2)],
            ],
            [
              ["T2-T1", formatTime(readouts.dt)],
              ["VA2-VA1", formatVoltage(readouts.dva)],
              ["VB2-VB1", formatVoltage(readouts.dvb)],
            ],
          ].map((col, colIdx) => (
            <div key={colIdx} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {col.map(([label, val]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ width: "44px", textAlign: "right", fontSize: "10px" }}>{label}</span>
                  <div
                    style={{
                      flex: 1,
                      background: "#ffffff",
                      border: "1px inset #808080",
                      padding: "1px 4px",
                      fontFamily: "'Courier New', monospace",
                      fontSize: "10px",
                      textAlign: "right",
                    }}
                  >
                    {val}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 4. Bottom Controls: Time base | Trigger | Channel A | Channel B | Reduce/Reverse/Save */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: reduced ? "1fr 1fr" : "1.15fr 1fr 1.15fr 1.15fr 64px",
          gap: "4px",
          alignItems: "stretch",
        }}
      >
        {/* Time base */}
        <fieldset style={{ margin: 0, padding: "4px" }}>
          <legend>Time base</legend>
          <div style={{ display: "flex", alignItems: "center", gap: "2px", marginBottom: "4px" }}>
            <div
              style={{
                flex: 1,
                background: "#ffffff",
                border: "1px inset #808080",
                padding: "1px 3px",
                fontSize: "10px",
              }}
            >
              {state.timebase}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <button
                style={spinBtnStyle}
                onClick={() =>
                  onStateChange({
                    ...state,
                    timebase: stepOption(TIMEBASE_STEPS, state.timebase, 1),
                  })
                }
              >
                ▲
              </button>
              <button
                style={spinBtnStyle}
                onClick={() =>
                  onStateChange({
                    ...state,
                    timebase: stepOption(TIMEBASE_STEPS, state.timebase, -1),
                  })
                }
              >
                ▼
              </button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "3px", marginBottom: "4px" }}>
            <span style={{ fontSize: "10px" }}>X position</span>
            <div
              style={{
                flex: 1,
                background: "#ffffff",
                border: "1px inset #808080",
                padding: "1px 3px",
                fontSize: "10px",
                textAlign: "right",
              }}
            >
              {state.xPos.toFixed(2)}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <button
                style={spinBtnStyle}
                onClick={() => onStateChange({ ...state, xPos: +(state.xPos + 0.2).toFixed(2) })}
              >
                ▲
              </button>
              <button
                style={spinBtnStyle}
                onClick={() => onStateChange({ ...state, xPos: +(state.xPos - 0.2).toFixed(2) })}
              >
                ▼
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: "2px" }}>
            {(["Y/T", "B/A", "A/B"] as const).map((m) => (
              <button
                key={m}
                className={displayMode === m ? "active" : ""}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "1px 2px",
                  fontSize: "10px",
                  fontWeight: displayMode === m ? "bold" : "normal",
                  background: displayMode === m ? "#808080" : undefined,
                  color: displayMode === m ? "#ffffff" : undefined,
                }}
                onClick={() => setDisplayMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Trigger */}
        {!reduced && (
          <fieldset style={{ margin: 0, padding: "4px" }}>
            <legend>Trigger</legend>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }}>
              <span style={{ fontSize: "10px" }}>Edge</span>
              <button
                title="Rising Edge"
                style={{
                  minWidth: "22px",
                  height: "18px",
                  padding: "0 2px",
                  fontSize: "10px",
                  background: state.trigger.edge === "positive" ? "#808080" : undefined,
                  color: state.trigger.edge === "positive" ? "#ffffff" : undefined,
                }}
                onClick={() =>
                  onStateChange({ ...state, trigger: { ...state.trigger, edge: "positive" } })
                }
              >
                ↗
              </button>
              <button
                title="Falling Edge"
                style={{
                  minWidth: "22px",
                  height: "18px",
                  padding: "0 2px",
                  fontSize: "10px",
                  background: state.trigger.edge === "negative" ? "#808080" : undefined,
                  color: state.trigger.edge === "negative" ? "#ffffff" : undefined,
                }}
                onClick={() =>
                  onStateChange({ ...state, trigger: { ...state.trigger, edge: "negative" } })
                }
              >
                ↘
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "3px", marginBottom: "4px" }}>
              <span style={{ fontSize: "10px" }}>Level</span>
              <div
                style={{
                  flex: 1,
                  background: "#ffffff",
                  border: "1px inset #808080",
                  padding: "1px 3px",
                  fontSize: "10px",
                  textAlign: "right",
                }}
              >
                {state.trigger.level.toFixed(2)}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <button
                  style={spinBtnStyle}
                  onClick={() =>
                    onStateChange({
                      ...state,
                      trigger: { ...state.trigger, level: +(state.trigger.level + 0.5).toFixed(2) },
                    })
                  }
                >
                  ▲
                </button>
                <button
                  style={spinBtnStyle}
                  onClick={() =>
                    onStateChange({
                      ...state,
                      trigger: { ...state.trigger, level: +(state.trigger.level - 0.5).toFixed(2) },
                    })
                  }
                >
                  ▼
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "2px" }}>
              {(
                [
                  ["Auto", "auto", null],
                  ["A", "normal", "chA"],
                  ["B", "normal", "chB"],
                  ["Ext", "normal", "ext"],
                ] as const
              ).map(([label, mode, source]) => {
                const isActive =
                  mode === "auto"
                    ? state.trigger.mode === "auto"
                    : state.trigger.mode !== "auto" && state.trigger.source === source;
                return (
                  <button
                    key={label}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: "1px 2px",
                      fontSize: "9px",
                      background: isActive ? "#808080" : undefined,
                      color: isActive ? "#ffffff" : undefined,
                    }}
                    onClick={() =>
                      onStateChange({
                        ...state,
                        trigger: {
                          ...state.trigger,
                          mode,
                          source: source ?? state.trigger.source,
                        },
                      })
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* Channel A & Channel B */}
        {(["chA", "chB"] as const).map((chKey) => {
          const ch = state[chKey];
          const label = chKey === "chA" ? "Channel A" : "Channel B";
          return (
            <fieldset key={chKey} style={{ margin: 0, padding: "4px" }}>
              <legend>{label}</legend>
              <div style={{ display: "flex", alignItems: "center", gap: "2px", marginBottom: "4px" }}>
                <div
                  style={{
                    flex: 1,
                    background: "#ffffff",
                    border: "1px inset #808080",
                    padding: "1px 3px",
                    fontSize: "10px",
                  }}
                >
                  {ch.scale}
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <button
                    style={spinBtnStyle}
                    onClick={() =>
                      onStateChange({
                        ...state,
                        [chKey]: { ...ch, scale: stepOption(VOLT_SCALE_STEPS, ch.scale, 1) },
                      })
                    }
                  >
                    ▲
                  </button>
                  <button
                    style={spinBtnStyle}
                    onClick={() =>
                      onStateChange({
                        ...state,
                        [chKey]: { ...ch, scale: stepOption(VOLT_SCALE_STEPS, ch.scale, -1) },
                      })
                    }
                  >
                    ▼
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "3px", marginBottom: "4px" }}>
                <span style={{ fontSize: "10px" }}>Y position</span>
                <div
                  style={{
                    flex: 1,
                    background: "#ffffff",
                    border: "1px inset #808080",
                    padding: "1px 3px",
                    fontSize: "10px",
                    textAlign: "right",
                  }}
                >
                  {ch.yPos.toFixed(2)}
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <button
                    style={spinBtnStyle}
                    onClick={() =>
                      onStateChange({
                        ...state,
                        [chKey]: { ...ch, yPos: +(ch.yPos + 0.2).toFixed(2) },
                      })
                    }
                  >
                    ▲
                  </button>
                  <button
                    style={spinBtnStyle}
                    onClick={() =>
                      onStateChange({
                        ...state,
                        [chKey]: { ...ch, yPos: +(ch.yPos - 0.2).toFixed(2) },
                      })
                    }
                  >
                    ▼
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: "2px" }}>
                {(["AC", "0", "DC"] as const).map((c) => (
                  <button
                    key={c}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: "1px 2px",
                      fontSize: "10px",
                      background: ch.coupling === c ? "#808080" : undefined,
                      color: ch.coupling === c ? "#ffffff" : undefined,
                    }}
                    onClick={() =>
                      onStateChange({
                        ...state,
                        [chKey]: { ...ch, coupling: c },
                      })
                    }
                  >
                    {c}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        })}

        {/* Right action buttons: Reduce, Reverse, Save */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "4px" }}>
          <button
            style={{ minWidth: 0, padding: "2px 4px", fontSize: "10px" }}
            onClick={() => setReduced((r) => !r)}
          >
            {reduced ? "Expand" : "Reduce"}
          </button>
          <button
            style={{ minWidth: 0, padding: "2px 4px", fontSize: "10px" }}
            onClick={() => setReversed((r) => !r)}
          >
            Reverse
          </button>
          <button
            style={{ minWidth: 0, padding: "2px 4px", fontSize: "10px" }}
            onClick={handleSaveCsv}
            disabled={!scopeData}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

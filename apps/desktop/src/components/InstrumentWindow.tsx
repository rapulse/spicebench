import React, { useRef, useState, useCallback, useEffect } from "react";

export interface InstrumentWindowProps {
  title: string;
  position: { x: number; y: number };
  onMove: (pos: { x: number; y: number }) => void;
  onClose: () => void;
  width?: number;
  zIndex?: number;
  onFocus?: () => void;
  children: React.ReactNode;
}

export const InstrumentWindow: React.FC<InstrumentWindowProps> = ({
  title,
  position,
  onMove,
  onClose,
  width = 320,
  zIndex = 100,
  onFocus,
  children,
}) => {
  const windowRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFocus?.();

    setIsDragging(true);
    dragOffsetRef.current = {
      dx: e.clientX - position.x,
      dy: e.clientY - position.y,
    };
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = Math.max(0, Math.round(e.clientX - dragOffsetRef.current.dx));
      const newY = Math.max(0, Math.round(e.clientY - dragOffsetRef.current.dy));
      onMove({ x: newX, y: newY });
    },
    [isDragging, onMove]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
    }
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={windowRef}
      className="window ewb-floating-instrument"
      style={{
        position: "absolute",
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${width}px`,
        zIndex,
        boxShadow: "2px 2px 8px rgba(0,0,0,0.45)",
      }}
      onMouseDown={() => onFocus?.()}
    >
      <div
        className="title-bar"
        onMouseDown={handleTitleMouseDown}
        style={{ cursor: isDragging ? "grabbing" : "grab", userSelect: "none" }}
      >
        <div className="title-bar-text">{title}</div>
        <div className="title-bar-controls">
          <button
            aria-label="Minimize"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />
          <button
            aria-label="Close"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />
        </div>
      </div>

      <div className="window-body" style={{ margin: "4px", padding: "4px" }}>
        {children}
      </div>
    </div>
  );
};

import React from "react";

interface TitleBarProps {
  title: string;
}

export const TitleBar: React.FC<TitleBarProps> = ({ title }) => {
  return (
    <div className="title-bar">
      <div className="title-bar-text">
        ⚡ {title}
      </div>
      <div className="title-bar-controls">
        <button aria-label="Minimize" />
        <button aria-label="Maximize" />
        <button aria-label="Close" />
      </div>
    </div>
  );
};

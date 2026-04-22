"use client";

import React from "react";
import type { ReactNode } from "react";

type Props = {
  title?: string;
  message: ReactNode;
  actions?: ReactNode;
  className?: string;
  messageClassName?: string;
};

export default function SectionStatePanel({
  title,
  message,
  actions,
  className = "",
  messageClassName = "hint"
}: Props) {
  return (
    <div className={className} data-section-state-panel="true">
      {title ? <h3>{title}</h3> : null}
      {typeof message === "string" || typeof message === "number" ? (
        <p className={messageClassName} data-section-state-panel-message="true">
          {message}
        </p>
      ) : (
        <div className={messageClassName} data-section-state-panel-message="true">
          {message}
        </div>
      )}
      {actions ? <div className="row sectionStatePanelActions">{actions}</div> : null}
    </div>
  );
}

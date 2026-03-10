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
    <div className={className}>
      {title ? <h3>{title}</h3> : null}
      {typeof message === "string" || typeof message === "number" ? (
        <p className={messageClassName}>{message}</p>
      ) : (
        <div className={messageClassName}>{message}</div>
      )}
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

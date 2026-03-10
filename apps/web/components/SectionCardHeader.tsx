"use client";

import React from "react";
import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  descriptionClassName?: string;
  actions?: ReactNode;
  layout?: "stacked" | "split";
};

export default function SectionCardHeader({
  title,
  description,
  descriptionClassName = "hint",
  actions,
  layout = "stacked"
}: Props) {
  if (layout === "split") {
    return (
      <>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3>{title}</h3>
          {actions}
        </div>
        {description ? (
          typeof description === "string" || typeof description === "number" ? (
            <p className={descriptionClassName}>{description}</p>
          ) : (
            <div className={descriptionClassName}>{description}</div>
          )
        ) : null}
      </>
    );
  }

  return (
    <>
      <h3>{title}</h3>
      {description ? (
        typeof description === "string" || typeof description === "number" ? (
          <p className={descriptionClassName}>{description}</p>
        ) : (
          <div className={descriptionClassName}>{description}</div>
        )
      ) : null}
      {actions ? <div className="row">{actions}</div> : null}
    </>
  );
}

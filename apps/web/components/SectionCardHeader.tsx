"use client";

import React from "react";
import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  headingLevel?: 2 | 3;
  description?: ReactNode;
  descriptionClassName?: string;
  actions?: ReactNode;
  layout?: "stacked" | "split";
};

export default function SectionCardHeader({
  title,
  headingLevel = 3,
  description,
  descriptionClassName = "hint",
  actions,
  layout = "stacked"
}: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  if (layout === "split") {
    return (
      <>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Heading>{title}</Heading>
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
      <Heading>{title}</Heading>
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

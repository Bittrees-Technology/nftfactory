"use client";

import React from "react";
import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
};

export default function SummaryStatCard({
  title,
  value,
  className = "card",
  valueClassName = ""
}: Props) {
  return (
    <article className={className}>
      <h3>{title}</h3>
      {typeof value === "string" || typeof value === "number" ? (
        <p className={valueClassName}>{value}</p>
      ) : (
        <div className={valueClassName}>{value}</div>
      )}
    </article>
  );
}

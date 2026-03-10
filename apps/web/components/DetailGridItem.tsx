"use client";

import React from "react";
import type { ReactNode } from "react";

type Props = {
  label: ReactNode;
  value: ReactNode;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
};

export default function DetailGridItem({
  label,
  value,
  className = "detailItem",
  labelClassName = "detailLabel",
  valueClassName = "detailValue"
}: Props) {
  return (
    <div className={className}>
      <span className={labelClassName}>{label}</span>
      {typeof value === "string" || typeof value === "number" ? (
        <p className={valueClassName}>{value}</p>
      ) : (
        <div className={valueClassName}>{value}</div>
      )}
    </div>
  );
}

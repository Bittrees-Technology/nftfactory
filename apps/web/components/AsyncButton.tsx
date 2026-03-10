"use client";

import React from "react";

type Props = {
  idleLabel: string;
  loadingLabel: string;
  loading: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
};

export default function AsyncButton({
  idleLabel,
  loadingLabel,
  loading,
  onClick,
  disabled = false,
  className,
  type = "button"
}: Props) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={className}>
      {loading ? loadingLabel : idleLabel}
    </button>
  );
}

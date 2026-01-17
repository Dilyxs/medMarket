"use client";

import { forwardRef, InputHTMLAttributes } from "react";

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Checkbox(
  { className = "", ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={`h-4 w-4 rounded-sm border border-input accent-primary ${className}`}
      {...props}
    />
  );
});

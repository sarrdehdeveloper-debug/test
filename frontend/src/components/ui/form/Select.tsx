"use client";

import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";
import { controlClasses, useFieldControl } from "./Field";

export interface SelectProps extends ComponentPropsWithRef<"select"> {
  /** First, empty option (e.g. "Select a country"). */
  placeholder?: string;
}

/** Native select with the brand look and a chevron on the inline-end side. */
export function Select({ className, placeholder, children, ...props }: SelectProps) {
  const { invalid: _invalid, ...field } = useFieldControl(props);
  void _invalid;
  return (
    <div className="relative">
      <select
        {...props}
        {...field}
        className={cn(controlClasses, "appearance-none pe-11", className)}
      >
        {placeholder !== undefined ? (
          <option value="" disabled={props.required}>
            {placeholder}
          </option>
        ) : null}
        {children}
      </select>
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="pointer-events-none absolute end-4 top-1/2 size-4 -translate-y-1/2 text-gold"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m5 7.5 5 5 5-5" />
      </svg>
    </div>
  );
}

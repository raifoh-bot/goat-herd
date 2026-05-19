import { SVGProps } from "react";

export function GoatIcon({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 180 180"
      fill="none"
      stroke="currentColor"
      strokeWidth={9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M62 70 C 50 50, 44 38, 50 32 C 56 38, 62 50, 66 64" />
      <path d="M118 70 C 130 50, 136 38, 130 32 C 124 38, 118 50, 114 64" />
      <path d="M58 78 C 58 64, 72 56, 90 56 C 108 56, 122 64, 122 78 L 122 104 C 122 124, 108 138, 90 138 C 72 138, 58 124, 58 104 Z" />
      <circle cx="76" cy="92" r="3.5" fill="currentColor" stroke="none" />
      <circle cx="104" cy="92" r="3.5" fill="currentColor" stroke="none" />
      <path d="M82 116 Q 90 122 98 116" />
      <path d="M90 122 L 90 132" />
      <path d="M86 138 Q 90 146 94 138" />
    </svg>
  );
}

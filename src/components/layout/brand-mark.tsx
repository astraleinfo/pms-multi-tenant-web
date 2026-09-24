import * as React from "react";

/**
 * The Astrale "A": two gradient legs meeting in a rounded apex, a soft sweep
 * for a crossbar, and a spark. The one drawing in the application that is
 * allowed its own colours — a logo does not re-theme.
 */
export function AstraleMark({ size = 48, className }: { size?: number; className?: string }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-l`} x1="8" y1="58" x2="30" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#12E0F0" />
          <stop offset="1" stopColor="#1C9BFF" />
        </linearGradient>
        <linearGradient id={`${id}-r`} x1="32" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1E8BFF" />
          <stop offset="1" stopColor="#2463FF" />
        </linearGradient>
        <linearGradient id={`${id}-s`} x1="12" y1="50" x2="46" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7FEAF7" stopOpacity="0" />
          <stop offset="1" stopColor="#B8E4FF" />
        </linearGradient>
      </defs>
      <path d="M10 53.5 27.2 12.5" stroke={`url(#${id}-l)`} strokeWidth="13" strokeLinecap="round" fill="none" />
      <path d="M36.8 12.5 54 53.5" stroke={`url(#${id}-r)`} strokeWidth="13" strokeLinecap="round" fill="none" />
      <path d="M27.2 12.5a5.2 5.2 0 0 1 9.6 0" stroke={`url(#${id}-r)`} strokeWidth="13" strokeLinecap="round" fill="none" />
      <path d="M11 52c9.5-8.5 20-12.5 33-11.5" stroke={`url(#${id}-s)`} strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M44.5 31c.7 3.6 2.4 5.3 6 6-3.6.7-5.3 2.4-6 6-.7-3.6-2.4-5.3-6-6 3.6-.7 5.3-2.4 6-6Z" fill="#FFFFFF" />
    </svg>
  );
}

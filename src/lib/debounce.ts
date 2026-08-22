"use client";

import * as React from "react";

/**
 * Waits for typing to settle before letting a value through.
 *
 * Every list screen now searches in the database, so the difference between
 * asking on each keystroke and asking once the hand stops is a dozen queries
 * per word.
 */
export function useDebounced<T>(value: T, ms = 250): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

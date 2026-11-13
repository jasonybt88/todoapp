import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export function useDebounce<T>(value: T, delayMs = 300): [T, Dispatch<SetStateAction<T>>] {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return [debounced, setDebounced];
}

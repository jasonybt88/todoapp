export function hasValidCounterProgression(
  storedCounter: number | null | undefined,
  newCounter: number | null | undefined,
): boolean {
  const current = storedCounter ?? 0;
  const next = newCounter ?? 0;

  return (current === 0 && next === 0) || next > current;
}

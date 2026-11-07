/** Small color key beside a label; identity never relies on text color. */
export function Swatch({ color, hatched }: { color?: string; hatched?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2.5 shrink-0 rounded-[2px] ${hatched ? 'fill-unresolved' : ''}`}
      style={hatched ? undefined : { background: color }}
    />
  );
}

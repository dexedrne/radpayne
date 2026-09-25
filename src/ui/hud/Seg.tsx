// Segmented control: Bebas segments, the selected one filled paper.
export function Seg<T extends string>({ value, options, onChange, swatch }: {
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (v: T) => void;
  /** Optional colour swatch per option (the damage colour setting). */
  swatch?: Partial<Record<T, string>>;
}) {
  return (
    <div className="rp-seg" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} tabIndex={-1} className={v === value ? "on" : ""} onClick={e => { e.stopPropagation(); onChange(v); }}>
          {swatch?.[v] && <i className="sw" style={{ background: swatch[v] }} />}
          {label}
        </button>
      ))}
    </div>
  );
}

/** The next / previous option (←→ on a focused setting row). */
export function stepOption<T extends string>(options: ReadonlyArray<readonly [T, string]>, value: T, dir: number): T {
  const i = options.findIndex(([v]) => v === value);
  return options[Math.max(0, Math.min(options.length - 1, (i < 0 ? 0 : i) + dir))][0];
}

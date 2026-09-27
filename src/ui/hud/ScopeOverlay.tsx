// The sniper's scope (arsenal spec 3.2): a black mask with a round window 42 % of the view's height, a thin
// ink crosshair with a gap in the middle, tick marks; no numbers, no text. Under the HUD's plates.
export function ScopeOverlay() {
  const ticks = [-4, -3, -2, -1, 1, 2, 3, 4];
  return (
    <div className="rp-scope" data-testid="scope">
      <svg viewBox="-50 -50 100 100" preserveAspectRatio="xMidYMid meet" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <defs>
          <mask id="rp-scope-hole">
            <rect x="-500" y="-500" width="1000" height="1000" fill="white" />
            <circle cx="0" cy="0" r="21" fill="black" />
          </mask>
        </defs>
        <rect x="-500" y="-500" width="1000" height="1000" fill="#050407" mask="url(#rp-scope-hole)" />
        <circle cx="0" cy="0" r="21" fill="none" stroke="#050407" strokeWidth="0.9" />
        <g stroke="#0b0a0d" strokeWidth="0.22" fill="none">
          <line x1="-21" y1="0" x2="-1.4" y2="0" /><line x1="1.4" y1="0" x2="21" y2="0" />
          <line x1="0" y1="-21" x2="0" y2="-1.4" /><line x1="0" y1="1.4" x2="0" y2="21" />
          <line x1="-21" y1="0" x2="-11" y2="0" strokeWidth="0.7" /><line x1="11" y1="0" x2="21" y2="0" strokeWidth="0.7" />
          <line x1="0" y1="11" x2="0" y2="21" strokeWidth="0.7" />
          {ticks.map(t => <line key={`h${t}`} x1={t * 2.2} y1="-0.6" x2={t * 2.2} y2="0.6" />)}
          {ticks.map(t => <line key={`v${t}`} x1="-0.6" y1={t * 2.2} x2="0.6" y2={t * 2.2} />)}
        </g>
      </svg>
    </div>
  );
}

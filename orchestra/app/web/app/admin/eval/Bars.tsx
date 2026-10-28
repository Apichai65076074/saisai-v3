// กราฟแท่งแนวนอน SVG (server) · 1–2 ชุด (on/off หรือ run/เทียบ) · สเกล 0–100% · tooltip = <title>
export type Series = { name: string; color: string };
export type BarRow = { key: string; label: string; values: (number | null)[]; href?: string };

const pct = (v: number | null) => (v === null ? '–' : `${(v * 100).toFixed(1)}%`);

export default function Bars({ title, rows, series, testId }: { title: string; rows: BarRow[]; series: Series[]; testId: string }) {
  const W = 760, LABEL = 190, PLOT = 470, BAR = 14, GAP = 2, PAD = 10;
  const rowH = series.length * (BAR + GAP) + PAD * 2;
  const H = rows.length * rowH + 24;
  return (
    <figure className="eval-chart card" data-testid={testId} data-rows={rows.length}>
      <figcaption>
        <h3>{title}</h3>
        {series.length > 1 && (
          <ul className="eval-legend">
            {series.map((s) => (
              <li key={s.name}><i style={{ background: s.color }} />{s.name}</li>
            ))}
          </ul>
        )}
      </figcaption>
      {rows.length === 0 ? <p className="muted">–</p> : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} width="100%">
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <g key={g}>
              <line x1={LABEL + g * PLOT} x2={LABEL + g * PLOT} y1={0} y2={H - 20} className="eval-grid" />
              <text x={LABEL + g * PLOT} y={H - 6} textAnchor="middle" className="eval-axis">{g * 100}%</text>
            </g>
          ))}
          {rows.map((r, i) => {
            const y0 = i * rowH + PAD;
            const label = <text x={LABEL - 10} y={y0 + (series.length * (BAR + GAP)) / 2 + 4} textAnchor="end" className="eval-axis-label">{r.label}</text>;
            return (
              <g key={r.key} data-key={r.key}>
                {r.href ? <a href={r.href}>{label}</a> : label}
                {series.map((s, j) => {
                  const v = r.values[j] ?? null;
                  const w = Math.max(0, Math.min(1, v ?? 0)) * PLOT;
                  const y = y0 + j * (BAR + GAP);
                  return (
                    <g key={s.name} className="eval-bar" data-series={s.name} data-value={v ?? ''}>
                      <title>{`${r.label} · ${s.name}: ${pct(v)}`}</title>
                      <rect x={LABEL} y={y - 1} width={PLOT} height={BAR + 2} fill="transparent" />
                      {v !== null && <rect x={LABEL} y={y} width={Math.max(w, 1)} height={BAR} rx={3} fill={s.color} />}
                      <text x={LABEL + w + 6} y={y + BAR - 3} className="eval-bar-value">{pct(v)}</text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}
    </figure>
  );
}

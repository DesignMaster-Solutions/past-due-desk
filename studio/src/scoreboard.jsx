// "Who still owes what": a custom AG Studio widget, the friendly scoreboard for a nudge-bot. One line per customer, a
// track that fills as money comes back, the plan and the stage in plain words, and no red ink. It reads its own fields
// from the report schema, so page filters and cross filters from the charts apply to it; clicking a customer
// cross-filters the rest of the board to that account.
import React, { useEffect, useRef, useState } from 'react';

const WANT = ['customer', 'plan', 'stage', 'target', 'recovered', 'stillOwed', 'forgiven', 'reminders', 'daysOverdue'];

export function ScoreboardWidget({ widgetApi, format }) {
  const [state, setState] = useState({ rows: [], f: {} });
  const [picked, setPicked] = useState(null);
  const loaded = useRef(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const table = widgetApi.getSchema().find((t) => t.fields.some((x) => x.key.endsWith('.customer')));
      if (!table) return widgetApi.setDisplayState('noData');
      const f = Object.fromEntries(table.fields.map((x) => [x.key.split('.').pop(), x]));
      if (!WANT.every((k) => f[k])) return widgetApi.setDisplayState('noData');
      widgetApi.setDisplayState('loading', { prominent: !loaded.current });
      const res = await widgetApi.getData({ kind: 'flat', fields: WANT.map((k) => f[k]), limit: { count: 200 } });
      if (!live) return;
      const rows = res.results.rows.map((r) => Object.fromEntries(WANT.map((k) => [k, r[f[k].key]])));
      // Leaderboard order: whoever is closest to square leads, the biggest balance still out sits at the bottom.
      rows.sort((a, b) => b.recovered / (b.target || 1) - a.recovered / (a.target || 1) || a.stillOwed - b.stillOwed);
      loaded.current = rows.length > 0;
      setState({ rows, f });
      widgetApi.setDisplayState(rows.length ? 'displayed' : 'noData');
    })();
    return () => { live = false; };
  }, [widgetApi, format]);

  const { rows, f } = state;
  const money = (k, v) => (f[k] ? widgetApi.formatFieldValue(f[k], v) : v);
  const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const pick = (name) => {
    widgetApi.toggleCrossFilter({ type: 'value', field: f.customer, value: name, group: 0 });
    setPicked((p) => (p === name ? null : name));
  };

  return (
    <div className="sb">
      <div className="sb-head">
        <span>{money('recovered', sum('recovered'))} back · {money('stillOwed', sum('stillOwed'))} still out
          {sum('forgiven') > 0 && <> · {money('forgiven', sum('forgiven'))} forgiven</>}</span>
      </div>
      <ol className="sb-list">
        {rows.map((r, i) => {
          const pct = Math.round(Math.min(1, r.recovered / (r.target || 1)) * 100);
          const square = r.stillOwed === 0 && r.recovered > 0;
          return (
            <li key={r.customer}>
              <button type="button" className={'sb-row' + (picked === r.customer ? ' on' : '')} onClick={() => pick(r.customer)}
                aria-pressed={picked === r.customer} title="Focus the board on this customer">
                <span className={'sb-rank' + (square ? ' done' : '')}>{square ? '✓' : i + 1}</span>
                <span className="sb-who">
                  <b>{r.customer}</b>
                  <small>{r.plan} · {r.stage}{r.reminders > 0 && ` · ${r.reminders} reminder${r.reminders > 1 ? 's' : ''}`}</small>
                </span>
                <span className="sb-track" aria-label={`${pct}% back`}><i className={square ? 'done' : ''} style={{ width: `${pct}%` }} /></span>
                <span className="sb-amt">
                  {square ? 'All square' : `${money('recovered', r.recovered)} of ${money('target', r.target)}`}
                  <small>{square ? `${money('recovered', r.recovered)} back` : `${r.daysOverdue} days late`}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export const scoreboardDefinition = {
  id: 'scoreboard',
  label: 'Who still owes what',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h6"/></svg>',
  form: (params) => params.createDefaults({ dataMappingItems: [] }),
  comp: ScoreboardWidget,
  defaultSize: { width: 640, height: 360 },
  minSize: { width: 320, height: 200 },
  ai: { description: 'Friendly scoreboard of overdue accounts: one line per customer with how much of the planned amount came back, the plan and the stage. Clicking a customer cross-filters the report.' },
};

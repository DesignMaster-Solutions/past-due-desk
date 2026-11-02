// Collections board: the desk's live accounts in one AG Studio report, with the custom "who still owes what"
// scoreboard. Data comes from the same /api/rows the approval grid uses, so planning, sending and PayPal syncs on the
// desk show up here on refresh. The owner can switch to Edit and rebuild the board with Studio's own tools.
import React, { useCallback, useEffect, useMemo, useState, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AgStudio, AgStudioProvider, createWidgets } from 'ag-studio-react';
import { toAccounts } from './board-data.mjs';
import { boardReport } from './report.js';
import { deskTheme } from './theme.js';
import { scoreboardDefinition } from './scoreboard.jsx';
import './styles.css';

const USD = { format: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 0 }) };
const fields = (specs) => specs.map(([id, name, format, hide]) => ({ id, name, format, ...(hide && { hide }), ...(format === 'currencyFormat' && { formatOptions: USD }) }));
// Named totals, so charts and the grid say "Came back" rather than "Came back (sum)".
const total = (id, name, of, description) => ({ id, name, description, format: of === 'reminders' ? 'integerFormat' : 'currencyFormat',
  isMeasure: true, expression: { id: `accounts.${of}`, aggregation: 'sum' }, ...(of !== 'reminders' && { formatOptions: USD }) });

function sourcesFor(accounts) {
  return {
    description: 'Overdue receivables of a small business. An AI agent proposes one collection plan per account within the owner\'s policy; '
      + 'approved plans become PayPal invoices. Target is what the plan asks for after any settlement discount; '
      + 'recovered is what PayPal reports as paid; still out is target minus recovered; forgiven is the discount the owner accepted.',
    sources: [{
      id: 'accounts',
      name: 'Accounts',
      description: 'One row per overdue account on the desk.',
      data: accounts,
      fields: fields([
        ['ref', 'Invoice', 'textFormat'],
        ['customer', 'Customer', 'textFormat'],
        ['currency', 'Currency', 'textFormat', true],
        ['daysOverdue', 'Days late', 'integerFormat'],
        ['agingBucket', 'How late', 'textFormat'],
        ['plan', 'Plan', 'textFormat'],
        ['stage', 'Stage', 'textFormat'],
        ['owed', 'Owed', 'currencyFormat'],
        ['target', 'Plan asks for', 'currencyFormat'],
        ['recovered', 'Came back', 'currencyFormat'],
        ['stillOwed', 'Still out', 'currencyFormat'],
        ['forgiven', 'Forgiven', 'currencyFormat'],
        ['progress', 'Share back', 'percentageFormat', true],
        ['reminders', 'Reminders', 'integerFormat'],
        ['needsYou', 'Waiting on you', 'integerFormat'],
      ]),
    }],
    expressions: [
      total('owedTotal', 'Owed', 'owed', 'What the customers owed when the desk got the account.'),
      total('backTotal', 'Came back', 'recovered', 'Paid through the PayPal invoices.'),
      total('outTotal', 'Still out', 'stillOwed', 'What the plans still expect to collect.'),
      total('forgivenTotal', 'Forgiven', 'forgiven', 'Settlement discounts the owner accepted.'),
      total('remindersTotal', 'Reminders sent', 'reminders', 'PayPal reminders sent on schedule.'),
      {
      id: 'recoveryRate',
      name: 'Collected of plan',
      description: 'Came back / plan asks for, across the selected accounts.',
      format: 'percentageFormat',
      isMeasure: true,
      expression: { operator: 'divide', inputs: [{ id: 'accounts.recovered', aggregation: 'sum' }, { id: 'accounts.target', aggregation: 'sum' }] },
      },
    ],
  };
}

function Board() {
  const [desk, setDesk] = useState(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('view');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/rows');
      if (!r.ok) throw new Error(`desk answered ${r.status}`);
      setDesk(await r.json());
      setErr('');
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const accounts = useMemo(() => (desk ? toAccounts(desk.rows) : []), [desk]);
  const data = useMemo(() => sourcesFor(accounts), [accounts]);
  const widgets = useCallback((config) => createWidgets({
    additionalTypes: [scoreboardDefinition],
    menu: [...config.menu, { label: 'Past Due Desk', widgetIds: ['scoreboard'] }],
  }), []);
  const unplanned = accounts.length > 0 && accounts.every((a) => a.plan === 'Not planned yet');
  const toggle = () => setMode((m) => (m === 'view' ? 'edit' : 'view'));

  return (
    <div className="page">
      <header>
        <h1>Past Due Desk <span>· Collections board</span></h1>
        {desk && <span className="biz">{desk.business}</span>}
        <nav>
          <a href="/">Back to the desk</a>
          <button type="button" onClick={load}>Refresh</button>
          <button type="button" className="primary" onClick={toggle}>{mode === 'view' ? 'Edit board' : 'Done editing'}</button>
        </nav>
      </header>
      {unplanned && <p className="hint">Nothing planned yet: on the <a href="/">desk</a>, press <b>Plan with AI</b>, approve and send, then refresh this board.</p>}
      {err && <p className="err">Could not read the desk: {err}</p>}
      <p className="narrow">The board is laid out for a laptop or a tablet in landscape. On a phone, <a href="/">the desk</a> has the same accounts and every action.</p>
      <main>
        {desk && (
          <AgStudioProvider licenseKey={import.meta.env.VITE_AG_STUDIO_LICENSE || undefined}>
            <AgStudio
              style={{ height: '100%', width: '100%' }}
              theme={deskTheme}
              layout={{ widgetBorderEnabled: true }}
              data={data}
              widgets={widgets}
              initialState={boardReport}
              mode={mode}
            />
          </AgStudioProvider>
        )}
      </main>
      <footer>Sample books of a small web studio. Amounts come from the desk and the PayPal sandbox; reset the demo from the desk to start over.</footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><Board /></StrictMode>);

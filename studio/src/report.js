// The board's starting report (AG Studio state). Field ids ('accounts.stillOwed') refer to the table built in main.jsx.
// Positions are in canvas tracks: 24 columns, rows of studioCanvasRowHeight (18 px).
const at = (xTrack, yTrack, xSpan, ySpan) => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text) => ({ title: { enabled: true, text } });
const field = (id) => ({ id: `accounts.${id}` });
const m = (id) => ({ id });
const kpi = (text, value) => ({ type: 'value', dataMapping: { value: [value] }, format: title(text) });
const legend = { style: { theme: { common: { legend: { enabled: true } } } } };

export const boardReport = {
  selectedPageId: 'collections',
  panels: { filters: { collapsed: true }, data: { collapsed: true } },
  pages: [
    {
      id: 'collections',
      widgets: {
        'kpi-out': kpi('Still out', m('outTotal')),
        'kpi-back': kpi('Came back', m('backTotal')),
        'kpi-rate': kpi('Of the plan collected', { id: 'recoveryRate' }),
        'kpi-you': kpi('Waiting on you', { id: 'accounts.needsYou', aggregation: 'sum' }),
        plan: {
          type: 'button-filter',
          dataMapping: { value: [field('plan')] },
          format: { title: { enabled: false }, style: { dimensions: { height: 30, minWidth: 60 } } },
        },
        scoreboard: { type: 'scoreboard', format: title('Who still owes what') },
        plans: {
          type: 'donut-chart',
          dataMapping: { categoryKey: [field('plan')], valueKey: [m('owedTotal')] },
          format: { ...title('What the agent proposed, by amount owed'), style: { custom: { pieDataLabel: { enabled: true }, totalLabel: { enabled: true } } } },
        },
        customers: {
          type: 'bar-chart-stacked',
          dataMapping: { categoryKey: [field('customer')], valueKey: [m('backTotal'), m('outTotal'), m('forgivenTotal')] },
          format: { ...title('Back, still out and forgiven, by customer'), ...legend },
        },
        aging: {
          type: 'column-chart-grouped',
          dataMapping: { categoryKey: [field('agingBucket')], valueKey: [m('backTotal'), m('outTotal')] },
          sort: [{ field: field('agingBucket'), direction: 'asc' }],
          format: { ...title('By how late it was'), ...legend },
        },
        accounts: {
          type: 'grid',
          dataMapping: {
            cols: [field('ref'), field('customer'), field('plan'), field('stage'), field('daysOverdue'), m('owedTotal'), m('backTotal'), m('outTotal'), m('remindersTotal')],
          },
          sort: [{ field: field('daysOverdue'), direction: 'desc' }],
          format: title('Accounts'),
        },
      },
      widgetLayout: {
        'kpi-out': at(0, 0, 6, 6),
        'kpi-back': at(6, 0, 6, 6),
        'kpi-rate': at(12, 0, 6, 6),
        'kpi-you': at(18, 0, 6, 6),
        plan: at(0, 6, 24, 6),
        scoreboard: at(0, 12, 14, 19),
        plans: at(14, 12, 10, 19),
        customers: at(0, 31, 14, 16),
        aging: at(14, 31, 10, 16),
        accounts: at(0, 47, 24, 17),
      },
    },
  ],
};

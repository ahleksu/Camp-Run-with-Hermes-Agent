// LAYER 3 - DESKTOP PLUGIN (the face): Suki Mart Command Center pane.
//
// Shows the branch scorecard from the plugin's own backend (dashboard/plugin_api.py,
// same query core as the MCP server - ADR 0001). Clicking a branch loads its worst
// tickets, reviews and stockouts. "Brief me" buttons send a prompt to the chat so the
// suki-command-center skill does the reasoning and any write (with confirmation).
//
// Loader rules: only '@hermes/plugin-sdk', 'react', 'react/jsx-runtime' import;
// no JSX syntax; theme variables only, no hardcoded colors.

import { host, useValue, useQuery, useQueryClient, Button, PANES_AREA, PALETTE_AREA } from '@hermes/plugin-sdk'
import { useEffect, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const PLUGIN_ID = 'suki-command-center' // must equal the folder name
const SKILL_PROMPT = 'Use the suki-command-center skill to brief me on the branches that need attention most.'
const branchPrompt = code =>
  `Use the suki-command-center skill to brief me on the ${code} branch and propose actions.`

let rest = () => Promise.reject(new Error('plugin not registered'))

// column: [key, label, worst direction]; 'min' = lowest is worst
const COLUMNS = [
  ['on_time_pct', 'On-time %', 'min'],
  ['unreplied_bad_reviews', 'Bad rev.', 'max'],
  ['urgent_tickets', 'Urgent', 'max'],
  ['stockout_risks', 'Stockout', 'max'],
  ['absence_pct', 'Absent %', 'max']
]

function worstSet(branches, key, dir) {
  const vals = branches.filter(b => b[key] != null).sort((a, b) => (dir === 'min' ? a[key] - b[key] : b[key] - a[key]))
  return new Set(vals.slice(0, 3).map(b => b.code))
}

async function send(prompt) {
  if (!host.composer.submit(null, prompt)) {
    host.notify({ kind: 'info', message: 'Open or focus a chat first, then click again.' })
  }
}

const muted = 'text-xs text-(--ui-text-tertiary)'

function Kpi({ label, value }) {
  return jsxs('div', {
    className: 'flex-1 rounded-md border border-(--ui-stroke-secondary) p-2',
    children: [
      jsx('div', { className: 'text-base font-medium', children: value }),
      jsx('div', { className: muted, children: label })
    ]
  })
}

function Scorecard({ data, selected, onSelect }) {
  const rows = data.branches
  const worst = Object.fromEntries(COLUMNS.map(([k, , d]) => [k, worstSet(rows, k, d)]))
  const cell = 'px-1 py-1 text-right tabular-nums'
  return jsxs('table', {
    className: 'w-full text-xs',
    children: [
      jsx('thead', {
        children: jsxs('tr', {
          className: muted,
          children: [
            jsx('th', { className: 'px-1 py-1 text-left font-normal', children: 'Branch' }),
            ...COLUMNS.map(([k, label]) => jsx('th', { className: cell + ' font-normal', children: label }, k))
          ]
        })
      }),
      jsx('tbody', {
        children: rows.map(b =>
          jsxs(
            'tr',
            {
              onClick: () => onSelect(b.code),
              className:
                'cursor-pointer border-t border-(--ui-stroke-secondary) ' +
                (selected === b.code ? 'bg-(--ui-stroke-secondary)' : ''),
              children: [
                jsx('td', { className: 'px-1 py-1 font-medium', children: b.code }),
                ...COLUMNS.map(([k]) =>
                  jsx(
                    'td',
                    {
                      className: cell + (worst[k].has(b.code) ? ' font-medium text-(--ui-accent)' : ''),
                      children: b[k] == null ? '–' : b[k]
                    },
                    k
                  )
                )
              ]
            },
            b.code
          )
        )
      })
    ]
  })
}

function Section({ title, rows, render }) {
  return jsxs('div', {
    className: 'flex flex-col gap-1',
    children: [
      jsx('div', { className: 'text-xs font-medium', children: title }),
      rows.length === 0
        ? jsx('div', { className: muted, children: 'Nothing flagged.' })
        : rows.map((r, i) => jsx('div', { className: 'text-xs', children: render(r) }, i))
    ]
  })
}

function BranchDetail({ code }) {
  const { data, isLoading, error } = useQuery({
    queryKey: [PLUGIN_ID, 'branch', code],
    queryFn: () => rest(`/branch/${code}`)
  })
  if (isLoading) return jsx('div', { className: muted, children: `Loading ${code}…` })
  if (error) return jsx('div', { className: muted, children: `Could not load ${code}: ${error.message}` })
  return jsxs('div', {
    className: 'flex flex-col gap-3 rounded-md border border-(--ui-stroke-secondary) p-2',
    children: [
      jsx('div', { className: 'font-medium', children: code }),
      jsx(Section, {
        title: 'Open tickets (urgent first)',
        rows: data.tickets,
        render: t => `${t.ticket_number} · ${t.priority} · ${t.category} · ${Math.round(t.age_days)}d old`
      }),
      jsx(Section, {
        title: 'Unreplied bad reviews',
        rows: data.reviews,
        render: r => `#${r.review_id} · ${r.rating}★ ${r.topic || ''} · ${r.body}`
      }),
      jsx(Section, {
        title: 'Stockout risks',
        rows: data.stockouts,
        render: s => `${s.product} · ${s.on_hand} left · ${s.days_of_cover}d cover · ${s.supplier}`
      }),
      jsx(Button, { onClick: () => send(branchPrompt(code)), children: `Brief me on ${code}` })
    ]
  })
}

function CommandCenter() {
  const busy = useValue(host.state.busy)
  const qc = useQueryClient()
  const [selected, setSelected] = useState(null)
  const { data, isLoading, error } = useQuery({
    queryKey: [PLUGIN_ID, 'scorecard'],
    queryFn: () => rest('/scorecard')
  })

  // Hermes may have escalated a ticket or drafted a reply: refresh when a chat turn ends.
  useEffect(() => {
    if (!busy) qc.invalidateQueries({ queryKey: [PLUGIN_ID] })
  }, [busy])

  let body
  if (isLoading) body = jsx('div', { className: muted, children: 'Loading scorecard…' })
  else if (error)
    body = jsx('div', {
      className: muted,
      children: `Backend unavailable (${error.message}). Enable the plugin in config.yaml and restart the gateway; see README.`
    })
  else {
    const t = data.totals
    body = jsxs('div', {
      className: 'flex flex-col gap-3',
      children: [
        jsxs('div', {
          className: 'flex gap-2',
          children: [
            jsx(Kpi, { label: 'Open tickets', value: t.open_tickets }),
            jsx(Kpi, { label: 'Bad reviews', value: t.unreplied_bad_reviews }),
            jsx(Kpi, { label: 'Stockouts', value: t.stockout_risks })
          ]
        }),
        jsx(Scorecard, { data, selected, onSelect: setSelected }),
        jsx('div', {
          className: muted,
          children: `${data.window_days}-day window to ${data.as_of.slice(0, 10)} · ${t.loyalty_points_expiring.toLocaleString()} loyalty pts expire within 30d · highlight = worst 3`
        }),
        selected ? jsx(BranchDetail, { code: selected }) : null
      ]
    })
  }

  return jsxs('div', {
    className: 'flex h-full flex-col gap-3 overflow-auto p-3 text-sm',
    children: [
      jsxs('div', {
        children: [
          jsx('div', { className: 'font-medium', children: 'Suki Mart · Command Center' }),
          jsx('div', { className: muted, children: busy ? 'Hermes is working…' : 'Click a branch to drill down.' })
        ]
      }),
      jsx(Button, { disabled: busy, onClick: () => send(SKILL_PROMPT), children: 'Brief me on what needs attention' }),
      body
    ]
  })
}

export default {
  id: PLUGIN_ID,
  name: 'Suki Command Center',
  register(ctx) {
    rest = (path, opts) => ctx.rest(path, opts)
    ctx.register({
      id: 'pane',
      area: PANES_AREA,
      title: 'Command Center',
      data: { placement: 'right', width: '460px' },
      render: () => jsx(CommandCenter, {})
    })
    ctx.register({
      id: 'brief',
      area: PALETTE_AREA,
      data: {
        id: `${PLUGIN_ID}.brief`,
        label: 'Suki: Brief me on what needs attention',
        keywords: ['suki', 'branches', 'command', 'center'],
        run: () => send(SKILL_PROMPT)
      }
    })
  }
}

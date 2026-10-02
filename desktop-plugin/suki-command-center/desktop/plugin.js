// LAYER 3 - DESKTOP PLUGIN (the face): Suki Mart Command Center pane.
//
// Reads from the plugin's own backend (dashboard/plugin_api.py, same query core as
// the MCP server - ADR 0001), so the pane renders without a model turn. Every action
// button sends a prompt into the chat; the suki-command-center skill does the
// reasoning and asks the admin to confirm before any write (ADR 0002). When the
// chat turn ends the pane refetches, so the escalation shows up here.
//
// Loader rules: only '@hermes/plugin-sdk', 'react', 'react/jsx-runtime' import;
// no JSX syntax; theme variables only, no hardcoded colors. Disk plugins are not
// scanned by Tailwind, so layout lives in the CSS string below.

import { host, useValue, useQuery, useQueryClient, Button, Tip, icons, PANES_AREA, PALETTE_AREA } from '@hermes/plugin-sdk'
import { useEffect, useMemo, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const PLUGIN_ID = 'suki-command-center' // must equal the folder name

const SKILL_PROMPT = 'Use the suki-command-center skill to brief me on the branches that need attention most.'
const branchPrompt = code => `Use the suki-command-center skill to brief me on the ${code} branch and propose actions.`
const escalatePrompt = n =>
  `Use the suki-command-center skill to escalate ticket ${n}. Propose the reason you would log, and ask me to confirm before you call the tool.`
const draftPrompt = (id, code) =>
  `Use the suki-command-center skill to draft a reply to review #${id} at ${code}. Read the review, show me the draft text, and ask me to confirm before you save it.`

let rest = () => Promise.reject(new Error('plugin not registered'))

// [key, header, direction in which the value is worst, hint]
const COLUMNS = [
  ['on_time_pct', 'On-time', 'min', 'Delivered by the promised time, last 30 days. Lowest is worst.'],
  ['unreplied_bad_reviews', 'Reviews', 'max', '1-2 star reviews with no reply, last 30 days.'],
  ['urgent_tickets', 'Urgent', 'max', 'Open tickets at urgent priority right now.'],
  ['stockout_risks', 'Stockout', 'max', 'Products with 2 days of cover or less and no purchase order on the way.'],
  ['absence_pct', 'Absent', 'max', 'Shifts ended as a no-show or sick call, last 30 days.']
]
const SUFFIX = { on_time_pct: '%', absence_pct: '%' }
const PHRASE = {
  on_time_pct: v => `${v}% on-time`,
  unreplied_bad_reviews: v => `${v} unreplied bad review${v === 1 ? '' : 's'}`,
  urgent_tickets: v => `${v} urgent ticket${v === 1 ? '' : 's'}`,
  stockout_risks: v => `${v} stockout risk${v === 1 ? '' : 's'}`,
  absence_pct: v => `${v}% absence`
}

const CSS = `
.sk{container-type:inline-size;display:flex;flex-direction:column;gap:18px;height:100%;overflow:auto;padding:14px 16px 20px;font-size:12px;line-height:16px;color:var(--ui-text-primary);font-variant-numeric:tabular-nums}
.sk *{box-sizing:border-box}
.sk-muted{color:var(--ui-text-tertiary)}
.sk-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.sk-title{font-size:14px;line-height:20px;font-weight:600;letter-spacing:-0.01em}
.sk-head-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}
.sk-lead{display:flex;flex-direction:column;gap:3px;padding-bottom:14px;border-bottom:1px solid var(--ui-stroke-secondary)}
.sk-lead-main{font-size:15px;line-height:22px;font-weight:500;letter-spacing:-0.01em;text-wrap:balance}
.sk-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}
.sk-stat{display:flex;flex-direction:column;gap:2px;padding:0 12px;border-left:1px solid var(--ui-stroke-secondary)}
.sk-stat:first-child{padding-left:0;border-left:0}
.sk-stat-value{font-size:20px;line-height:26px;font-weight:600;letter-spacing:-0.02em}
.sk-label{font-size:11px;line-height:14px;color:var(--ui-text-tertiary)}
.sk-section{display:flex;flex-direction:column;gap:6px}
.sk-section-title{display:flex;align-items:baseline;justify-content:space-between;font-size:12px;font-weight:600}

.sk-table{display:flex;flex-direction:column}
.sk-row{display:grid;grid-template-columns:minmax(0,2.3fr) repeat(5,minmax(0,.85fr));align-items:center;column-gap:6px;width:100%;padding:0 6px}
.sk-colhead{height:26px;border-bottom:1px solid var(--ui-stroke-secondary)}
.sk-sort{white-space:nowrap;display:flex;align-items:center;justify-content:flex-end;gap:2px;height:100%;padding:0;border:0;background:none;font:inherit;font-size:11px;color:var(--ui-text-tertiary);cursor:pointer}
.sk-sort:first-child{justify-content:flex-start}
.sk-sort:hover,.sk-sort[aria-sort]:not([aria-sort=none]){color:var(--ui-text-primary)}
.sk-sort:focus-visible,.sk-branch:focus-visible{outline:2px solid var(--ui-accent);outline-offset:-2px;border-radius:3px}
.sk-branch{height:40px;border:0;border-bottom:1px solid var(--ui-stroke-tertiary,var(--ui-stroke-secondary));background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;transition:background-color 120ms ease-out}
.sk-branch:hover{background:var(--ui-row-hover-background,var(--ui-control-hover-background))}
.sk-branch[aria-expanded=true]{background:var(--ui-row-active-background,var(--ui-control-active-background))}
.sk-name{display:flex;align-items:center;gap:8px;min-width:0}
.sk-code{font-weight:600;letter-spacing:0.02em}
.sk-pin{width:6px;height:6px;border-radius:50%;background:var(--ui-red);flex-shrink:0}
.sk-pin-empty{background:transparent}
.sk-full{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--ui-text-tertiary)}
.sk-cell{display:flex;flex-direction:column;align-items:flex-end;gap:3px;color:var(--ui-text-secondary)}
.sk-cell[data-worst=true]{color:var(--ui-red);font-weight:600}
.sk-bar{width:100%;max-width:44px;height:2px;border-radius:1px;background:var(--ui-stroke-secondary);overflow:hidden}
.sk-bar>i{display:block;height:100%;background:var(--ui-text-quaternary)}
.sk-cell[data-worst=true] .sk-bar>i{background:var(--ui-red)}

.sk-detail{display:flex;flex-direction:column;gap:14px;padding:12px 6px 14px 20px;border-bottom:1px solid var(--ui-stroke-secondary);animation:sk-in 160ms cubic-bezier(.22,1,.36,1)}
@keyframes sk-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
.sk-item{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;column-gap:10px;padding:5px 0}
.sk-item+.sk-item{border-top:1px solid var(--ui-stroke-tertiary,var(--ui-stroke-secondary))}
.sk-item-main{display:flex;flex-direction:column;gap:2px;min-width:0}
.sk-item-top{display:flex;align-items:center;gap:6px;min-width:0}
.sk-id{font-weight:600}
.sk-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--ui-text-secondary)}
.sk-tag{padding:0 5px;border-radius:3px;font-size:10.5px;line-height:16px;font-weight:500;background:var(--ui-bg-quaternary);color:var(--ui-text-secondary)}
.sk-tag[data-tone=urgent]{background:color-mix(in srgb,var(--ui-red) 14%,transparent);color:var(--ui-red)}
.sk-tag[data-tone=high]{background:color-mix(in srgb,var(--ui-orange,var(--ui-accent)) 16%,transparent);color:var(--ui-orange,var(--ui-accent))}
.sk-cover{display:flex;align-items:center;gap:8px}
.sk-empty{padding:6px 0;color:var(--ui-text-tertiary)}
.sk-slip{display:grid;grid-template-columns:minmax(0,1fr) auto auto;column-gap:12px;align-items:baseline;padding:5px 0}
.sk-slip+.sk-slip,.sk-log+.sk-log{border-top:1px solid var(--ui-stroke-tertiary,var(--ui-stroke-secondary))}
.sk-slip-days{font-weight:600;color:var(--ui-red)}
.sk-log{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:12px;padding:5px 0}
.sk-skel{height:40px;border-bottom:1px solid var(--ui-stroke-tertiary,var(--ui-stroke-secondary));background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--ui-text-primary) 5%,transparent),transparent);background-size:200% 100%;animation:sk-shimmer 1.2s linear infinite}
@keyframes sk-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
@container (max-width:460px){.sk-full{display:none}.sk-row{grid-template-columns:minmax(0,.8fr) repeat(5,minmax(0,1fr));column-gap:4px}.sk-strip{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:12px}.sk-stat:nth-child(odd){padding-left:0;border-left:0}.sk-slip{grid-template-columns:minmax(0,1fr) auto}.sk-slip>.sk-label{display:none}}
@media (prefers-reduced-motion:reduce){.sk-detail,.sk-skel{animation:none}.sk-branch{transition:none}}
`

// h(tag, props, ...children): jsxs with falsy children dropped. A `key` prop is passed through.
function h(tag, props, ...kids) {
  const { key, ...rest } = props || {}
  return jsxs(tag, { ...rest, children: kids.flat().filter(k => k != null && k !== false) }, key)
}

function send(prompt) {
  if (!host.composer.submit(null, prompt)) {
    host.notify({ kind: 'info', message: 'Open or focus a chat first, then click again.' })
  }
}

const shortName = b => b.name.replace(/^Suki Mart\s+/, '')

// Rank every branch on each measure (worst first). Score = sum of (12 - rank), so a branch
// that is near the bottom on several measures outranks one that is bad on a single measure.
function rankBranches(branches) {
  const worstRank = {}
  const score = Object.fromEntries(branches.map(b => [b.code, 0]))
  for (const [key, , dir] of COLUMNS) {
    const ordered = branches
      .filter(b => b[key] != null)
      .sort((a, b) => (dir === 'min' ? a[key] - b[key] : b[key] - a[key]))
    worstRank[key] = new Map(ordered.map((b, i) => [b.code, i]))
    ordered.forEach((b, i) => (score[b.code] += ordered.length - i))
  }
  return { worstRank, score }
}

function headline(branches, worstRank, score) {
  const ranked = [...branches].sort((a, b) => score[b.code] - score[a.code])
  const top = ranked.slice(0, 3)
  const lead = top[0]
  const reasons = COLUMNS.filter(([k]) => lead[k] != null && worstRank[k].get(lead.code) < 3)
    .sort((a, b) => worstRank[a[0]].get(lead.code) - worstRank[b[0]].get(lead.code))
    .slice(0, 3)
    .map(([k]) => PHRASE[k](lead[k]))
  const names = top.map(shortName)
  const sentence = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} need help first.`
  return { sentence, detail: reasons.length ? `${shortName(lead)}: ${reasons.join(', ')}.` : null, top: new Set(top.map(b => b.code)) }
}

function Stat({ label, value, sub }) {
  return h('div', { className: 'sk-stat' },
    h('div', { className: 'sk-label' }, label),
    h('div', { className: 'sk-stat-value' }, value),
    h('div', { className: 'sk-label' }, sub))
}

function ActionButton({ label, icon, onClick }) {
  return jsx(Tip, {
    label,
    children: jsx(Button, {
      variant: 'ghost', size: 'xs', 'aria-label': label, onClick,
      children: [jsx(icon, { key: 'i', 'aria-hidden': true }), label.split(' ')[0]]
    })
  })
}

function Section({ title, count, children }) {
  return h('div', { className: 'sk-section' },
    h('div', { className: 'sk-section-title' }, h('span', null, title), count != null && h('span', { className: 'sk-label' }, count)),
    children)
}

function BranchDetail({ code }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [PLUGIN_ID, 'branch', code],
    queryFn: () => rest(`/branch/${code}`)
  })
  if (isLoading) return h('div', { className: 'sk-detail' }, h('div', { className: 'sk-skel' }), h('div', { className: 'sk-skel' }))
  if (error)
    return h('div', { className: 'sk-detail' },
      h('div', { className: 'sk-muted' }, `Could not load ${code}: ${error.message}`),
      jsx(Button, { variant: 'outline', size: 'xs', onClick: () => refetch(), children: 'Try again' }))

  return h('div', { className: 'sk-detail' },
    h(Section, { title: 'Open tickets', count: 'urgent first, oldest first' },
      data.tickets.length === 0
        ? h('div', { className: 'sk-empty' }, 'No open tickets at this branch.')
        : data.tickets.map(t =>
            h('div', { key: t.ticket_number, className: 'sk-item' },
              h('div', { className: 'sk-item-main' },
                h('div', { className: 'sk-item-top' },
                  h('span', { className: 'sk-id' }, t.ticket_number),
                  h('span', { className: 'sk-tag', 'data-tone': t.priority }, t.priority),
                  h('span', { className: 'sk-label' }, `${t.category} · ${Math.round(t.age_days)}d old`)),
                h('div', { className: 'sk-clamp' }, t.subject)),
              t.priority === 'urgent'
                ? null
                : jsx(ActionButton, { label: `Escalate ${t.ticket_number}`, icon: icons.ArrowUp, onClick: () => send(escalatePrompt(t.ticket_number)) })))),
    h(Section, { title: 'Unreplied bad reviews', count: 'worst first' },
      data.reviews.length === 0
        ? h('div', { className: 'sk-empty' }, 'No unreplied bad reviews in the window.')
        : data.reviews.map(r =>
            h('div', { key: r.review_id, className: 'sk-item' },
              h('div', { className: 'sk-item-main' },
                h('div', { className: 'sk-item-top' },
                  h('span', { className: 'sk-id' }, `${r.rating} of 5`),
                  h('span', { className: 'sk-label' }, `#${r.review_id}${r.topic ? ` · ${r.topic}` : ''} · ${r.source}`)),
                h('div', { className: 'sk-clamp' }, r.body)),
              jsx(ActionButton, { label: `Draft reply to #${r.review_id}`, icon: icons.Pencil, onClick: () => send(draftPrompt(r.review_id, code)) })))),
    h(Section, { title: 'Stockout risks', count: 'lowest cover first' },
      data.stockouts.length === 0
        ? h('div', { className: 'sk-empty' }, 'No stockout risks. Anything low already has an order on the way.')
        : data.stockouts.map(s =>
            h('div', { key: s.sku, className: 'sk-item' },
              h('div', { className: 'sk-item-main' },
                h('div', { className: 'sk-item-top' }, h('span', { className: 'sk-id' }, s.product)),
                h('div', { className: 'sk-label' }, `${s.on_hand} left · ${s.days_of_cover} days of cover · ${s.supplier} (${s.promised_lead_time_days}d lead time)`))))),
    data.expiring.length > 0 && h(Section, { title: 'Expiring within 3 days', count: 'largest cost first' },
      data.expiring.map(e =>
        h('div', { key: e.sku, className: 'sk-item' },
          h('div', { className: 'sk-item-main' },
            h('div', { className: 'sk-item-top' }, h('span', { className: 'sk-id' }, e.product)),
            h('div', { className: 'sk-label' }, `${e.on_hand} units · ${e.days_left === 0 ? 'expires today' : `${e.days_left}d left`} · ${e.cost_at_risk.toLocaleString()} cost at risk`))))),
    jsx(Button, { variant: 'secondary', size: 'sm', onClick: () => send(branchPrompt(code)), children: `Brief me on ${code}` }))
}

function Scorecard({ data }) {
  const [selected, setSelected] = useState(null)
  const [sort, setSort] = useState({ key: 'attention', dir: 'desc' })
  const { worstRank, score } = useMemo(() => rankBranches(data.branches), [data])
  const { top } = useMemo(() => headline(data.branches, worstRank, score), [data])

  const rows = useMemo(() => {
    const dirOf = sort.dir === 'asc' ? 1 : -1
    const val = b => (sort.key === 'attention' ? score[b.code] : b[sort.key])
    return [...data.branches].sort((a, b) => {
      const x = val(a), y = val(b)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return (x - y) * dirOf
    })
  }, [data, sort, score])

  const toggleSort = key => {
    const worstFirst = key === 'on_time_pct' ? 'asc' : 'desc'
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: worstFirst }))
  }
  const ariaSort = key => (sort.key !== key ? 'none' : sort.dir === 'asc' ? 'ascending' : 'descending')

  return h('div', { className: 'sk-table', role: 'table', 'aria-label': 'Branch scorecard' },
    h('div', { className: 'sk-row sk-colhead', role: 'row' },
      h('button', { type: 'button', className: 'sk-sort', 'aria-sort': ariaSort('attention'), onClick: () => toggleSort('attention'), title: 'Rank across all five measures. Worst first.' }, 'Branch'),
      ...COLUMNS.map(([key, label, , hint]) =>
        h('button', { key, type: 'button', className: 'sk-sort', 'aria-sort': ariaSort(key), onClick: () => toggleSort(key), title: hint }, label))),
    rows.map(b =>
      h('div', { key: b.code, role: 'rowgroup' },
        h('button', {
          type: 'button', className: 'sk-row sk-branch', role: 'row', 'aria-expanded': selected === b.code,
          onClick: () => setSelected(s => (s === b.code ? null : b.code))
        },
          h('span', { className: 'sk-name' },
            h('span', { className: top.has(b.code) ? 'sk-pin' : 'sk-pin sk-pin-empty', title: top.has(b.code) ? 'Needs attention first' : undefined }),
            h('span', { className: 'sk-code' }, b.code),
            h('span', { className: 'sk-full' }, shortName(b))),
          ...COLUMNS.map(([key]) => {
            const v = b[key]
            const worst = v != null && worstRank[key].get(b.code) < 3
            return h('span', { key, className: 'sk-cell', 'data-worst': worst, title: worst ? 'Among the 3 worst branches on this measure' : undefined },
              h('span', null, v == null ? 'n/a' : `${v}${SUFFIX[key] || ''}`),
              key === 'on_time_pct' && v != null && h('span', { className: 'sk-bar', 'aria-hidden': true }, h('i', { style: { width: `${v}%` } })))
          })),
        selected === b.code && h(BranchDetail, { code: b.code }))))
}

function Skeleton() {
  return h('div', { 'aria-busy': true, 'aria-label': 'Loading scorecard' }, ...Array.from({ length: 7 }, (_, i) => h('div', { key: i, className: 'sk-skel' })))
}

function Recorded() {
  const { data } = useQuery({ queryKey: [PLUGIN_ID, 'actions'], queryFn: () => rest('/actions') })
  if (!data) return null
  return h(Section, { title: 'Recorded by Hermes', count: data.length ? `last ${data.length}` : null },
    data.length === 0
      ? h('div', { className: 'sk-empty' }, 'Nothing yet. Brief me, approve an action, and it shows up here.')
      : data.map(a =>
          h('div', { key: a.id, className: 'sk-log' },
            h('span', { className: 'sk-label' }, a.created_at.slice(5, 16)),
            h('span', null,
              h('span', { className: 'sk-id' }, a.action === 'escalate_ticket' ? `Escalated ${a.target}` : `Draft saved for ${a.target}`),
              h('span', { className: 'sk-clamp' }, a.detail)))))
}

function Suppliers() {
  const { data } = useQuery({ queryKey: [PLUGIN_ID, 'suppliers'], queryFn: () => rest('/suppliers') })
  if (!data || data.length === 0) return null
  return h(Section, { title: 'Why stockouts happen', count: 'actual vs promised lead time' },
    data.map(s =>
      h('div', { key: s.supplier, className: 'sk-slip' },
        h('span', { className: 'sk-full', style: { color: 'var(--ui-text-primary)' } }, s.supplier),
        h('span', { className: 'sk-label' }, `${s.promised_days}d promised, ${s.actual_days}d actual`),
        h('span', { className: 'sk-slip-days' }, `+${s.slip_days}d`))))
}

function CommandCenter() {
  const busy = useValue(host.state.busy)
  const qc = useQueryClient()
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: [PLUGIN_ID, 'scorecard'],
    queryFn: () => rest('/scorecard')
  })

  // Hermes may have escalated a ticket or drafted a reply: refresh when a chat turn ends.
  useEffect(() => {
    if (!busy) qc.invalidateQueries({ queryKey: [PLUGIN_ID] })
  }, [busy])

  const lead = useMemo(() => {
    if (!data) return null
    const { worstRank, score } = rankBranches(data.branches)
    return headline(data.branches, worstRank, score)
  }, [data])

  const t = data && data.totals
  return h('div', { className: 'sk' },
    h('div', { className: 'sk-head' },
      h('div', null,
        h('div', { className: 'sk-title' }, 'Command Center'),
        h('div', { className: 'sk-label' },
          data ? `Suki Mart · ${data.branches.length} branches · ${data.window_days} days to ${data.as_of.slice(0, 10)}` : 'Suki Mart')),
      h('div', { className: 'sk-head-actions' },
        jsx(Tip, { label: 'Refresh', children: jsx(Button, { variant: 'ghost', size: 'icon-xs', 'aria-label': 'Refresh scorecard', disabled: isFetching, onClick: () => qc.invalidateQueries({ queryKey: [PLUGIN_ID] }), children: jsx(icons.RefreshCw, {}) }) }),
        jsx(Button, { disabled: busy, onClick: () => send(SKILL_PROMPT), children: busy ? 'Hermes is working…' : 'Brief me' }))),
    error
      ? h('div', { className: 'sk-section' },
          h('div', null, 'The scorecard backend did not respond.'),
          h('div', { className: 'sk-muted' }, `${error.message}. Add suki-command-center to plugins.enabled in config.yaml and restart the gateway (docs/SETUP.md).`),
          jsx(Button, { variant: 'outline', size: 'sm', onClick: () => refetch(), children: 'Try again' }))
      : isLoading || !data
        ? h(Skeleton)
        : h(Loaded, { data, lead, t }))
}

function Loaded({ data, lead, t }) {
  return h('div', { style: { display: 'contents' } },
    h('div', { className: 'sk-lead' },
      h('div', { className: 'sk-lead-main' }, lead.sentence),
      lead.detail && h('div', { className: 'sk-muted' }, lead.detail)),
    h('div', { className: 'sk-strip' },
      h(Stat, { label: 'Open tickets', value: t.open_tickets, sub: `${t.urgent_tickets} urgent` }),
      h(Stat, { label: 'Bad reviews', value: t.unreplied_bad_reviews, sub: 'no reply yet' }),
      h(Stat, { label: 'Stockout risks', value: t.stockout_risks, sub: 'no order coming' }),
      h(Stat, { label: 'Expiring', value: t.expiring_soon, sub: 'within 3 days' })),
    h(Scorecard, { data }),
    h(Recorded),
    h(Suppliers),
    h('div', { className: 'sk-label' },
      `${t.loyalty_points_expiring.toLocaleString()} loyalty points expire within 30 days. Red marks the 3 worst branches per measure. Branch order is the sum of ranks across all five measures.`))
}

export default {
  id: PLUGIN_ID,
  name: 'Suki Command Center',
  register(ctx) {
    rest = (path, opts) => ctx.rest(path, opts)
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.append(style)
    ctx.onDispose(() => style.remove())
    ctx.register({
      id: 'pane',
      area: PANES_AREA,
      title: 'Command Center',
      data: { placement: 'right', width: '540px' },
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

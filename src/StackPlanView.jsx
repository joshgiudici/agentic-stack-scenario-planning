import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowDown19, faArrowDown91, faEllipsis, faXmark } from '@fortawesome/free-solid-svg-icons'
import { DIRECTORY_DEPARTMENTS, FLOOR_OPTIONS } from './mockData.js'
import { NEIGHBORHOOD_PALETTE } from './neighborhoodData.js'
import {
  buildStackPlanModel,
  departmentColor,
  floorLegend,
} from './stackPlanData.js'
import { createStackDraft } from './stackPlanPrompt.js'

function othersLabel(count) {
  return count === 1 ? 'and 1 other' : `and ${count} others`
}

const STARTS = [
  { id: 'assignments', label: 'Build from current desk assignments' },
  { id: 'usage', label: 'Build from desk usage' },
  { id: 'free-space', label: 'Help me free up extra space' },
  { id: 'growth', label: 'Help me plan for upcoming growth' },
]

const GROUPINGS = [
  { id: 'department', label: 'Departments' },
  { id: 'manager', label: 'Manager' },
  { id: 'neighborhood', label: 'Existing neighborhoods' },
]

const USAGE_CAVEATS = [
  'These numbers account for check-ins for all desks whether they are assigned, hot, or hotel desks.',
  'I’ve also made sure to consider in-office peak days, so that we’re not basing usage on days with lowest attendance.',
]

function groupingLabel(basis) {
  if (basis === 'manager') return 'manager'
  if (basis === 'neighborhood') return 'existing neighborhoods'
  return 'departments'
}

function planNote(source, basis) {
  const group = groupingLabel(basis)
  return source === 'usage' ? `Desk usage organized by ${group}` : `Desk assignments organized by ${group}`
}

function assignmentActivity(basis) {
  const group = groupingLabel(basis)
  return [
    {
      id: 'assignments',
      active: 'Fetching live desk assignments...',
      pending: 'Fetch live desk assignments',
      done: 'Found live desk assignments',
    },
    {
      id: 'group',
      active: `Matching desks to ${group}...`,
      pending: `Match desks to ${group}`,
      done: `Matched desks to ${group}`,
    },
    {
      id: 'floors',
      active: 'Building allocations for each floor...',
      pending: 'Build allocations for each floor',
      done: 'Built allocations for each floor',
    },
  ]
}

function usageActivity(basis) {
  const group = groupingLabel(basis)
  return [
    {
      id: 'checkins',
      active: 'Fetching desk check-ins from the last 90 days...',
      pending: 'Fetch desk check-ins from the last 90 days',
      done: 'Found desk check-ins from the last 90 days',
    },
    {
      id: 'peak',
      active: 'Checking peak in-office days...',
      pending: 'Check peak in-office days',
      done: 'Checked peak in-office days',
    },
    {
      id: 'group',
      active: `Matching check-ins to ${group}...`,
      pending: `Match check-ins to ${group}`,
      done: `Matched check-ins to ${group}`,
    },
  ]
}

const UPDATE_ACTIVITY = [
  {
    id: 'review',
    active: 'Reviewing the current stack plan...',
    pending: 'Review the current stack plan',
    done: 'Reviewed the current stack plan',
  },
  {
    id: 'desks',
    active: 'Checking open desks on each floor...',
    pending: 'Check open desks on each floor',
    done: 'Checked open desks on each floor',
  },
  {
    id: 'update',
    active: 'Updating floor allocations...',
    pending: 'Update floor allocations',
    done: 'Updated floor allocations',
  },
]

function generatedPlanCopy(source, basis) {
  if (source === 'assignments' && basis === 'manager') {
    return [
      'I’ve generated a stack plan based on your current floor plan’s desk assignments organized by manager.',
      'Each manager represented and the number of desks per manager is based on the current desk assignments that are live for this building.',
    ].join('\n\n')
  }
  if (source === 'assignments' && basis === 'neighborhood') {
    return [
      'I’ve generated a stack plan based on your current floor plan’s desk assignments, organized by your existing published Neighborhoods across each floor.',
      'Each neighborhood represented and the number of desks per neighborhood is based on the current desk assignments that are live for this building.',
    ].join('\n\n')
  }
  if (source === 'assignments') {
    return [
      'I’ve generated a stack plan based on your current floor plan’s desk assignments organized by departments.',
      'Each department represented and the number of desks per department is based on the current desk assignments that are live for this building.',
    ].join('\n\n')
  }
  const intro = basis === 'neighborhood'
    ? 'I’ve generated a stack plan organized by your existing published Neighborhoods across each floor.'
    : basis === 'manager'
      ? 'I’ve generated a stack plan organized by manager.'
      : 'I’ve generated a stack plan organized by departments.'
  const counts = basis === 'neighborhood'
    ? 'The number of allocations per neighborhood reflects usage numbers of desk check-ins of desks in each neighborhood for the last 90 days.'
    : basis === 'manager'
      ? 'The number of allocations per manager reflects usage numbers of desk check-ins of desks for each manager for the last 90 days.'
      : 'The number of allocations per department reflects usage numbers of desk check-ins of desks in each department for the last 90 days.'
  return [intro, counts, ...USAGE_CAVEATS].join('\n\n')
}

function releaseShare(catalog) {
  let released = 0
  const next = catalog.map((row) => {
    const drop = Math.round(row.count * 0.2)
    released += drop
    return { ...row, count: row.count - drop }
  })
  if (released === 0) {
    const largest = next.reduce((best, row) => (row.count > (best?.count ?? 0) ? row : best), null)
    if (largest?.count) largest.count -= 1
  }
  return next.filter((row) => row.count > 0)
}

function holdBackUnused(draft, basis) {
  return {
    ...draft,
    note: planNote('usage', basis),
    detail: null,
    groupType: basis === 'manager' ? 'manager' : 'department',
    floors: draft.floors.map((floor) => ({
      ...floor,
      catalog: releaseShare(floor.catalog),
    })),
  }
}

function openDesks(floor) {
  return Math.max(0, floor.total - floor.catalog.reduce((sum, row) => sum + row.count, 0))
}

function inactivateFloor(draft, floorId, basis) {
  const source = draft.floors.find((floor) => floor.id === floorId)
  const displaced = source.catalog.map((row) => ({ ...row }))
  const floors = draft.floors.map((floor) => ({
    ...floor,
    catalog: floor.id === floorId ? [] : floor.catalog.map((row) => ({ ...row })),
  }))
  const receivers = floors.filter((floor) => floor.id !== floorId)
  let leftover = 0

  for (const row of displaced) {
    let remaining = row.count
    const hosts = [
      ...receivers.filter((floor) => floor.catalog.some((item) => item.key === row.key)),
      ...receivers.filter((floor) => !floor.catalog.some((item) => item.key === row.key)),
    ]
    for (const target of hosts) {
      if (remaining <= 0) break
      const room = openDesks(target)
      if (room <= 0) continue
      const add = Math.min(remaining, room)
      let existing = target.catalog.find((item) => item.key === row.key)
      if (!existing) {
        existing = { key: row.key, label: row.label, color: row.color, count: 0 }
        target.catalog.push(existing)
      }
      existing.count += add
      remaining -= add
    }
    leftover += remaining
  }

  const group = groupingLabel(basis)
  return {
    draft: {
      ...draft,
      note: `Inactivated ${source.label}, organized by ${group}`,
      detail: null,
      groupType: basis === 'manager' ? 'manager' : 'department',
      floors,
    },
    leftover,
    floorLabel: source.label,
  }
}

function inactivateActivity(basis, floorLabel) {
  const group = groupingLabel(basis)
  return [
    {
      id: 'assignments',
      active: 'Fetching live desk assignments...',
      pending: 'Fetch live desk assignments',
      done: 'Found live desk assignments',
    },
    {
      id: 'group',
      active: `Matching desks to ${group}...`,
      pending: `Match desks to ${group}`,
      done: `Matched desks to ${group}`,
    },
    {
      id: 'move',
      active: `Moving ${floorLabel} allocations onto the other floors...`,
      pending: `Move ${floorLabel} allocations onto the other floors`,
      done: `Moved ${floorLabel} allocations onto the other floors`,
    },
  ]
}

function inactivatedPlanCopy(floorLabel, basis, leftover) {
  const group = groupingLabel(basis)
  const paragraphs = [
    `I’ve inactivated ${floorLabel} and redistributed its allocations across the other floors, organized by ${group}.`,
    'The desks that moved are based on the current desk assignments that are live for this building.',
  ]
  if (leftover > 0) {
    paragraphs.push(
      leftover === 1
        ? 'One desk is unassigned because the other floors are full.'
        : `${leftover} desks are unassigned because the other floors are full.`,
    )
  }
  return paragraphs.join('\n\n')
}

function growDraft(draft, mode) {
  let added = 0
  const floors = draft.floors.map((floor) => {
    const catalog = floor.catalog.map((row) => ({ ...row }))
    let open = Math.max(0, floor.total - catalog.reduce((sum, row) => sum + row.count, 0))
    const give = (row, amount) => {
      const add = Math.min(amount, open)
      if (add <= 0) return
      row.count += add
      open -= add
      added += add
    }

    if (mode === 'all') {
      const rows = catalog.filter((row) => row.count > 0).sort((a, b) => b.count - a.count)
      for (const row of rows) give(row, 1)
      return { ...floor, catalog: catalog.filter((row) => row.count > 0) }
    }

    let row = catalog.find((item) => item.key === mode)
    if (row?.count) give(row, 2)
    return { ...floor, catalog: catalog.filter((item) => item.count > 0) }
  })

  if (mode !== 'all' && added === 0) {
    const label = mode.replace(/^dept:/, '')
    const ranked = [...floors].sort((a, b) => {
      const openA = a.total - a.catalog.reduce((sum, row) => sum + row.count, 0)
      const openB = b.total - b.catalog.reduce((sum, row) => sum + row.count, 0)
      return openB - openA
    })
    const target = ranked.find((floor) => floor.total > floor.catalog.reduce((sum, row) => sum + row.count, 0))
    if (target) {
      const open = target.total - target.catalog.reduce((sum, row) => sum + row.count, 0)
      const add = Math.min(2, open)
      target.catalog = [
        ...target.catalog,
        { key: mode, label, color: departmentColor(label), count: add },
      ]
      added += add
    }
  }

  return { draft: { ...draft, floors }, added }
}

const EMPTY_STACK_BRIEF = {
  text: 'Draft a new stack plan\n\nPlan desk allocations across the floors of your building.\n\nLooking for a starting point? Try creating your stack from some of these ideas:',
  suggestions: STARTS.map((start) => ({ id: start.id, label: start.label })),
}

const STACK_PREPARE_MS = 3000

function StackPlanLoading({ label }) {
  return (
    <div className="stack-plan-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="stack-plan-loading-spinner" aria-hidden>
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} style={{ transform: `rotate(${index * 45}deg)` }} />
        ))}
      </div>
      <div className="stack-plan-loading-label">{label}</div>
    </div>
  )
}
const ALLOCATION_TYPES = [
  { value: 'department', label: 'Department' },
  { value: 'manager', label: 'Manager' },
  { value: 'custom', label: 'Custom allocation' },
]

function allocationColor(usedColors) {
  const free = NEIGHBORHOOD_PALETTE.find((swatch) => !usedColors.has(swatch.toLowerCase()))
  if (free) return free
  const hue = (usedColors.size * 47) % 360
  return `hsl(${hue} 62% 46%)`
}

function AllocationAdder({ defaultType, departments, managers, usedKeys, usedColors, onAdd, onCancel }) {
  const [type, setType] = useState(defaultType === 'manager' ? 'manager' : 'department')
  const [choice, setChoice] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const choices = type === 'manager' ? managers : departments
  const choiceLabel = type === 'manager' ? 'manager' : 'department'

  const submit = () => {
    if (type === 'custom') {
      const label = name.trim()
      if (!label) return
      const key = `custom:${label.toLowerCase()}`
      if (usedKeys.has(key)) {
        setError('That allocation is already on this floor.')
        return
      }
      onAdd({ key, label, color: allocationColor(usedColors) })
      return
    }
    const selected = choices.find((item) => item.key === choice)
    if (!selected) return
    onAdd(selected)
  }

  return (
    <form
      className="stack-plan-add-form"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label className="stack-plan-add-field">
        <span>Type</span>
        <select
          value={type}
          aria-label="Allocation type"
          onChange={(event) => {
            setType(event.target.value)
            setChoice('')
            setError(null)
          }}
        >
          {ALLOCATION_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {type === 'custom' ? (
        <label className="stack-plan-add-field">
          <span>Name</span>
          <input
            value={name}
            aria-label="Custom allocation name"
            placeholder="Executives"
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
          />
        </label>
      ) : (
        <label className="stack-plan-add-field">
          <span>{type === 'manager' ? 'Manager' : 'Department'}</span>
          <select
            value={choice}
            aria-label={`Choose a ${choiceLabel}`}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="">
              {choices.length ? `Select a ${choiceLabel}` : `All ${choiceLabel}s are on this floor`}
            </option>
            {choices.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {error ? <p className="stack-plan-add-error">{error}</p> : null}
      <div className="stack-plan-add-actions">
        <button
          type="submit"
          className="stack-plan-add-submit"
          disabled={type === 'custom' ? !name.trim() : !choice}
        >
          Add
        </button>
        <button type="button" className="stack-plan-add-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function StackPlanSidebar({
  summary,
  floorLabel,
  editing,
  canManage,
  defaultType,
  departments,
  managers,
  unassignedMax,
  onCountChange,
  onAddAllocation,
  onRemoveAllocation,
  onClearFloor,
}) {
  const [adding, setAdding] = useState(false)
  const [menu, setMenu] = useState(null)

  useEffect(() => {
    setAdding(false)
    setMenu(null)
  }, [floorLabel, canManage])

  useEffect(() => {
    if (!menu) return undefined
    const close = (event) => {
      if (event.target instanceof Element && event.target.closest('[data-allocation-menu]')) return
      setMenu(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])

  const usedKeys = new Set(summary.rows.map((row) => row.key))
  const usedColors = new Set(summary.rows.map((row) => row.color?.toLowerCase()).filter(Boolean))
  const departmentChoices = departments.filter((item) => !usedKeys.has(item.key))
  const managerChoices = managers.filter((item) => !usedKeys.has(item.key))

  return (
    <aside className="stack-plan-sidebar">
      {floorLabel ? (
        <div className="stack-plan-floor-header">
          <span>{floorLabel}</span>
          <button type="button" aria-label="Show all floors" onClick={onClearFloor}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      ) : null}
      <div className="stack-plan-sidebar-list">
        {summary.rows.map((row) => (
          <div key={row.key} className="stack-plan-row">
            <span className="stack-plan-swatch" style={{ backgroundColor: row.color }} aria-hidden />
            <span className="stack-plan-row-label" title={row.label}>
              {row.label}
            </span>
            {editing ? (
              <input
                className="stack-plan-count stack-plan-count--input"
                type="number"
                inputMode="numeric"
                min={0}
                max={row.count + unassignedMax}
                value={row.count}
                aria-label={`${row.label} desks on ${floorLabel}`}
                onChange={(event) => {
                  const parsed = Number(event.target.value)
                  if (!Number.isInteger(parsed)) return
                  onCountChange(row.key, parsed)
                }}
              />
            ) : (
              <span className="stack-plan-count">{row.count}</span>
            )}
            {canManage ? (
              <button
                type="button"
                className="stack-plan-row-more"
                aria-label={`Actions for ${row.label}`}
                aria-haspopup="menu"
                aria-expanded={menu?.key === row.key}
                data-allocation-menu
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setMenu((current) =>
                    current?.key === row.key ? null : { key: row.key, top: rect.bottom + 4, left: rect.right },
                  )
                }}
              >
                <FontAwesomeIcon icon={faEllipsis} />
              </button>
            ) : null}
          </div>
        ))}
        {canManage ? (
          adding ? (
            <AllocationAdder
              key={`${floorLabel}-${defaultType}`}
              defaultType={defaultType}
              departments={departmentChoices}
              managers={managerChoices}
              usedKeys={usedKeys}
              usedColors={usedColors}
              onAdd={(category) => {
                onAddAllocation(category)
                setAdding(false)
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button type="button" className="stack-plan-add" onClick={() => setAdding(true)}>
              + Add another allocation
            </button>
          )
        ) : null}
        <div className="stack-plan-row">
          <span className="stack-plan-swatch stack-plan-swatch--open" aria-hidden />
          <span className="stack-plan-row-label">Unassigned</span>
          <span className="stack-plan-count">{summary.unassigned}</span>
        </div>
        <div className="stack-plan-total">
          <span>Total</span>
          <span className="stack-plan-count">{summary.total}</span>
        </div>
      </div>
      {menu ? (
        <div
          className="stack-plan-row-menu"
          style={{ top: menu.top, left: menu.left }}
          role="menu"
          data-allocation-menu
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onRemoveAllocation(menu.key)
              setMenu(null)
            }}
          >
            Remove
          </button>
        </div>
      ) : null}
    </aside>
  )
}

function FloorCard({ floor, selected, editable, drag, onSelect, onSquarePointerDown }) {
  const { visible, hiddenCount } = floorLegend(floor.rows)
  const isSource = drag?.sourceFloorId === floor.id
  const isDropTarget = drag?.overFloorId === floor.id
  const isFull = Boolean(drag) && floor.unassigned === 0 && !isSource
  return (
    <div
      role="button"
      tabIndex={0}
      data-stack-floor={floor.id}
      className={[
        'stack-floor-card',
        selected ? 'stack-floor-card--active' : '',
        isDropTarget ? 'stack-floor-card--drop-hover' : '',
        isFull ? 'stack-floor-card--drop-disabled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-pressed={selected}
      aria-disabled={isFull || undefined}
      onClick={() => onSelect(floor.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(floor.id)
        }
      }}
    >
      <div className="stack-floor-identity">
        <div className="stack-floor-name">{floor.label}</div>
        <div className="stack-floor-desks">
          {floor.total} {floor.total === 1 ? 'desk' : 'desks'}
          {isFull ? <span className="stack-floor-full"> · Full</span> : null}
        </div>
      </div>
      <div className="stack-floor-viz">
        <div className="stack-floor-swatches">
          {floor.desks.map((desk) => {
            const draggingGroup =
              isSource && drag?.categoryKey && desk.categoryKey === drag.categoryKey
            return (
              <span
                key={desk.deskId}
                className={[
                  desk.color
                    ? `stack-desk${editable ? ' stack-desk--allocation' : ''}`
                    : 'stack-desk stack-desk--open',
                  draggingGroup ? 'stack-desk--dragging' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={desk.color ? { backgroundColor: desk.color } : undefined}
                title={
                  desk.color
                    ? editable
                      ? `${desk.label}: drag all ${desk.label} desks`
                      : desk.label
                    : 'Unassigned'
                }
                onPointerDown={
                  editable && desk.categoryKey
                    ? (event) => onSquarePointerDown(event, floor, desk)
                    : undefined
                }
              />
            )
          })}
        </div>
        <div className="stack-floor-legend">
          {visible.map((row) => (
            <span key={row.key} className="stack-floor-legend-item">
              <span className="stack-legend-dot" style={{ backgroundColor: row.color }} aria-hidden />
              {row.label}
            </span>
          ))}
          {hiddenCount > 0 ? (
            <span className="stack-legend-others">{othersLabel(hiddenCount)}</span>
          ) : null}
          <span className="stack-floor-legend-item stack-legend-unassigned">
            <span className="stack-legend-ring" aria-hidden />
            Unassigned
          </span>
        </div>
      </div>
    </div>
  )
}

function editStorageKey(floorId, categoryKey) {
  return `draft:${floorId}:${categoryKey}`
}

function presentDraftFloor(floor, edits) {
  const editRows = floor.catalog.map((category) => {
    const stored = edits[editStorageKey(floor.id, category.key)]
    const count = stored == null ? category.count : stored
    return { ...category, count }
  })
  const assigned = editRows.reduce((sum, row) => sum + row.count, 0)
  const unassigned = Math.max(0, floor.total - assigned)
  const rows = editRows
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return {
    ...floor,
    rows,
    editRows,
    unassigned,
    desks: paintDesks(
      { id: floor.id, total: floor.total, desks: floor.deskIds.map((deskId) => ({ deskId })) },
      rows,
    ),
  }
}

function blankDraft(publishedFloors) {
  return {
    note: 'No allocations yet',
    detail: null,
    groupType: 'department',
    agentBrief: { text: 'Added allocations on the new stack plan.', suggestions: [] },
    floors: publishedFloors.map((floor) => ({
      id: floor.id,
      label: floor.label,
      total: floor.total,
      deskIds: floor.desks.map((desk) => desk.deskId),
      catalog: [],
    })),
  }
}

function summarizeDraftFloors(floors) {
  const byKey = new Map()
  let total = 0
  let unassigned = 0
  for (const floor of floors) {
    total += floor.total
    unassigned += floor.unassigned
    for (const row of floor.rows) {
      const existing = byKey.get(row.key)
      if (existing) existing.count += row.count
      else byKey.set(row.key, { ...row })
    }
  }
  const rows = [...byKey.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return { rows, unassigned, total }
}

function paintDesks(floor, rows) {
  const painted = []
  for (const row of rows) {
    for (let index = 0; index < row.count; index += 1) {
      const desk = floor.desks[painted.length]
      painted.push({
        deskId: desk?.deskId ?? `${floor.id}-${painted.length}`,
        categoryKey: row.key,
        color: row.color,
        label: row.label,
      })
    }
  }
  while (painted.length < floor.total) {
    const desk = floor.desks[painted.length]
    painted.push({
      deskId: desk?.deskId ?? `${floor.id}-open-${painted.length}`,
      categoryKey: null,
      color: null,
      label: 'Unassigned',
    })
  }
  return painted.slice(0, floor.total)
}

function StackPlanView({ users, agentOpen = false, onDecision, onReset, onAgentTabChange }, ref) {
  const [selectedFloorId, setSelectedFloorId] = useState(null)
  const [drawerFloorId, setDrawerFloorId] = useState(null)
  const [drawerEntered, setDrawerEntered] = useState(false)
  const drawerOpenRef = useRef(false)
  const drawerPanelRef = useRef(null)
  const selectedFloorIdRef = useRef(selectedFloorId)
  selectedFloorIdRef.current = selectedFloorId
  const [opened, setOpened] = useState(false)
  const [draft, setDraft] = useState(null)
  const [preparing, setPreparing] = useState(null)
  const [edits, setEdits] = useState({})
  const [drag, setDrag] = useState(null)
  const [floorsReversed, setFloorsReversed] = useState(false)
  const turnRef = useRef(0)
  const agentMessage = (fields) => ({
    id: `agent-${turnRef.current += 1}`,
    role: 'agent',
    ...fields,
  })
  const floorsRef = useRef([])
  const skipFloorClickRef = useRef(false)
  const prepareTimers = useRef([])

  useEffect(() => () => {
    prepareTimers.current.forEach((id) => window.clearTimeout(id))
  }, [])

  useEffect(() => {
    onAgentTabChange?.(opened)
  }, [opened, onAgentTabChange])

  const allocationChoices = useMemo(() => {
    const managerModel = buildStackPlanModel(users, 'manager')
    return {
      departments: DIRECTORY_DEPARTMENTS.map((label) => ({
        key: `dept:${label}`,
        label,
        color: departmentColor(label),
      })),
      managers: [...managerModel.categories.values()]
        .map((category) => ({ key: category.key, label: category.label, color: category.color }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }
  }, [users])

  const floorModel = useMemo(() => buildStackPlanModel(users, 'department'), [users])
  const editable = Boolean(draft)
  const draftFloors = useMemo(
    () => (draft ? draft.floors.map((floor) => presentDraftFloor(floor, edits)) : []),
    [draft, edits],
  )
  const blankFloors = useMemo(
    () =>
      floorModel.floors.map((floor) =>
        presentDraftFloor(
          {
            id: floor.id,
            label: floor.label,
            total: floor.total,
            deskIds: floor.desks.map((desk) => desk.deskId),
            catalog: [],
          },
          {},
        ),
      ),
    [floorModel],
  )
  const floors = preparing || !draft ? blankFloors : draftFloors
  floorsRef.current = floors
  const orderedFloors = useMemo(() => {
    const ascending = [...floors].sort((a, b) => a.id.localeCompare(b.id))
    return floorsReversed ? ascending.reverse() : ascending
  }, [floors, floorsReversed])

  const selectedFloor = floors.find((floor) => floor.id === selectedFloorId) ?? null
  const drawerFloor = floors.find((floor) => floor.id === drawerFloorId) ?? null
  const buildingSummary = useMemo(() => summarizeDraftFloors(floors), [floors])

  useEffect(() => {
    if (selectedFloorId) {
      setDrawerFloorId(selectedFloorId)
      if (drawerOpenRef.current) return undefined
      setDrawerEntered(false)
      const timer = window.setTimeout(() => {
        drawerOpenRef.current = true
        setDrawerEntered(true)
      }, 32)
      return () => window.clearTimeout(timer)
    }
    drawerOpenRef.current = false
    setDrawerEntered(false)
    return undefined
  }, [selectedFloorId])

  const finishDrawerExit = (event) => {
    if (event.target !== drawerPanelRef.current) return
    if (event.propertyName !== 'transform') return
    if (selectedFloorIdRef.current) return
    setDrawerFloorId(null)
  }

  const showEmptyDraft = () => {
    prepareTimers.current.forEach((id) => window.clearTimeout(id))
    prepareTimers.current = []
    setPreparing(null)
    setOpened(true)
    setDraft(null)
    setEdits({})
    setSelectedFloorId(null)
    setDrag(null)
    setFloorsReversed(false)
    onDecision?.({
      reset: true,
      message: {
        id: 'welcome',
        role: 'agent',
        text: EMPTY_STACK_BRIEF.text,
        suggestions: EMPTY_STACK_BRIEF.suggestions,
      },
    })
  }

  const runPreparing = (apply, steps = UPDATE_ACTIVITY) => {
    prepareTimers.current.forEach((id) => window.clearTimeout(id))
    prepareTimers.current = []
    setEdits({})
    setSelectedFloorId(null)
    setDrag(null)
    setDraft(null)
    setOpened(true)
    setPreparing({ label: 'Crafting your stack plan' })
    const messageId = `agent-${turnRef.current += 1}`
    const activityAt = (doneCount) => steps.flatMap((step, index) => {
      if (index < doneCount) return [{ id: step.id, label: step.done, state: 'done' }]
      if (index === doneCount && doneCount < steps.length) {
        return [{ id: step.id, label: step.active, state: 'active' }]
      }
      return []
    })
    const publish = (doneCount) => onDecision?.({
      id: messageId,
      role: 'agent',
      activity: activityAt(doneCount),
      loading: true,
    })
    publish(0)
    const slice = Math.round(STACK_PREPARE_MS / (steps.length + 1))
    for (let index = 1; index <= steps.length; index += 1) {
      prepareTimers.current.push(window.setTimeout(() => publish(index), slice * index))
    }
    prepareTimers.current.push(
      window.setTimeout(() => {
        const extra = apply() ?? {}
        onDecision?.({
          id: messageId,
          role: 'agent',
          activity: activityAt(steps.length),
          loading: false,
          ...extra,
        })
        setPreparing(null)
      }, STACK_PREPARE_MS),
    )
  }

  const beginDraft = (request, presentation) => {
    if (request.kind === 'prompt' && !request.text.trim()) return
    const result = createStackDraft(users, request)
    if (!result.ok) {
      onDecision?.(agentMessage({ text: result.message, suggestions: EMPTY_STACK_BRIEF.suggestions }))
      return
    }
    runPreparing(() => {
      setEdits({})
      setSelectedFloorId(null)
      setDrag(null)
      setOpened(true)
      setDraft(presentation ? { ...result.draft, note: presentation.note, detail: null } : result.draft)
      return {
        text: presentation?.text ?? result.draft.agentBrief.text,
      }
    }, presentation?.steps)
  }

  const commitDraft = (nextDraft, text, steps = UPDATE_ACTIVITY) => {
    runPreparing(() => {
      setEdits({})
      setSelectedFloorId(null)
      setDrag(null)
      setOpened(true)
      setDraft(nextDraft)
      return { text }
    }, steps)
  }

  const sourceDraft = () => {
    if (draft) return { source: draft, started: false }
    const result = createStackDraft(users, { kind: 'basis', basis: 'department' })
    if (!result.ok) return null
    return { source: result.draft, started: true }
  }

  const respond = (id) => {
    if (id === 'assignments') {
      onDecision?.(agentMessage({
        text: 'I’ll build this from the desks people are assigned today. How should I organize the stack plan?',
        suggestions: GROUPINGS.map((group) => ({
          id: `assignments:${group.id}`,
          label: group.label,
        })),
      }))
      return
    }
    if (id.startsWith('assignments:')) {
      const basis = id.slice('assignments:'.length)
      beginDraft(
        { kind: 'basis', basis },
        {
          note: planNote('assignments', basis),
          text: generatedPlanCopy('assignments', basis),
          steps: assignmentActivity(basis),
        },
      )
      return
    }
    if (id === 'usage') {
      onDecision?.(agentMessage({
        text: 'I’ll build this from desk usage. How should I organize the stack plan?',
        suggestions: GROUPINGS.map((group) => ({
          id: `usage:${group.id}`,
          label: group.label,
        })),
      }))
      return
    }
    if (id.startsWith('usage:')) {
      const basis = id.slice('usage:'.length)
      const result = createStackDraft(users, { kind: 'basis', basis })
      if (!result.ok) {
        onDecision?.(agentMessage({ text: result.message, suggestions: EMPTY_STACK_BRIEF.suggestions }))
        return
      }
      commitDraft(
        holdBackUnused(result.draft, basis),
        generatedPlanCopy('usage', basis),
        usageActivity(basis),
      )
      return
    }
    if (id === 'free-space') {
      onDecision?.(agentMessage({
        text: 'How do you want to free up space?',
        suggestions: [
          { id: 'free-space:usage', label: 'Optimize for usage to free up unused desks' },
          { id: 'free-space:inactivate', label: 'I’m looking to inactivate a floor' },
        ],
      }))
      return
    }
    if (id === 'free-space:usage') {
      onDecision?.(agentMessage({
        text: 'I’ll build this from desk usage. How should I organize the stack plan?',
        suggestions: GROUPINGS.map((group) => ({
          id: `usage:${group.id}`,
          label: group.label,
        })),
      }))
      return
    }
    if (id === 'free-space:inactivate') {
      onDecision?.(agentMessage({
        text: 'Which floor should I inactivate?',
        suggestions: FLOOR_OPTIONS.map((floor) => ({
          id: `free-space:inactivate:${floor.id}`,
          label: floor.label,
        })),
      }))
      return
    }
    if (id.startsWith('free-space:inactivate:')) {
      const rest = id.slice('free-space:inactivate:'.length)
      const group = GROUPINGS.find((item) => rest.endsWith(`:${item.id}`))
      if (!group) {
        const floor = FLOOR_OPTIONS.find((item) => item.id === rest)
        if (!floor) return
        onDecision?.(agentMessage({
          text: `I’ll clear ${floor.label} and redistribute its allocations onto the other floors. How should I organize the stack plan?`,
          suggestions: GROUPINGS.map((item) => ({
            id: `free-space:inactivate:${floor.id}:${item.id}`,
            label: item.label,
          })),
        }))
        return
      }
      const floorId = rest.slice(0, -(group.id.length + 1))
      const floor = FLOOR_OPTIONS.find((item) => item.id === floorId)
      if (!floor) return
      const result = createStackDraft(users, { kind: 'basis', basis: group.id })
      if (!result.ok) {
        onDecision?.(agentMessage({ text: result.message, suggestions: EMPTY_STACK_BRIEF.suggestions }))
        return
      }
      const next = inactivateFloor(result.draft, floor.id, group.id)
      commitDraft(
        next.draft,
        inactivatedPlanCopy(next.floorLabel, group.id, next.leftover),
        inactivateActivity(group.id, next.floorLabel),
      )
      return
    }
    if (id === 'growth') {
      onDecision?.(agentMessage({
        text: 'Who should I make room for? I will add desks on the floors where that group already sits, using unassigned desks first.',
        suggestions: [
          ...DIRECTORY_DEPARTMENTS.map((label) => ({
            id: `growth:dept:${label}`,
            label,
          })),
          { id: 'growth:all', label: 'A little for every group' },
        ],
      }))
      return
    }
    if (id.startsWith('growth:')) {
      const mode = id.slice('growth:'.length)
      const base = sourceDraft()
      if (!base) return
      const { draft: grown, added } = growDraft(base.source, mode)
      const who = mode === 'all' ? 'every group' : mode.replace(/^dept:/, '')
      const change = !added
        ? 'There aren’t unassigned desks left to give out.'
        : mode === 'all'
          ? `I added ${added} ${added === 1 ? 'desk' : 'desks'} across the groups already on each floor, using unassigned desks.`
          : `I added ${added} ${added === 1 ? 'desk' : 'desks'} for ${who}, using unassigned desks.`
      const text = base.started ? `I started from current department assignments. ${change}` : change
      commitDraft(
        { ...grown, note: added ? `Made room for ${who}` : base.source.note, detail: null },
        text,
      )
    }
  }

  const respondRef = useRef(respond)
  respondRef.current = respond
  const showEmptyRef = useRef(showEmptyDraft)
  showEmptyRef.current = showEmptyDraft
  const sessionRef = useRef({})
  sessionRef.current = { opened, preparing, draft, users, onDecision, onReset }
  const snapshotRef = useRef(() => null)
  snapshotRef.current = () => {
    if (!opened || preparing || !draft) return null
    return floors.map((floor) => ({
      id: floor.id,
      desks: floor.desks
        .filter((desk) => desk.categoryKey)
        .map((desk) => ({
          deskId: desk.deskId,
          key: desk.categoryKey,
          label: desk.label,
          color: desk.color,
        })),
    }))
  }
  useImperativeHandle(ref, () => ({
    startFrom(id) {
      respondRef.current(id)
    },
    snapshot() {
      return snapshotRef.current()
    },
    openExisting() {
      const session = sessionRef.current
      if (
        session.opened &&
        !session.preparing &&
        session.draft
      ) {
        return
      }
      prepareTimers.current.forEach((id) => window.clearTimeout(id))
      prepareTimers.current = []
      const result = createStackDraft(session.users, { kind: 'basis', basis: 'department' })
      if (!result.ok) return
      setPreparing(null)
      setEdits({})
      setSelectedFloorId(null)
      setDrag(null)
      setDraft(result.draft)
      setOpened(true)
      sessionRef.current.onReset?.()
    },
    openNew() {
      showEmptyRef.current()
    },
  }))

  const addAllocation = (category) => {
    if (!selectedFloor) return
    setDraft((current) => {
      const base = current ?? blankDraft(floorModel.floors)
      return {
        ...base,
        floors: base.floors.map((floor) => {
          if (floor.id !== selectedFloor.id) return floor
          if (floor.catalog.some((row) => row.key === category.key)) return floor
          return {
            ...floor,
            catalog: [...floor.catalog, { ...category, count: 0 }],
          }
        }),
      }
    })
  }

  const removeAllocation = (categoryKey) => {
    if (!selectedFloor) return
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        floors: current.floors.map((floor) =>
          floor.id === selectedFloor.id
            ? { ...floor, catalog: floor.catalog.filter((row) => row.key !== categoryKey) }
            : floor,
        ),
      }
    })
    setEdits((current) => {
      const next = { ...current }
      delete next[editStorageKey(selectedFloor.id, categoryKey)]
      return next
    })
  }

  const selectFloor = (floorId) => {
    if (skipFloorClickRef.current) {
      skipFloorClickRef.current = false
      return
    }
    setSelectedFloorId((current) => (current === floorId ? null : floorId))
  }

  const changeFloorCount = (categoryKey, requested) => {
    if (!editable || !selectedFloor) return
    const others = selectedFloor.editRows.reduce(
      (sum, row) => (row.key === categoryKey ? sum : sum + row.count),
      0,
    )
    const next = Math.max(0, Math.min(selectedFloor.total - others, requested))
    setEdits((current) => ({
      ...current,
      [editStorageKey(selectedFloor.id, categoryKey)]: next,
    }))
  }

  const moveAllocation = (sourceFloorId, targetFloorId, categoryKey) => {
    const source = floorsRef.current.find((floor) => floor.id === sourceFloorId)
    const target = floorsRef.current.find((floor) => floor.id === targetFloorId)
    if (!editable || !source || !target || source.id === target.id || target.unassigned <= 0) return
    const sourceRow = source.editRows.find((row) => row.key === categoryKey)
    const sourceCount = sourceRow?.count ?? 0
    const targetCount = target.editRows.find((row) => row.key === categoryKey)?.count ?? 0
    const moved = Math.min(sourceCount, target.unassigned)
    if (!sourceRow || moved <= 0) return
    if (!target.editRows.some((row) => row.key === categoryKey)) {
      setDraft((current) =>
        current
          ? {
              ...current,
              floors: current.floors.map((floor) =>
                floor.id === target.id
                  ? {
                      ...floor,
                      catalog: [
                        ...floor.catalog,
                        { key: sourceRow.key, label: sourceRow.label, color: sourceRow.color, count: 0 },
                      ],
                    }
                  : floor,
              ),
            }
          : current,
      )
    }
    setEdits((current) => ({
      ...current,
      [editStorageKey(source.id, categoryKey)]: sourceCount - moved,
      [editStorageKey(target.id, categoryKey)]: targetCount + moved,
    }))
  }

  const onSquarePointerDown = (event, floor, desk) => {
    if (!editable) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (!desk.categoryKey) return
    event.stopPropagation()
    const count = floor.editRows.find((row) => row.key === desk.categoryKey)?.count ?? 0
    if (count <= 0) return

    const startX = event.clientX
    const startY = event.clientY
    let active = false
    const blockSelect = (ev) => ev.preventDefault()
    document.addEventListener('selectstart', blockSelect)
    document.body.classList.add('stack-allocation-press')
    const payload = {
      categoryKey: desk.categoryKey,
      label: desk.label,
      color: desk.color,
      count,
      sourceFloorId: floor.id,
    }

    const floorIdAt = (clientX, clientY) => {
      const hit = document.elementFromPoint(clientX, clientY)
      const card = hit instanceof Element ? hit.closest('[data-stack-floor]') : null
      return card?.getAttribute('data-stack-floor') ?? null
    }

    const onMove = (ev) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!active && dx * dx + dy * dy < 16) return
      if (!active) {
        active = true
        document.body.classList.add('stack-allocation-dragging')
        window.getSelection()?.removeAllRanges()
      }
      const overId = floorIdAt(ev.clientX, ev.clientY)
      const over = floorsRef.current.find((entry) => entry.id === overId)
      const canDrop = Boolean(over && over.id !== floor.id && over.unassigned > 0)
      setDrag({
        ...payload,
        active: true,
        x: ev.clientX,
        y: ev.clientY,
        overFloorId: canDrop ? over.id : null,
        dropCount: canDrop ? Math.min(count, over.unassigned) : 0,
      })
    }

    const finish = (ev) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      document.removeEventListener('selectstart', blockSelect)
      document.body.classList.remove('stack-allocation-press', 'stack-allocation-dragging')
      window.getSelection()?.removeAllRanges()
      if (!active) return
      skipFloorClickRef.current = true
      window.setTimeout(() => {
        skipFloorClickRef.current = false
      }, 0)
      const overId = floorIdAt(ev.clientX, ev.clientY)
      if (overId) moveAllocation(floor.id, overId, desk.categoryKey)
      setDrag(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const dragWillMove = drag?.overFloorId ? drag.dropCount : 0

  return (
    <div
      className={[
        'stack-plan',
        agentOpen ? 'stack-plan--agent' : '',
        preparing ? 'stack-plan--preparing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <StackPlanSidebar
        summary={buildingSummary}
        floorLabel={null}
        editing={false}
        canManage={false}
        defaultType={draft?.groupType ?? 'department'}
        departments={allocationChoices.departments}
        managers={allocationChoices.managers}
        unassignedMax={0}
        onCountChange={changeFloorCount}
        onAddAllocation={addAllocation}
        onRemoveAllocation={removeAllocation}
        onClearFloor={() => setSelectedFloorId(null)}
      />
      {drawerFloor ? (
        <div
          ref={drawerPanelRef}
          className={['stack-floor-drawer', drawerEntered ? 'stack-floor-drawer--visible' : ''].filter(Boolean).join(' ')}
          onTransitionEnd={finishDrawerExit}
        >
          <StackPlanSidebar
            summary={{
              rows: drawerFloor.editRows,
              unassigned: drawerFloor.unassigned,
              total: drawerFloor.total,
            }}
            floorLabel={drawerFloor.label}
            editing={editable && drawerFloor.id === selectedFloorId}
            canManage={drawerFloor.id === selectedFloorId && !preparing}
            defaultType={draft?.groupType ?? 'department'}
            departments={allocationChoices.departments}
            managers={allocationChoices.managers}
            unassignedMax={drawerFloor.unassigned}
            onCountChange={changeFloorCount}
            onAddAllocation={addAllocation}
            onRemoveAllocation={removeAllocation}
            onClearFloor={() => setSelectedFloorId(null)}
          />
        </div>
      ) : null}
      <div className="stack-plan-main">
        <div className="stack-plan-main-body">
        <div className="stack-plan-toolbar">
          <div className="stack-plan-draft-note">
            {draft ? (
              <>
                <div>{draft.note}</div>
                {draft.detail ? <div className="stack-plan-draft-detail">{draft.detail}</div> : null}
              </>
            ) : (
              <div>No allocations yet</div>
            )}
          </div>
          <button
            type="button"
            className="stack-plan-sort"
            aria-pressed={floorsReversed}
            onClick={() => setFloorsReversed((current) => !current)}
          >
            <FontAwesomeIcon icon={floorsReversed ? faArrowDown91 : faArrowDown19} />
            {floorsReversed ? 'Highest first' : 'Lowest first'}
          </button>
          {draft ? (
            <button type="button" className="stack-prompt-restart" onClick={showEmptyDraft}>
              Start over
            </button>
          ) : null}
        </div>
        <div className="stack-plan-floors">
          {orderedFloors.map((floor) => (
            <FloorCard
              key={floor.id}
              floor={floor}
              selected={floor.id === selectedFloorId}
              editable={editable}
              drag={editable ? drag : null}
              onSelect={selectFloor}
              onSquarePointerDown={onSquarePointerDown}
            />
          ))}
        </div>
        </div>
        {preparing ? <StackPlanLoading label={preparing.label} /> : null}
      </div>
      {drag?.active ? (
        <div className="stack-allocation-drag" style={{ left: drag.x, top: drag.y }}>
          <span className="stack-desk" style={{ backgroundColor: drag.color }} />
          <span>{drag.label}</span>
          <span className="stack-allocation-drag-count">
            {dragWillMove > 0 && dragWillMove < drag.count
              ? `${dragWillMove} of ${drag.count}`
              : drag.count}
          </span>
        </div>
      ) : null}
    </div>
  )
}

export default forwardRef(StackPlanView)

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Segmented } from 'antd'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowDown19, faArrowDown91, faArrowUp, faEllipsis, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'
import { DIRECTORY_DEPARTMENTS } from './mockData.js'
import { NEIGHBORHOOD_PALETTE } from './neighborhoodData.js'
import {
  buildStackPlanModel,
  departmentColor,
  floorLegend,
  stackPlanCatalog,
  summarizeStackPlan,
} from './stackPlanData.js'
import { createStackDraft, CURRENT_STACK_AGENT } from './stackPlanPrompt.js'

const PLAN_VERSIONS = [
  { label: 'Current stack', value: 'current' },
  { label: 'New stack plan', value: 'new' },
]

function othersLabel(count) {
  return count === 1 ? 'and 1 other' : `and ${count} others`
}

const DIMENSIONS = [
  { label: 'Department', value: 'department' },
  { label: 'Manager', value: 'manager' },
  { label: 'Neighborhood', value: 'neighborhood' },
]

const STARTS = [
  { id: 'department', label: 'Desk assignments by department', basis: 'department' },
  { id: 'usage-department', label: 'Desk usage by departments' },
  { id: 'current', label: 'Show my current stack', action: 'current' },
  { id: 'manager', label: 'Desk assignments by manager', basis: 'manager' },
  { id: 'usage-manager', label: 'Desk usage by manager' },
  { id: 'neighborhood', label: 'Desks within current neighborhoods', basis: 'neighborhood' },
  { id: 'free-space', label: 'Help me free up extra space' },
  { id: 'growth', label: 'Help me plan for upcoming growth' },
]

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
function StackPrompt({ text, error, onTextChange, onSubmit, onStart, onViewCurrent }) {
  return (
    <div className="stack-plan stack-plan--prompt">
      <form
        className="stack-prompt"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(text)
        }}
      >
        <h1 className="stack-prompt-title">Draft a new stack plan</h1>
        <p className="stack-prompt-copy">Plan desk allocations across the floors of your building</p>
        <div className="stack-prompt-field">
          <textarea
            rows={3}
            value={text}
            autoFocus
            aria-label="Stack plan prompt"
            placeholder="Tell Robin how to set up your stack plan..."
            onChange={(event) => onTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSubmit(text)
              }
            }}
          />
          <div className="stack-prompt-field-actions">
            <button type="button" className="stack-prompt-add" aria-label="Add">
              <FontAwesomeIcon icon={faPlus} />
            </button>
            <button type="submit" className="stack-prompt-send" aria-label="Draft stack plan" disabled={!text.trim()}>
              <FontAwesomeIcon icon={faArrowUp} />
            </button>
          </div>
        </div>
        {error ? (
          <p className="stack-prompt-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="stack-prompt-divider" aria-hidden />
        <h2 className="stack-prompt-ideas-title">Looking for a starting point?</h2>
        <p className="stack-prompt-ideas-copy">Try creating your stack from some of these ideas:</p>
        <div className="stack-prompt-starts">
          {STARTS.map((start) => (
            <button
              key={start.id}
              type="button"
              className="stack-prompt-start"
              onClick={() => {
                if (start.action === 'current') onViewCurrent()
                else if (start.basis) onStart(start.basis)
              }}
            >
              {start.label}
            </button>
          ))}
        </div>
      </form>
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
  planVersion,
  onPlanVersionChange,
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
      <div className="stack-plan-version">
        <Segmented
          block
          aria-label="Stack version"
          value={planVersion}
          onChange={onPlanVersionChange}
          options={PLAN_VERSIONS}
        />
      </div>
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

function applyFloorEdits(floor, dimension, model) {
  const base = new Map(floor.rows.map((row) => [row.key, row.count]))
  const catalog = stackPlanCatalog(model, dimension, floor.id)
  const editRows = catalog.map((category) => ({
    ...category,
    count: base.get(category.key) ?? 0,
  }))
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
    desks: paintDesks(floor, rows),
  }
}

function StackPlanView({ users, agentOpen = false, onDecision, onPrepare, onReset, onAgentTabChange }, ref) {
  const [planVersion, setPlanVersion] = useState('new')
  const [dimension, setDimension] = useState('department')
  const [selectedFloorId, setSelectedFloorId] = useState(null)
  const [opened, setOpened] = useState(false)
  const [draft, setDraft] = useState(null)
  const [promptText, setPromptText] = useState('')
  const [promptError, setPromptError] = useState(null)
  const [preparing, setPreparing] = useState(null)
  const [edits, setEdits] = useState({})
  const [drag, setDrag] = useState(null)
  const [floorsReversed, setFloorsReversed] = useState(false)
  const floorsRef = useRef([])
  const skipFloorClickRef = useRef(false)
  const prepareTimers = useRef([])

  useEffect(() => () => {
    prepareTimers.current.forEach((id) => window.clearTimeout(id))
  }, [])

  useEffect(() => {
    onAgentTabChange?.(opened && !preparing)
  }, [opened, preparing, onAgentTabChange])

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

  const model = useMemo(() => buildStackPlanModel(users, dimension), [users, dimension])
  const showingNew = planVersion === 'new'
  const editable = showingNew && Boolean(draft)
  const publishedFloors = useMemo(
    () => model.floors.map((floor) => applyFloorEdits(floor, dimension, model)),
    [model, dimension],
  )
  const draftFloors = useMemo(
    () => (draft ? draft.floors.map((floor) => presentDraftFloor(floor, edits)) : []),
    [draft, edits],
  )
  const blankFloors = useMemo(
    () =>
      publishedFloors.map((floor) =>
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
    [publishedFloors],
  )
  const floors = preparing || (showingNew && !draft) ? blankFloors : showingNew ? draftFloors : publishedFloors
  floorsRef.current = floors
  const orderedFloors = useMemo(() => {
    const ascending = [...floors].sort((a, b) => a.id.localeCompare(b.id))
    return floorsReversed ? ascending.reverse() : ascending
  }, [floors, floorsReversed])

  const selectedFloor = floors.find((floor) => floor.id === selectedFloorId) ?? null
  const summary = useMemo(() => {
    if (preparing || showingNew) {
      if (!selectedFloor) return summarizeDraftFloors(floors)
      return {
        rows: selectedFloor.editRows,
        unassigned: selectedFloor.unassigned,
        total: selectedFloor.total,
      }
    }
    if (!selectedFloor) return summarizeStackPlan({ ...model, floors }, null)
    return {
      rows: selectedFloor.editRows,
      unassigned: selectedFloor.unassigned,
      total: selectedFloor.total,
    }
  }, [preparing, showingNew, model, floors, selectedFloor])

  const runPreparing = (kind, apply) => {
    prepareTimers.current.forEach((id) => window.clearTimeout(id))
    prepareTimers.current = []
    setPromptError(null)
    setEdits({})
    setSelectedFloorId(null)
    setDrag(null)
    setDraft(null)
    setPlanVersion('new')
    setOpened(true)
    setPreparing({ label: kind === 'current' ? 'Loading current stack' : 'Generating new stack plan' })
    onPrepare?.()
    prepareTimers.current.push(
      window.setTimeout(() => {
        apply()
        setPreparing(null)
      }, STACK_PREPARE_MS),
    )
  }

  const beginDraft = (request) => {
    if (request.kind === 'prompt' && !request.text.trim()) return
    const result = createStackDraft(users, request)
    if (!result.ok) {
      setPromptError(result.message)
      return
    }
    setPromptError(null)
    runPreparing(request.kind === 'basis' ? request.basis : 'prompt', () => {
      setEdits({})
      setSelectedFloorId(null)
      setDrag(null)
      setPlanVersion('new')
      setOpened(true)
      setDraft(result.draft)
      onDecision?.(result.draft.agentBrief)
    })
  }

  const viewCurrentStack = () => {
    runPreparing('current', () => {
      setDraft(null)
      setEdits({})
      setSelectedFloorId(null)
      setDrag(null)
      setPlanVersion('current')
      setOpened(true)
      onDecision?.(CURRENT_STACK_AGENT)
    })
  }

  const beginDraftRef = useRef(beginDraft)
  beginDraftRef.current = beginDraft
  const sessionRef = useRef({})
  sessionRef.current = { opened, preparing, draft, planVersion, users, onDecision, onReset }
  const snapshotRef = useRef(() => null)
  snapshotRef.current = () => {
    if (!opened || preparing) return null
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
    startFrom(basis) {
      beginDraftRef.current({ kind: 'basis', basis })
    },
    snapshot() {
      return snapshotRef.current()
    },
    openExisting() {
      const session = sessionRef.current
      if (
        session.opened &&
        !session.preparing &&
        (session.draft || session.planVersion === 'current')
      ) {
        return
      }
      prepareTimers.current.forEach((id) => window.clearTimeout(id))
      prepareTimers.current = []
      const result = createStackDraft(session.users, { kind: 'basis', basis: 'department' })
      if (!result.ok) return
      setPreparing(null)
      setPromptError(null)
      setEdits({})
      setSelectedFloorId(null)
      setDrag(null)
      setPlanVersion('new')
      setDraft(result.draft)
      setOpened(true)
    },
    openNew() {
      prepareTimers.current.forEach((id) => window.clearTimeout(id))
      prepareTimers.current = []
      setPreparing(null)
      setOpened(false)
      setDraft(null)
      setEdits({})
      setSelectedFloorId(null)
      setDrag(null)
      setPlanVersion('new')
      setFloorsReversed(false)
      setPromptText('')
      setPromptError(null)
      sessionRef.current.onReset?.()
    },
  }))

  const returnToPrompt = () => {
    setOpened(false)
    setDraft(null)
    setEdits({})
    setSelectedFloorId(null)
    setDrag(null)
    setPlanVersion('new')
    setFloorsReversed(false)
    onReset?.()
  }

  const addAllocation = (category) => {
    if (!selectedFloor) return
    setDraft((current) => {
      const base = current ?? blankDraft(publishedFloors)
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

  if (!opened) {
    return (
      <StackPrompt
        text={promptText}
        error={promptError}
        onTextChange={(value) => {
          setPromptText(value)
          if (promptError) setPromptError(null)
        }}
        onSubmit={(value) => beginDraft({ kind: 'prompt', text: value })}
        onStart={(basis) => beginDraft({ kind: 'basis', basis })}
        onViewCurrent={viewCurrentStack}
      />
    )
  }

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
        planVersion={planVersion}
        onPlanVersionChange={setPlanVersion}
        summary={summary}
        floorLabel={selectedFloor?.label ?? null}
        editing={editable && Boolean(selectedFloor)}
        canManage={showingNew && Boolean(selectedFloor) && !preparing}
        defaultType={draft?.groupType ?? 'department'}
        departments={allocationChoices.departments}
        managers={allocationChoices.managers}
        unassignedMax={selectedFloor?.unassigned ?? 0}
        onCountChange={changeFloorCount}
        onAddAllocation={addAllocation}
        onRemoveAllocation={removeAllocation}
        onClearFloor={() => setSelectedFloorId(null)}
      />
      <div className="stack-plan-main">
        <div className="stack-plan-main-body">
        <div className="stack-plan-toolbar">
          {showingNew ? (
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
          ) : (
            <>
              <span className="stack-plan-toolbar-label" id="stack-plan-dimension-label">
                View by
              </span>
              <Segmented
                aria-labelledby="stack-plan-dimension-label"
                value={dimension}
                onChange={setDimension}
                options={DIMENSIONS}
              />
            </>
          )}
          <button
            type="button"
            className="stack-plan-sort"
            aria-pressed={floorsReversed}
            onClick={() => setFloorsReversed((current) => !current)}
          >
            <FontAwesomeIcon icon={floorsReversed ? faArrowDown91 : faArrowDown19} />
            {floorsReversed ? 'Highest first' : 'Lowest first'}
          </button>
          {showingNew ? (
            <button type="button" className="stack-prompt-restart" onClick={returnToPrompt}>
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

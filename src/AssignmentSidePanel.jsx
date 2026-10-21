import { useEffect, useMemo, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FLOOR_OPTIONS } from './mockData.js'
import {
  buildAssignmentFloorSummaries,
  NEIGHBORHOOD_UNASSIGNED_COLOR,
} from './assignmentMapData.js'

const OPEN_DESK_FILL = NEIGHBORHOOD_UNASSIGNED_COLOR

function DeskSwatchGrid({ desks, compact, focusedKey }) {
  if (!desks?.length) {
    return <div className="assignment-desk-swatches assignment-desk-swatches--empty" aria-hidden />
  }

  const hasFocus = Boolean(focusedKey)

  return (
    <div
      className={[
        'assignment-desk-swatches',
        compact ? 'assignment-desk-swatches--compact' : '',
        hasFocus ? 'assignment-desk-swatches--focused' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="img"
      aria-label="Desk allocation breakdown"
    >
      {desks.map((desk) => {
        const categoryKey = desk.categoryKey ?? '__unassigned__'
        const isDimmed = hasFocus && categoryKey !== focusedKey
        return (
          <span
            key={desk.deskId}
            className={['assignment-desk-swatch', isDimmed ? 'assignment-desk-swatch--dimmed' : '']
              .filter(Boolean)
              .join(' ')}
            style={{ backgroundColor: desk.color || OPEN_DESK_FILL }}
            title={desk.label}
          />
        )
      })}
    </div>
  )
}

function AllocationLegend({ summary, focusedKey, onSelectKey }) {
  const selectKey = (key) => {
    if (!onSelectKey) return
    onSelectKey(focusedKey === key ? null : key)
  }

  return (
    <div className="assignment-alloc-legend">
      {summary.rows.map((row) => (
        <button
          key={row.key}
          type="button"
          className={[
            'assignment-alloc-row',
            focusedKey === row.key ? 'assignment-alloc-row--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-pressed={focusedKey === row.key}
          onClick={() => selectKey(row.key)}
        >
          <span className="assignment-alloc-swatch" style={{ backgroundColor: row.color }} aria-hidden />
          <span className="assignment-alloc-label" title={row.label}>
            {row.label}
          </span>
          <span className="assignment-alloc-count">{row.count}</span>
        </button>
      ))}
      {!summary.hideUnassignedRow ? (
        <button
          type="button"
          className={[
            'assignment-alloc-row',
            focusedKey === '__unassigned__' ? 'assignment-alloc-row--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-pressed={focusedKey === '__unassigned__'}
          onClick={() => selectKey('__unassigned__')}
        >
          <span
            className="assignment-alloc-swatch"
            style={{ backgroundColor: summary.unassignedColor ?? NEIGHBORHOOD_UNASSIGNED_COLOR }}
            aria-hidden
          />
          <span className="assignment-alloc-label">{summary.unassignedLabel}</span>
          <span className="assignment-alloc-count">{summary.unassigned}</span>
        </button>
      ) : null}
    </div>
  )
}

/**
 * Floating floor card:
 * - Collapsed: selected floor + desk chart + allocation overview + total
 * - Expanded: "Select floor" picker with per-floor charts
 */
function AssignmentSidePanel({
  users,
  view,
  currentFloorId,
  currentFloorLabel,
  activeSection,
  onSectionChange,
  onSelectFloor,
  focusedAllocationKey,
  onFocusAllocationKey,
  showBreakdown = true,
}) {
  const summaries = useMemo(() => buildAssignmentFloorSummaries(users, view), [users, view])
  const currentSummary = summaries[currentFloorId] ?? {
    rows: [],
    unassigned: 0,
    unassignedLabel: 'Unassigned',
    total: 0,
    desks: [],
  }

  const floorsExpanded = activeSection === 'floors'
  const panelRef = useRef(null)

  const closeFloors = () => {
    if (floorsExpanded) onSectionChange('overview')
  }

  const openFloors = () => {
    onSectionChange('floors')
  }

  useEffect(() => {
    if (!floorsExpanded) return undefined

    const handlePointerDown = (event) => {
      const root = panelRef.current
      if (!root || root.contains(event.target)) return
      const target = event.target
      if (!(target instanceof Element)) return
      // Keep picker open for chrome (View by, actions, agent); only close on map clicks.
      if (!target.closest('.floor-main')) return
      onSectionChange('overview')
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [floorsExpanded, onSectionChange])

  return (
    <div
      ref={panelRef}
      className={[
        'assignment-side-panel',
        floorsExpanded ? 'assignment-side-panel--picker' : 'assignment-side-panel--overview',
      ].join(' ')}
    >
      {floorsExpanded ? (
        <>
          <div className="assignment-floor-picker-header" id="assignment-floors-toggle">
            <span className="assignment-floor-picker-heading">Select floor</span>
            <button
              type="button"
              className="assignment-floor-picker-close"
              aria-label="Close floor picker"
              onClick={closeFloors}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          <ul
            id="assignment-floors-picker"
            className="assignment-floor-picker-list"
            role="listbox"
            aria-label="Select floor"
          >
            {FLOOR_OPTIONS.map((floor) => {
              const summary = summaries[floor.id]
              const isCurrent = floor.id === currentFloorId
              return (
                <li key={floor.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    data-floor-queue-drop={floor.id}
                    className={[
                      'assignment-floor-picker-option',
                      isCurrent ? 'assignment-floor-picker-option--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onSelectFloor(floor.id)}
                  >
                    <span className="assignment-floor-picker-label">{floor.label}</span>
                    {summary ? (
                      <DeskSwatchGrid
                        desks={summary.desks}
                        compact
                        focusedKey={isCurrent ? focusedAllocationKey : null}
                      />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <>
          <button
            type="button"
            className="assignment-floor-overview-header"
            aria-expanded={false}
            aria-controls="assignment-floors-picker"
            id="assignment-floors-toggle"
            onClick={openFloors}
          >
            <span className="assignment-floor-overview-title">{currentFloorLabel}</span>
            <FontAwesomeIcon icon={faChevronDown} className="assignment-floor-chevron" aria-hidden />
          </button>

          <div className="assignment-floor-overview-chart">
            <DeskSwatchGrid desks={currentSummary.desks} focusedKey={focusedAllocationKey} />
          </div>

          {showBreakdown ? (
            <>
              <div className="assignment-floor-overview-legend">
                <AllocationLegend
                  summary={currentSummary}
                  focusedKey={focusedAllocationKey}
                  onSelectKey={onFocusAllocationKey}
                />
              </div>

              <div className="assignment-floor-overview-total">
                <span>Total desks</span>
                <span>{currentSummary.total}</span>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}

export function AssignmentOverviewBody({
  users,
  view,
  floorId,
  focusedAllocationKey,
  onFocusAllocationKey,
}) {
  const summaries = useMemo(() => buildAssignmentFloorSummaries(users, view), [users, view])
  const summary = summaries[floorId] ?? {
    rows: [],
    unassigned: 0,
    unassignedLabel: 'Unassigned',
    total: 0,
    desks: [],
  }

  return (
    <>
      <AllocationLegend
        summary={summary}
        focusedKey={focusedAllocationKey}
        onSelectKey={onFocusAllocationKey}
      />
      <div className="assignment-floor-overview-total">
        <span>Total desks</span>
        <span>{summary.total}</span>
      </div>
    </>
  )
}

export default AssignmentSidePanel

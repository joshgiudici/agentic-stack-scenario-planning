import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Avatar,
  Button,
  Checkbox,
  ConfigProvider,
  Input,
  Modal,
  Popover,
  Radio,
  Segmented,
  Select,
} from 'antd'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCheck,
  faCircleCheck,
  faChevronDown,
  faChevronRight,
  faChevronUp,
  faFilter,
  faMagnifyingGlass,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import {
  DIRECTORY_DEPARTMENTS,
  deskLayoutByFloor,
  floorOverviewExtras,
  FLOOR_OPTIONS,
  users as allUsers,
} from './mockData'
import { DESK_TILE_HEIGHT, DESK_TILE_WIDTH } from './deskLayoutShared.js'
import {
  buildNeighborhoodPieGradient,
  computeNeighborhoodLabelAnchors,
  computeNeighborhoodOverviewStats,
  getDeskNeighborhoodColor,
  getDeskNeighborhoodId,
  getNeighborhoodById,
  darkenHexColor,
  getNeighborhoodsForFloor,
  installScenarioNeighborhoods,
  lightenHexColor,
  NEIGHBORHOOD_UNASSIGNED_COLOR,
  neighborhoodColor,
} from './neighborhoodData.js'
import { antdTheme, figmaTheme, toCssVariables } from './themeTokens'
import StackPlanView from './StackPlanView.jsx'
import AssignmentSidePanel, { AssignmentOverviewBody } from './AssignmentSidePanel.jsx'
import AllocationDetailSidebar from './AllocationDetailSidebar.jsx'
import AgentSidebar, { AgentMiniPanel } from './AgentSidebar.jsx'
import {
  ASSIGNMENT_MAP_VIEWS,
  assignmentDeskMeta,
  buildAllocationDetail,
  buildAssignmentLabelAnchors,
  avatarFillStyle,
  buildAssignmentMapModel,
  viewAvatarColorByUserId,
} from './assignmentMapData.js'
import { buildScenarioFromStack } from './scenarioFromStack.js'
import DraftDirectory from './DraftDirectory.jsx'

/** Set true to bring back the directory/queue column in Assignments. */
const SHOW_ASSIGNMENT_PEOPLE_SIDEBAR = false
/** Set true to bring back the right overview column in Assignments. */
const SHOW_ASSIGNMENT_RIGHT_OVERVIEW = false

function formatSelectedDeskLabel(user) {
  if (!user.deskId || !user.floorId) return 'Unassigned'
  const parts = user.deskId.split('-')
  if (parts.length < 2) return `Desk ${user.deskId}`
  return `Desk ${parts[0]} - ${parts.slice(1).join('-')}`
}

const FLOOR_OPTIONS_DESC = [...FLOOR_OPTIONS].reverse()

const DIRECTORY_ASSIGNMENT_STATUS_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'assigned', label: 'Assigned to a desk' },
  { value: 'unassigned', label: 'Not assigned to a desk' },
]

const DIRECTORY_DATE_ADDED_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: '7', label: 'Last 7 days' },
  { value: '15', label: 'Last 15 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
]

const DEFAULT_DIRECTORY_FILTERS = {
  assignmentStatus: 'any',
  dateAdded: 'any',
  department: 'any',
  managerId: null,
  selectedOnly: false,
}

const TEMPORARY_DRAFT_DIRECTORY_FILTERS = {
  assignmentStatus: 'unassigned',
  dateAdded: '7',
  department: 'any',
  managerId: null,
  selectedOnly: false,
}

function userHasDesk(user) {
  return Boolean(user.deskId && user.floorId)
}

function userHasDeskOnFloor(user, floorId) {
  return user.floorId === floorId && Boolean(user.deskId)
}

function DeskFloorLabel({ deskId, floorId, className }) {
  if (!deskId || !floorId) {
    return <span className={className}>Unassigned</span>
  }
  return (
    <span className={className}>
      {formatSuggestedDeskTitle(deskId)}
      <span className="user-assignment-sep" aria-hidden />
      {floorLabelForId(floorId)}
    </span>
  )
}

function parseUserDateAdded(iso) {
  if (!iso || typeof iso !== 'string') return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function userMatchesDateAddedFilter(user, dateAddedValue) {
  if (dateAddedValue === 'any') return true
  const days = Number(dateAddedValue)
  if (!Number.isFinite(days)) return true
  const added = parseUserDateAdded(user.dateAdded)
  if (!added) return false
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - days)
  return added >= cutoff
}

function buildOccupiedDeskKeySet(users) {
  const s = new Set()
  for (const u of users) {
    if (u.floorId && u.deskId) s.add(`${u.floorId}:${u.deskId}`)
  }
  return s
}

/** First free desk on `floorId` for each eligible user, in list order. */
function allocateDeskSuggestionsForFloor({
  floorId,
  userIdsOrdered,
  mergedUsers,
  reservedSlotsByUserId = {},
  dismissedSlotKeys,
  /** `unassigned` — skip users with any desk; `not-on-floor` — skip only if assigned on `floorId`. */
  eligibility = 'unassigned',
}) {
  const occupied = buildOccupiedDeskKeySet(mergedUsers)
  const reserved = new Set()
  for (const s of Object.values(reservedSlotsByUserId)) {
    if (s?.floorId && s?.deskId) reserved.add(`${s.floorId}:${s.deskId}`)
  }
  const layout = deskLayoutByFloor[floorId] ?? []
  const out = {}
  for (const userId of userIdsOrdered) {
    const u = mergedUsers.find((x) => x.id === userId)
    if (!u) continue
    if (eligibility === 'unassigned' && userHasDesk(u)) continue
    if (eligibility === 'not-on-floor' && userHasDeskOnFloor(u, floorId)) continue
    const dismissKey = `${userId}:${floorId}`
    if (dismissedSlotKeys[dismissKey]) continue
    for (const entry of layout) {
      const k = `${floorId}:${entry.deskId}`
      if (occupied.has(k) || reserved.has(k)) continue
      const slot = { floorId, deskId: entry.deskId }
      out[userId] = slot
      reserved.add(k)
      break
    }
  }
  return out
}

function removeDismissedDeskSuggestionKeysForUserIds(prev, userIds) {
  let touched = false
  const next = { ...prev }
  for (const key of Object.keys(prev)) {
    if (userIds.some((id) => key.startsWith(`${id}:`))) {
      delete next[key]
      touched = true
    }
  }
  return touched ? next : prev
}

function floorLabelForId(floorId) {
  return FLOOR_OPTIONS.find((f) => f.id === floorId)?.label ?? floorId
}

function formatSuggestedDeskTitle(deskId) {
  const parts = deskId.split('-')
  if (parts.length < 2) return `Desk ${deskId}`
  return `Desk ${parts[0]} - ${parts.slice(1).join('-')}`
}

function layoutPointInDeskLayout(clientX, clientY, layoutEl) {
  if (!layoutEl) return null
  const rect = layoutEl.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
  return { x, y }
}

function occupiedDeskIdsOnFloor(users, floorId) {
  const s = new Set()
  for (const u of users) {
    if (u.floorId === floorId && u.deskId) s.add(u.deskId)
  }
  return s
}

/** Unoccupied desks on this layout, sorted by distance to (lx, ly) in layout px. */
function getFreeDesksSortedByDistanceFromLayout(deskLayout, occupiedDeskIds, lx, ly) {
  const hw = DESK_TILE_WIDTH / 2
  const hh = DESK_TILE_HEIGHT / 2
  return deskLayout
    .filter((d) => !occupiedDeskIds.has(d.deskId))
    .map((d) => {
      const cx = d.x + hw
      const cy = d.y + hh
      return { deskId: d.deskId, dist: Math.hypot(cx - lx, cy - ly) }
    })
    .sort((a, b) => a.dist - b.dist)
}

/** Nearest N open desks to the cursor (N = people in the drag); same seats as multi-drop, never more than N. */
function getProximityFreeDeskIdsForHighlight(deskLayout, occupiedDeskIds, lx, ly, userCount) {
  const sorted = getFreeDesksSortedByDistanceFromLayout(deskLayout, occupiedDeskIds, lx, ly)
  const n = Math.min(userCount, sorted.length)
  return sorted.slice(0, n).map((e) => e.deskId)
}

function deskPodLabel(deskId) {
  if (!deskId) return '—'
  return `Pod ${deskId.replace(/-/g, '')}`
}

function mockEmailFromName(name) {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.|\.$/g, '')
  return `${slug || 'user'}@example.com`
}

/** Slides in from the right when `show` becomes true; slides out when false. Keeps children mounted until exit ends. */
function RightSlideOverlay({ show, onExited, className, children }) {
  const wrapRef = useRef(null)
  const [mounted, setMounted] = useState(show)
  const [entered, setEntered] = useState(false)

  useLayoutEffect(() => {
    if (show) {
      setMounted(true)
      setEntered(false)
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true))
      })
      return () => cancelAnimationFrame(id)
    }
    setEntered(false)
    return undefined
  }, [show])

  const handleTransitionEnd = (e) => {
    if (e.target !== wrapRef.current) return
    if (e.propertyName !== 'transform') return
    if (!entered) {
      setMounted(false)
      onExited?.()
    }
  }

  if (!mounted) return null

  return (
    <div
      ref={wrapRef}
      className={['sidebar-right-slide', entered ? 'sidebar-right-slide--visible' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      onTransitionEnd={handleTransitionEnd}
    >
      {children}
    </div>
  )
}

function SelectionSlideDrawer({ show, className, children, ...rest }) {
  const shellRef = useRef(null)
  const [mounted, setMounted] = useState(show)
  const [entered, setEntered] = useState(false)

  useLayoutEffect(() => {
    if (show) {
      setMounted(true)
      setEntered(false)
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true))
      })
      return () => cancelAnimationFrame(id)
    }
    setEntered(false)
    return undefined
  }, [show])

  const handleTransitionEnd = (e) => {
    if (e.target !== shellRef.current) return
    if (e.propertyName !== 'grid-template-rows') return
    if (!entered) setMounted(false)
  }

  if (!mounted) return null

  return (
    <div
      ref={shellRef}
      className={[
        'directory-selection-drawer-shell',
        entered ? 'directory-selection-drawer-shell--visible' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="directory-selection-drawer-inner">
        <div
          className={[
            'directory-selection-drawer',
            entered ? 'directory-selection-drawer--visible' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          {...rest}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function DeskDetailsSidebar({
  floorId,
  deskId,
  occupantUserId,
  suggestedAssigneeUserId,
  onClose,
  onClearAssignments,
  allUsers,
  onExpandAgent,
}) {
  const occupant = occupantUserId ? allUsers.find((u) => u.id === occupantUserId) : null
  const suggestedFor =
    suggestedAssigneeUserId != null && occupantUserId == null
      ? allUsers.find((u) => u.id === suggestedAssigneeUserId)
      : null
  const deskTitle = formatSelectedDeskLabel({ deskId, floorId })
  const neighborhoodsOnFloor = getNeighborhoodsForFloor(floorId)
  const deskNeighborhoodId = getDeskNeighborhoodId(floorId, deskId)
  const deskNeighborhood = deskNeighborhoodId
    ? getNeighborhoodById(floorId, deskNeighborhoodId)
    : null
  const neighborhoodDefault =
    deskNeighborhood?.name ?? neighborhoodsOnFloor[0]?.name ?? 'Marketing'
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="desk-details-sidebar">
      <div className="desk-details-main">
        <div className="desk-details-header">
          <div className="desk-details-header-text">
            <div className="desk-details-title">{deskTitle}</div>
            <div className="desk-details-subtitle">{deskPodLabel(deskId)}</div>
          </div>
          <button type="button" className="desk-details-close" aria-label="Close desk details" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        {suggestedFor ? (
          <div className="desk-details-suggestion-preview" role="note">
            <span className="desk-details-suggestion-preview-label">Suggested for </span>
            <span className="desk-details-suggestion-preview-name">{suggestedFor.name}</span>
            <span className="desk-details-suggestion-preview-hint">
              {' '}
              — this desk is open until you accept in the directory.
            </span>
          </div>
        ) : null}
        <div className="desk-details-body">
          <div className="desk-details-field">
            <label className="desk-details-label" htmlFor="desk-detail-neighborhood">
              Neighborhood
            </label>
            <Select
              id="desk-detail-neighborhood"
              className="desk-details-select"
              defaultValue={neighborhoodDefault}
              options={neighborhoodsOnFloor.map((n) => ({ label: n.name, value: n.name }))}
            />
          </div>
          <div className="desk-details-field">
            <label className="desk-details-label" htmlFor="desk-detail-type">
              Type
            </label>
            <Select
              id="desk-detail-type"
              className="desk-details-select"
              defaultValue="assigned"
              options={[
                { label: 'Assigned', value: 'assigned' },
                { label: 'Hotel', value: 'hotel' },
              ]}
            />
            <label className="desk-details-checkbox-row">
              <Checkbox>Bookable on unassigned days</Checkbox>
            </label>
          </div>
          <div className="desk-details-field">
            <label className="desk-details-label" htmlFor="desk-detail-availability">
              Availability
            </label>
            <Select
              id="desk-detail-availability"
              className="desk-details-select"
              defaultValue="available"
              options={[
                { label: 'Available', value: 'available' },
                { label: 'Unavailable', value: 'unavailable' },
              ]}
            />
          </div>
          <div className="desk-details-section">
            <div className="desk-details-section-header">
              <span className="desk-details-section-title">Assignments</span>
              <button
                type="button"
                className="desk-details-link-button"
                onClick={onClearAssignments}
                disabled={!occupant}
              >
                Clear all
              </button>
            </div>
            <ul className="desk-details-assignments" role="list">
              {weekDays.map((day) => (
                <li key={day} className="desk-details-assignment-row">
                  <span className="desk-details-day">{day}</span>
                  {occupant ? (
                    <div className="desk-details-assignee">
                      <Avatar
                        className="desk-details-assignee-avatar"
                        size={28}
                        style={avatarFillStyle(occupant.avatarColor)}
                      >
                        {occupant.name.charAt(0).toUpperCase()}
                      </Avatar>
                      <div className="desk-details-assignee-meta">
                        <div className="desk-details-assignee-name">{occupant.name}</div>
                        <div className="desk-details-assignee-email">{mockEmailFromName(occupant.name)}</div>
                      </div>
                    </div>
                  ) : (
                    <span className="desk-details-unassigned">Unassigned</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="desk-details-section desk-details-section--spaced">
            <div className="desk-details-section-title">Upcoming bookings</div>
            <div className="desk-details-muted">None</div>
          </div>
        </div>
      </div>
      {onExpandAgent ? <AgentMiniPanel onExpand={onExpandAgent} /> : null}
    </div>
  )
}

const SEARCH_LIST_OFF_FLOOR_AVATAR = '#868686'

function searchListAvatarColor(user, currentFloorId) {
  const seatedOnViewedFloor = Boolean(user.deskId) && user.floorId === currentFloorId
  if (seatedOnViewedFloor) return user.avatarColor
  return SEARCH_LIST_OFF_FLOOR_AVATAR
}

function DirectoryDragChipContent({ users, currentFloorId }) {
  const n = users.length
  if (n === 1) {
    const u = users[0]
    return (
      <>
        <Avatar
          className="user-directory-drag-chip-avatar user-directory-drag-chip-avatar--solo"
          size={28}
          style={avatarFillStyle(searchListAvatarColor(u, currentFloorId))}
        >
          {u.name.charAt(0).toUpperCase()}
        </Avatar>
        <span className="user-directory-drag-chip-name">{u.name}</span>
      </>
    )
  }
  if (n === 2) {
    return (
      <>
        <div className="user-directory-drag-chip-avatars">
          {users.map((u) => (
            <Avatar
              key={u.id}
              className="user-directory-drag-chip-avatar-stack"
              size={28}
              style={avatarFillStyle(searchListAvatarColor(u, currentFloorId))}
            >
              {u.name.charAt(0).toUpperCase()}
            </Avatar>
          ))}
        </div>
        <span className="user-directory-drag-chip-count-label">2 users</span>
      </>
    )
  }
  return (
    <>
      <div className="user-directory-drag-chip-avatars">
        <Avatar
          className="user-directory-drag-chip-avatar-stack"
          size={28}
          style={avatarFillStyle(searchListAvatarColor(users[0], currentFloorId))}
        >
          {users[0].name.charAt(0).toUpperCase()}
        </Avatar>
        <Avatar
          className="user-directory-drag-chip-avatar-stack"
          size={28}
          style={avatarFillStyle(searchListAvatarColor(users[1], currentFloorId))}
        >
          {users[1].name.charAt(0).toUpperCase()}
        </Avatar>
        <span className="user-directory-drag-chip-more" aria-hidden>
          +{n - 2}
        </span>
      </div>
      <span className="user-directory-drag-chip-count-label">{n} users</span>
    </>
  )
}

function DeskRecommendationsBanner({ count, onAcceptAll }) {
  if (count === 0) return null
  return (
    <div className="queue-desk-recommendations-banner" role="region" aria-label="Desk recommendations">
      <div className="queue-desk-recommendations-banner-copy">
        <span className="user-assignment-auto-emoji" aria-hidden>
          ✨
        </span>
        <span className="queue-desk-recommendations-banner-text">
          {count} desk recommendation
          {count === 1 ? '' : 's'}
        </span>
      </div>
      <button type="button" className="queue-desk-recommendations-accept-all" onClick={onAcceptAll}>
        <FontAwesomeIcon
          icon={faCheck}
          className="queue-desk-recommendations-accept-all-icon"
          aria-hidden
        />
        Accept all
      </button>
    </div>
  )
}

function SidebarUserRow({
  user,
  currentFloorId,
  isSelected,
  onToggle,
  directoryDragHandle,
  onOpenDeskFromUser,
  deskSuggestion,
  onAcceptSuggestedDesk,
  onRejectSuggestedDesk,
  onOpenSuggestedDesk,
}) {
  const isAssignedToCurrentFloor = user.floorId && user.floorId === currentFloorId
  const canOpenDesk = Boolean(user.deskId && user.floorId)

  const deskLine = canOpenDesk ? (
    <button
      type="button"
      className="user-assignment-desk-hit user-assignment"
      title={`Open ${formatSuggestedDeskTitle(user.deskId)} on ${floorLabelForId(user.floorId)}`}
      onClick={(e) => {
        e.stopPropagation()
        onOpenDeskFromUser?.(user)
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <DeskFloorLabel deskId={user.deskId} floorId={user.floorId} />
    </button>
  ) : (
    <div className="user-assignment">
      <DeskFloorLabel deskId={user.deskId} floorId={user.floorId} />
    </div>
  )

  return (
    <div
      className={[
        'user-row',
        isSelected ? 'user-row-selected' : '',
        deskSuggestion ? 'user-row--with-suggestion' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onPointerDown={(e) => {
        if (!directoryDragHandle) return
        const el = e.target
        if (!(el instanceof Element)) return
        if (
          el.closest(
            '.user-checkbox, .ant-checkbox-wrapper, .user-assignment-desk-hit, .user-desk-suggestion, .user-row-suggestion-actions',
          )
        )
          return
        directoryDragHandle.onPointerDown(e, user)
      }}
    >
      <Checkbox checked={isSelected} onChange={onToggle} className="user-checkbox" />
      <div className="user-avatar-wrap">
        <Avatar
          className="user-avatar"
          size="small"
          style={avatarFillStyle(searchListAvatarColor(user, currentFloorId))}
        >
          {user.name.charAt(0).toUpperCase()}
        </Avatar>
        {isSelected && isAssignedToCurrentFloor && (
          <span className="user-avatar-selected-outline" />
        )}
      </div>
      <div className="user-meta">
        <div className="user-primary-lines">
          <div className="user-name">{user.name}</div>
          {deskLine}
        </div>
        {deskSuggestion ? (
          <div className="user-desk-suggestion">
            <span className="user-desk-suggestion-emoji" aria-hidden>
              ✨
            </span>
            <button
              type="button"
              className="user-desk-suggestion-desk-hit"
              onClick={(e) => {
                e.stopPropagation()
                onOpenSuggestedDesk?.()
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="user-desk-suggestion-text">
                <DeskFloorLabel deskId={deskSuggestion.deskId} floorId={deskSuggestion.floorId} />
              </span>
            </button>
            <div className="user-row-suggestion-actions">
              <button
                type="button"
                className="user-desk-suggestion-icon-btn user-desk-suggestion-icon-btn--accept"
                aria-label="Accept suggested desk"
                onClick={(e) => {
                  e.stopPropagation()
                  onAcceptSuggestedDesk?.()
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <FontAwesomeIcon icon={faCheck} className="user-desk-suggestion-icon" />
              </button>
              <button
                type="button"
                className="user-desk-suggestion-icon-btn user-desk-suggestion-icon-btn--reject"
                aria-label="Reject suggested desk"
                onClick={(e) => {
                  e.stopPropagation()
                  onRejectSuggestedDesk?.()
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <FontAwesomeIcon icon={faXmark} className="user-desk-suggestion-icon" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function NeighborhoodPieChart({ gradient }) {
  return (
    <div className="neighborhood-pie-wrap" aria-hidden>
      <div className="neighborhood-pie" style={{ background: gradient }} />
    </div>
  )
}

function App() {
  /** Top-level mode: floor charts vs map-based scenario planning. */
  const [planningMode, setPlanningMode] = useState('stack-planning')
  /** Directory list, or the full-screen draft editor. */
  const [appView, setAppView] = useState('directory')
  const stackPlanRef = useRef(null)
  const [agentBrief, setAgentBrief] = useState(null)
  const [stackAgentTab, setStackAgentTab] = useState(false)
  const [assignmentMapView, setAssignmentMapView] = useState('default')
  const [showAssignmentAvatars, setShowAssignmentAvatars] = useState(true)
  const [showNeighborhoodLabels, setShowNeighborhoodLabels] = useState(true)
  const [assignmentSidebarSection, setAssignmentSidebarSection] = useState('overview')
  /** Exclusive left-rail section under the floor card. */
  const [assignmentToolSection, setAssignmentToolSection] = useState('overview')
  const [activeRightPanel, setActiveRightPanel] = useState('agent')
  const activeRightPanelRef = useRef('agent')
  const queuedRightPanelRef = useRef(null)
  const exitingRightPanelRef = useRef(null)
  const [agentContextUsers, setAgentContextUsers] = useState([])
  const agentWasOpenRef = useRef(false)
  const [focusedAllocationKey, setFocusedAllocationKey] = useState(null)
  const [selectedNeighborhoodId, setSelectedNeighborhoodId] = useState(null)
  const [currentFloorId, setCurrentFloorId] = useState('floor-1')
  const [floorPickerExpanded, setFloorPickerExpanded] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [selectionPanel, setSelectionPanel] = useState(null)
  const DIRECTORY_USER_BATCH_SIZE = 20
  const [visibleDirectoryUserCount, setVisibleDirectoryUserCount] = useState(DIRECTORY_USER_BATCH_SIZE)
  const directoryUserListScrollRef = useRef(null)
  const directoryUserLoadMoreRef = useRef(null)
  const [leftSidebarTab, setLeftSidebarTab] = useState('directory')
  const [queuesByFloor, setQueuesByFloor] = useState(() =>
    Object.fromEntries(FLOOR_OPTIONS.map((f) => [f.id, []])),
  )
  const [addQueuePopoverOpen, setAddQueuePopoverOpen] = useState(false)
  const [queueToast, setQueueToast] = useState(null)
  const queueToastIdRef = useRef(0)

  const showQueueToast = useCallback((text, { viewFloorId } = {}) => {
    queueToastIdRef.current += 1
    setQueueToast({
      id: queueToastIdRef.current,
      text,
      viewFloorId: viewFloorId ?? null,
    })
  }, [])

  const openQueueFromToast = useCallback((floorId) => {
    setCurrentFloorId(floorId)
    setLeftSidebarTab('queue')
    setAssignmentToolSection('queue')
    setQueueToast(null)
  }, [])

  const handleQueueToastAnimationEnd = useCallback((e) => {
    if (e.animationName === 'queue-toast-cycle') {
      setQueueToast(null)
    }
  }, [])
  const [directorySearchQuery, setDirectorySearchQuery] = useState('')
  const [directoryFilterPopoverOpen, setDirectoryFilterPopoverOpen] = useState(false)
  const [directoryFilters, setDirectoryFilters] = useState(() => ({ ...DEFAULT_DIRECTORY_FILTERS }))
  /** Prototype control: standard vs temporary draft experience. */
  const [draftExperienceType, setDraftExperienceType] = useState('standard')
  /** Prototype: assign desk from directory without persisting to `directoryUserDb`. */
  const [directoryAssignmentOverrides, setDirectoryAssignmentOverrides] = useState({})
  const [scenarioNeighborhoods, setScenarioNeighborhoods] = useState(null)
  const [convertOpen, setConvertOpen] = useState(false)
  const [convertReady, setConvertReady] = useState(false)
  const [convertMode, setConvertMode] = useState('both')
  /** `userId:floorId` keys for directory suggestions the user dismissed (reject). */
  const [directoryDismissedDeskSuggestionByKey, setDirectoryDismissedDeskSuggestionByKey] =
    useState(() => ({}))
  /** `userId:floorId` keys for queue suggestions the user dismissed (reject). */
  const [queueDismissedDeskSuggestionByKey, setQueueDismissedDeskSuggestionByKey] = useState(() => ({}))
  const [focusedDesk, setFocusedDesk] = useState(null)
  const [deskPanelOpen, setDeskPanelOpen] = useState(false)
  const [assignmentPulseDesk, setAssignmentPulseDesk] = useState(null)
  const assignmentPulseTimeoutRef = useRef(null)

  const pulseAssignedDeskOnMap = useCallback((slot, userId) => {
    setCurrentFloorId(slot.floorId)
    setFocusedDesk({
      floorId: slot.floorId,
      deskId: slot.deskId,
      occupantUserId: userId,
      suggestedAssigneeUserId: null,
    })
    setAssignmentPulseDesk({ floorId: slot.floorId, deskId: slot.deskId, tick: Date.now() })
    if (assignmentPulseTimeoutRef.current) {
      clearTimeout(assignmentPulseTimeoutRef.current)
    }
    assignmentPulseTimeoutRef.current = window.setTimeout(() => {
      setAssignmentPulseDesk(null)
      assignmentPulseTimeoutRef.current = null
    }, 1500)
  }, [])

  useEffect(
    () => () => {
      if (assignmentPulseTimeoutRef.current) {
        clearTimeout(assignmentPulseTimeoutRef.current)
      }
    },
    [],
  )

  installScenarioNeighborhoods(planningMode === 'scenario-planning' ? scenarioNeighborhoods : null)

  const usersWithDirectoryOverrides = useMemo(
    () => {
      const withOverrides = allUsers.map((u) => {
        if (!(u.id in directoryAssignmentOverrides)) return u
        const o = directoryAssignmentOverrides[u.id]
        if (o.floorId == null && o.deskId == null) {
          return { ...u, floorId: undefined, deskId: undefined }
        }
        return { ...u, floorId: o.floorId, deskId: o.deskId }
      })
      const colors = viewAvatarColorByUserId(withOverrides, assignmentMapView)
      return withOverrides.map((u) => {
        const avatarColor = colors.get(u.id)
        return avatarColor && avatarColor !== u.avatarColor ? { ...u, avatarColor } : u
      })
    },
    [directoryAssignmentOverrides, assignmentMapView, planningMode, scenarioNeighborhoods],
  )

  const usersWithDirectoryOverridesRef = useRef(usersWithDirectoryOverrides)
  useLayoutEffect(() => {
    usersWithDirectoryOverridesRef.current = usersWithDirectoryOverrides
  }, [usersWithDirectoryOverrides])

  const showAssignToastForSlots = useCallback(
    (entries) => {
      if (!entries.length) return

      const usersById = new Map(usersWithDirectoryOverrides.map((u) => [u.id, u]))

      if (entries.length === 1) {
        const { userId, slot } = entries[0]
        const name = usersById.get(userId)?.name ?? 'User'
        showQueueToast(
          `${name} assigned to ${formatSuggestedDeskTitle(slot.deskId)} on ${floorLabelForId(slot.floorId)}`,
        )
        return
      }

      const floorIds = new Set(entries.map(({ slot }) => slot.floorId))
      if (floorIds.size === 1) {
        const floorLabel = floorLabelForId(entries[0].slot.floorId)
        showQueueToast(`${entries.length} users assigned to desks on ${floorLabel}`)
        return
      }

      showQueueToast(`${entries.length} users assigned to desks`)
    },
    [usersWithDirectoryOverrides, showQueueToast],
  )

  const directoryUserFiltersActive = useMemo(() => {
    const f = directoryFilters
    return (
      f.assignmentStatus !== 'any' ||
      f.dateAdded !== 'any' ||
      f.department !== 'any' ||
      Boolean(f.managerId) ||
      f.selectedOnly
    )
  }, [directoryFilters])

  const currentFloorLabel =
    FLOOR_OPTIONS.find((f) => f.id === currentFloorId)?.label ?? 'Floor 1'

  const directoryUsersFiltered = useMemo(() => {
    let list = usersWithDirectoryOverrides.slice()
    if (directoryFilters.assignmentStatus === 'assigned') {
      list = list.filter((u) => userHasDesk(u))
    } else if (directoryFilters.assignmentStatus === 'unassigned') {
      list = list.filter((u) => !userHasDesk(u))
    }
    if (directoryFilters.dateAdded !== 'any') {
      list = list.filter((u) => userMatchesDateAddedFilter(u, directoryFilters.dateAdded))
    }
    if (directoryFilters.department !== 'any') {
      list = list.filter((u) => u.department === directoryFilters.department)
    }
    if (directoryFilters.managerId) {
      list = list.filter((u) => u.managerId === directoryFilters.managerId)
    }
    if (directoryFilters.selectedOnly) {
      const selected = new Set(selectedUserIds)
      list = list.filter((u) => selected.has(u.id))
    }
    const q = directorySearchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((u) => u.name.toLowerCase().includes(q))
    }
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return list
  }, [directoryFilters, directorySearchQuery, usersWithDirectoryOverrides, selectedUserIds])

  const visibleDirectoryUsers = useMemo(
    () => directoryUsersFiltered.slice(0, visibleDirectoryUserCount),
    [directoryUsersFiltered, visibleDirectoryUserCount],
  )

  const hasMoreDirectoryUsers = visibleDirectoryUserCount < directoryUsersFiltered.length

  const directoryListBulkSelectVisible = useMemo(
    () => directoryUserFiltersActive || directorySearchQuery.trim().length > 0,
    [directoryUserFiltersActive, directorySearchQuery],
  )

  const filteredDirectoryIds = useMemo(
    () => directoryUsersFiltered.map((u) => u.id),
    [directoryUsersFiltered],
  )

  const directoryFilteredSelectAllState = useMemo(() => {
    const total = filteredDirectoryIds.length
    if (total === 0) return { allSelected: false, indeterminate: false }
    const selected = new Set(selectedUserIds)
    let n = 0
    for (const id of filteredDirectoryIds) {
      if (selected.has(id)) n += 1
    }
    return {
      allSelected: n === total,
      indeterminate: n > 0 && n < total,
    }
  }, [filteredDirectoryIds, selectedUserIds])

  const toggleSelectAllFilteredDirectory = useCallback(() => {
    setSelectionPanel('directory')
    setSelectedUserIds((prev) => {
      const filteredSet = new Set(filteredDirectoryIds)
      if (filteredSet.size === 0) return prev
      let n = 0
      const prevSet = new Set(prev)
      for (const id of filteredDirectoryIds) {
        if (prevSet.has(id)) n += 1
      }
      if (n === filteredDirectoryIds.length) {
        return prev.filter((id) => !filteredSet.has(id))
      }
      const merged = new Set(prev)
      for (const id of filteredDirectoryIds) merged.add(id)
      return [...merged]
    })
  }, [filteredDirectoryIds])

  useEffect(() => {
    setVisibleDirectoryUserCount(DIRECTORY_USER_BATCH_SIZE)
  }, [directoryFilters, directorySearchQuery])

  useEffect(() => {
    const root = directoryUserListScrollRef.current
    const sentinel = directoryUserLoadMoreRef.current
    if (!root || !sentinel || !hasMoreDirectoryUsers) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        setVisibleDirectoryUserCount((count) =>
          Math.min(count + DIRECTORY_USER_BATCH_SIZE, directoryUsersFiltered.length),
        )
      },
      { root, rootMargin: '160px', threshold: 0 },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMoreDirectoryUsers, directoryUsersFiltered.length])

  const deskLayout = useMemo(
    () => deskLayoutByFloor[currentFloorId] ?? [],
    [currentFloorId],
  )

  /** Left column of each pair: avatar hangs outward to the left; right column: to the right. */
  const deskAvatarSideById = useMemo(() => {
    const byY = {}
    for (const d of deskLayout) {
      if (!byY[d.y]) byY[d.y] = []
      byY[d.y].push(d)
    }
    const side = {}
    for (const y of Object.keys(byY)) {
      const row = byY[y].sort((a, b) => a.x - b.x)
      row.forEach((d, i) => {
        side[d.deskId] = i % 2 === 0 ? 'left' : 'right'
      })
    }
    return side
  }, [deskLayout])

  const assignedByDesk = useMemo(() => {
    const map = new Map()
    usersWithDirectoryOverrides.forEach((u) => {
      if (u.deskId && u.floorId === currentFloorId) {
        map.set(u.deskId, u)
      }
    })
    return map
  }, [currentFloorId, usersWithDirectoryOverrides])

  const overviewStats = useMemo(() => {
    const total = deskLayout.length
    const assigned = assignedByDesk.size
    const { hotel, disabled } = floorOverviewExtras[currentFloorId] ?? {
      hotel: 0,
      disabled: 0,
    }
    const notAssigned = Math.max(0, total - assigned - hotel - disabled)
    return {
      notAssigned,
      assigned,
      hotel,
      disabled,
      total,
    }
  }, [currentFloorId, deskLayout, assignedByDesk])

  const neighborhoodsForFloor = useMemo(
    () => getNeighborhoodsForFloor(currentFloorId),
    [currentFloorId, planningMode, scenarioNeighborhoods],
  )

  const neighborhoodOverviewStats = useMemo(
    () => computeNeighborhoodOverviewStats(currentFloorId, deskLayout),
    [currentFloorId, deskLayout, planningMode, scenarioNeighborhoods],
  )

  const neighborhoodPieGradient = useMemo(
    () =>
      buildNeighborhoodPieGradient(
        neighborhoodOverviewStats.rows,
        neighborhoodOverviewStats.unassigned,
        neighborhoodOverviewStats.total,
      ),
    [neighborhoodOverviewStats],
  )

  const neighborhoodLabelAnchors = useMemo(
    () => computeNeighborhoodLabelAnchors(currentFloorId, deskLayout),
    [currentFloorId, deskLayout, planningMode, scenarioNeighborhoods],
  )

  const isNeighborhoodsView = false
  const isStackPlanView = planningMode === 'stack-planning'
  const isAssignmentsView = planningMode === 'scenario-planning'
  const hideAssignmentPeopleSidebar = isAssignmentsView && !SHOW_ASSIGNMENT_PEOPLE_SIDEBAR
  const hideAssignmentRightOverview = isAssignmentsView && !SHOW_ASSIGNMENT_RIGHT_OVERVIEW

  const assignmentMapModel = useMemo(() => {
    if (!isAssignmentsView || assignmentMapView === 'default') return null
    return buildAssignmentMapModel(usersWithDirectoryOverrides, assignmentMapView)
  }, [isAssignmentsView, assignmentMapView, usersWithDirectoryOverrides, scenarioNeighborhoods])

  const assignmentLabelAnchors = useMemo(() => {
    if (!isAssignmentsView || !showNeighborhoodLabels) return []
    return buildAssignmentLabelAnchors(currentFloorId, deskLayout)
  }, [isAssignmentsView, showNeighborhoodLabels, currentFloorId, deskLayout, scenarioNeighborhoods])

  const allocationDetail = useMemo(() => {
    if (!isAssignmentsView || !focusedAllocationKey) return null
    return buildAllocationDetail(
      usersWithDirectoryOverrides,
      currentFloorId,
      assignmentMapView,
      focusedAllocationKey,
    )
  }, [
    isAssignmentsView,
    focusedAllocationKey,
    usersWithDirectoryOverrides,
    currentFloorId,
    assignmentMapView,
  ])

  const neighborhoodSelectionDetail = useMemo(() => {
    if (!isNeighborhoodsView || !selectedNeighborhoodId) return null
    return buildAllocationDetail(
      usersWithDirectoryOverrides,
      currentFloorId,
      'neighborhood',
      selectedNeighborhoodId,
    )
  }, [
    isNeighborhoodsView,
    selectedNeighborhoodId,
    usersWithDirectoryOverrides,
    currentFloorId,
  ])

  const showRightPanel = useCallback((next) => {
    if (exitingRightPanelRef.current) {
      queuedRightPanelRef.current = next
      return
    }
    const current = activeRightPanelRef.current
    if (current === next) return
    if (current == null) {
      activeRightPanelRef.current = next
      setActiveRightPanel(next)
      return
    }
    queuedRightPanelRef.current = next
    exitingRightPanelRef.current = current
    activeRightPanelRef.current = null
    setActiveRightPanel(null)
  }, [])

  const closeRightPanel = useCallback(() => {
    queuedRightPanelRef.current = null
    if (exitingRightPanelRef.current) return
    const current = activeRightPanelRef.current
    if (current == null) return
    exitingRightPanelRef.current = current
    activeRightPanelRef.current = null
    setActiveRightPanel(null)
  }, [])

  const finishRightPanelExit = useCallback((which) => {
    if (exitingRightPanelRef.current !== which) return
    exitingRightPanelRef.current = null
    const next = queuedRightPanelRef.current
    queuedRightPanelRef.current = null
    if (which === 'allocation' && next !== 'allocation') setFocusedAllocationKey(null)
    if (which === 'neighborhood' && next !== 'neighborhood') setSelectedNeighborhoodId(null)
    if (which === 'desk' && next !== 'desk') {
      setDeskPanelOpen(false)
      setFocusedDesk(null)
    }
    activeRightPanelRef.current = next
    setActiveRightPanel(next)
  }, [])

  const focusAllocationKey = useCallback((key) => {
    if (key) {
      setFocusedAllocationKey(key)
      setDeskPanelOpen(false)
      showRightPanel('allocation')
      return
    }
    closeRightPanel()
  }, [closeRightPanel, showRightPanel])

  const selectNeighborhoodFromMap = useCallback(
    (neighborhoodId) => {
      if (assignmentMapView !== 'neighborhood') {
        setAssignmentMapView('neighborhood')
        setFocusedAllocationKey(neighborhoodId)
        setDeskPanelOpen(false)
        showRightPanel('allocation')
        return
      }
      focusAllocationKey(focusedAllocationKey === neighborhoodId ? null : neighborhoodId)
    },
    [assignmentMapView, focusedAllocationKey, focusAllocationKey, showRightPanel],
  )

  const openSearchUsers = useCallback(() => {
    agentWasOpenRef.current = activeRightPanelRef.current === 'agent'
    showRightPanel('search')
  }, [showRightPanel])

  const closeSearchUsers = useCallback(() => {
    if (agentWasOpenRef.current) {
      agentWasOpenRef.current = false
      showRightPanel('agent')
      return
    }
    closeRightPanel()
  }, [closeRightPanel, showRightPanel])

  const openAgentSidebar = useCallback(() => {
    agentWasOpenRef.current = false
    showRightPanel('agent')
  }, [showRightPanel])

  /** Scenario drafts open with Robin Agent visible, including after a mode switch that closes the rail. */
  const openScenarioDraftAgent = useCallback(() => {
    agentWasOpenRef.current = false
    queuedRightPanelRef.current = null
    exitingRightPanelRef.current = null
    activeRightPanelRef.current = 'agent'
    setActiveRightPanel('agent')
  }, [])

  const handleStackDecision = useCallback((brief) => {
    setAgentBrief(brief)
    openAgentSidebar()
  }, [openAgentSidebar])

  const handleStackReset = useCallback(() => {
    setAgentBrief(null)
    closeRightPanel()
  }, [closeRightPanel])

  const handleAgentSuggestion = useCallback((basis) => {
    stackPlanRef.current?.startFrom(basis)
  }, [])

  const handleStackAgentTab = useCallback((visible) => {
    setStackAgentTab(visible)
  }, [])

  const expandAgentFromMini = useCallback(() => {
    agentWasOpenRef.current = false
    showRightPanel('agent')
  }, [showRightPanel])

  const selectUsersInRobinAgent = () => {
    setAgentContextUsers(selectedUsers)
    openAgentSidebar()
  }

  const clearSelection = () => {
    setSelectedUserIds([])
    setSelectionPanel(null)
    setAddQueuePopoverOpen(false)
    setDirectoryFilters((prev) => (prev.selectedOnly ? { ...prev, selectedOnly: false } : prev))
  }

  const filterToSelectedUsers = () => {
    setDirectorySearchQuery('')
    setDirectoryFilters({
      ...DEFAULT_DIRECTORY_FILTERS,
      selectedOnly: true,
    })
    openSearchUsers()
  }

  const openConvertModal = () => {
    setConvertReady(Boolean(stackPlanRef.current?.snapshot()))
    setConvertMode('both')
    setConvertOpen(true)
  }

  const confirmConvert = () => {
    const floors = stackPlanRef.current?.snapshot()
    if (!floors) return
    const createNeighborhoods = convertMode === 'both' || convertMode === 'neighborhoods'
    const assignDesks = convertMode === 'both' || convertMode === 'assign'
    const result = buildScenarioFromStack({ floors, users: allUsers, mode: convertMode })
    setScenarioNeighborhoods(createNeighborhoods ? result.neighborhoods : null)
    if (assignDesks) setDirectoryAssignmentOverrides(result.assignmentOverrides)
    else setDirectoryAssignmentOverrides({})
    setConvertOpen(false)
    setAssignmentMapView(createNeighborhoods ? 'neighborhood' : 'default')
    setShowNeighborhoodLabels(true)
    setCurrentFloorId('floor-1')
    setSelectedNeighborhoodId(null)
    setFocusedAllocationKey(null)
    setDeskPanelOpen(false)
    setFocusedDesk(null)
    setSelectedUserIds([])
    handlePlanningModeChange('scenario-planning')
    openScenarioDraftAgent()
    setAppView('draft')
  }

  const showDirectory = (mode) => {
    if (mode !== planningMode) handlePlanningModeChange(mode)
    setAppView('directory')
  }

  const openDraft = (mode = planningMode) => {
    if (mode !== planningMode) handlePlanningModeChange(mode)
    if (mode === 'scenario-planning') openScenarioDraftAgent()
    setAppView('draft')
  }

  const handlePlanningModeChange = useCallback((nextMode) => {
    setPlanningMode(nextMode)
    setAgentBrief(null)
    queuedRightPanelRef.current = null
    exitingRightPanelRef.current = null
    activeRightPanelRef.current = null
    setActiveRightPanel(null)
    if (nextMode === 'stack-planning') {
      setSelectedUserIds([])
      setSelectedNeighborhoodId(null)
      setFocusedAllocationKey(null)
      setDeskPanelOpen(false)
      setFocusedDesk(null)
    }
  }, [])

  const selectFloor = (floorId) => {
    if (floorId !== currentFloorId && leftSidebarTab === 'queue') {
      clearSelection()
    }
    setCurrentFloorId(floorId)
    setSelectedNeighborhoodId(null)
  }

  const toggleUserSelected = (userId, panel) => {
    setSelectionPanel(panel)
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }

  const openDeskFromUser = (user) => {
    if (!user?.deskId || !user?.floorId) return
    setFocusedDesk({
      floorId: user.floorId,
      deskId: user.deskId,
      occupantUserId: user.id,
    })
    setDeskPanelOpen(true)
    setCurrentFloorId(user.floorId)
    showRightPanel('desk')
  }

  const openDeskFromMap = (deskId, occupantUser) => {
    setFocusedDesk({
      floorId: currentFloorId,
      deskId,
      occupantUserId: occupantUser?.id ?? null,
      suggestedAssigneeUserId: undefined,
    })
    setDeskPanelOpen(true)
    showRightPanel('desk')
  }

  const unassignUserIds = useCallback((userIds, { deskLabel, removeFromQueues = true } = {}) => {
    if (userIds.length === 0) return

    const usersById = new Map(usersWithDirectoryOverrides.map((u) => [u.id, u]))
    const assignedUsers = userIds
      .map((id) => usersById.get(id))
      .filter((u) => u && userHasDesk(u))

    const idSet = new Set(userIds)

    setDirectoryAssignmentOverrides((prev) => {
      const next = { ...prev }
      for (const id of userIds) {
        next[id] = { floorId: null, deskId: null }
      }
      return next
    })

    if (removeFromQueues) {
      setQueuesByFloor((prev) => {
        let touched = false
        const next = { ...prev }
        for (const floorId of Object.keys(next)) {
          const list = next[floorId] ?? []
          const filtered = list.filter((id) => !idSet.has(id))
          if (filtered.length !== list.length) {
            touched = true
            next[floorId] = filtered
          }
        }
        return touched ? next : prev
      })
    }

    setDirectoryDismissedDeskSuggestionByKey((prev) =>
      removeDismissedDeskSuggestionKeysForUserIds(prev, userIds),
    )

    setQueueDismissedDeskSuggestionByKey((prev) =>
      removeDismissedDeskSuggestionKeysForUserIds(prev, userIds),
    )

    setFocusedDesk((prev) => {
      if (!prev?.occupantUserId || !idSet.has(prev.occupantUserId)) return prev
      return { ...prev, occupantUserId: null, suggestedAssigneeUserId: undefined }
    })

    if (assignedUsers.length > 0) {
      const count = assignedUsers.length
      const text =
        count === 1
          ? deskLabel
            ? `${assignedUsers[0].name} unassigned from ${deskLabel}`
            : `${assignedUsers[0].name} unassigned from their desk`
          : `${count} users unassigned from their desks`
      showQueueToast(text)
    }
  }, [usersWithDirectoryOverrides, showQueueToast])

  const unassignSelectedUsers = () => {
    unassignUserIds([...selectedUserIds], { removeFromQueues: false })
    clearSelection()
  }

  const removeSelectedUsersFromQueue = () => {
    const ids = [...selectedUserIds]
    if (ids.length === 0) return
    const idSet = new Set(ids)
    const floorId = currentFloorId
    const floorLabel = FLOOR_OPTIONS.find((f) => f.id === floorId)?.label ?? 'Floor'
    const removedCount = (queuesByFloor[floorId] ?? []).filter((id) => idSet.has(id)).length

    setQueuesByFloor((prev) => ({
      ...prev,
      [floorId]: (prev[floorId] ?? []).filter((id) => !idSet.has(id)),
    }))

    if (removedCount > 0) {
      showQueueToast(
        `${removedCount} user${removedCount === 1 ? '' : 's'} removed from queue on ${floorLabel}`,
        { viewFloorId: floorId },
      )
    }
    clearSelection()
  }

  useEffect(() => {
    if (selectedUserIds.length === 0 && addQueuePopoverOpen) {
      setAddQueuePopoverOpen(false)
    }
  }, [selectedUserIds.length, addQueuePopoverOpen])

  useEffect(() => {
    if (selectedUserIds.length > 0) return
    setDirectoryFilters((prev) => (prev.selectedOnly ? { ...prev, selectedOnly: false } : prev))
  }, [selectedUserIds.length])

  const selectedUsers = selectedUserIds
    .map((id) => usersWithDirectoryOverrides.find((u) => u.id === id))
    .filter(Boolean)

  const showSelectionOverlay = selectedUsers.length > 0
  const showDeskOverlay = deskPanelOpen && !!focusedDesk
  const exitingRightPanel = exitingRightPanelRef.current
  const agentFooterSidebarOpen =
    ((activeRightPanel === 'allocation' || exitingRightPanel === 'allocation') &&
      Boolean(allocationDetail)) ||
    ((activeRightPanel === 'neighborhood' || exitingRightPanel === 'neighborhood') &&
      Boolean(neighborhoodSelectionDetail)) ||
    ((activeRightPanel === 'desk' || exitingRightPanel === 'desk') && showDeskOverlay)

  const queueCountForCurrentFloor = (queuesByFloor[currentFloorId] ?? []).length

  const queuedUsersForCurrentFloor = useMemo(() => {
    const ids = queuesByFloor[currentFloorId] ?? []
    let users = ids
      .map((id) => usersWithDirectoryOverrides.find((u) => u.id === id))
      .filter(Boolean)
    if (directoryFilters.selectedOnly) {
      const selected = new Set(selectedUserIds)
      users = users.filter((u) => selected.has(u.id))
    }
    return users
  }, [
    queuesByFloor,
    currentFloorId,
    usersWithDirectoryOverrides,
    directoryFilters.selectedOnly,
    selectedUserIds,
  ])

  const queuedUserIdsForCurrentFloor = useMemo(
    () => queuedUsersForCurrentFloor.map((u) => u.id),
    [queuedUsersForCurrentFloor],
  )

  const queueSelectAllState = useMemo(() => {
    const total = queuedUserIdsForCurrentFloor.length
    if (total === 0) return { allSelected: false, indeterminate: false }
    const selected = new Set(selectedUserIds)
    let n = 0
    for (const id of queuedUserIdsForCurrentFloor) {
      if (selected.has(id)) n += 1
    }
    return {
      allSelected: n === total,
      indeterminate: n > 0 && n < total,
    }
  }, [queuedUserIdsForCurrentFloor, selectedUserIds])

  const toggleSelectAllQueuedUsers = useCallback(() => {
    setSelectionPanel('queue')
    setSelectedUserIds((prev) => {
      const queueSet = new Set(queuedUserIdsForCurrentFloor)
      if (queueSet.size === 0) return prev
      let n = 0
      const prevSet = new Set(prev)
      for (const id of queuedUserIdsForCurrentFloor) {
        if (prevSet.has(id)) n += 1
      }
      if (n === queuedUserIdsForCurrentFloor.length) {
        return prev.filter((id) => !queueSet.has(id))
      }
      const merged = new Set(prev)
      for (const id of queuedUserIdsForCurrentFloor) merged.add(id)
      return [...merged]
    })
  }, [queuedUserIdsForCurrentFloor])

  const queueDeskSuggestionByUserId = useMemo(
    () =>
      allocateDeskSuggestionsForFloor({
        floorId: currentFloorId,
        userIdsOrdered: queuesByFloor[currentFloorId] ?? [],
        mergedUsers: usersWithDirectoryOverrides,
        dismissedSlotKeys: queueDismissedDeskSuggestionByKey,
        eligibility: 'not-on-floor',
      }),
    [
      currentFloorId,
      queuesByFloor,
      usersWithDirectoryOverrides,
      queueDismissedDeskSuggestionByKey,
    ],
  )

  const directoryDeskSuggestionByUserId = useMemo(() => {
    if (!directoryListBulkSelectVisible) return {}
    const unassignedIds = directoryUsersFiltered
      .filter((u) => !userHasDesk(u))
      .map((u) => u.id)
    return allocateDeskSuggestionsForFloor({
      floorId: currentFloorId,
      userIdsOrdered: unassignedIds,
      mergedUsers: usersWithDirectoryOverrides,
      reservedSlotsByUserId: queueDeskSuggestionByUserId,
      dismissedSlotKeys: directoryDismissedDeskSuggestionByKey,
      eligibility: 'unassigned',
    })
  }, [
    directoryListBulkSelectVisible,
    directoryUsersFiltered,
    currentFloorId,
    usersWithDirectoryOverrides,
    queueDeskSuggestionByUserId,
    directoryDismissedDeskSuggestionByKey,
  ])

  const queueDeskSuggestionCount = Object.keys(queueDeskSuggestionByUserId).length
  const directoryDeskSuggestionCount = Object.keys(directoryDeskSuggestionByUserId).length

  const handleDraftExperienceChange = useCallback((nextType) => {
    setDraftExperienceType(nextType)
    if (nextType === 'temporary') {
      setDirectoryFilters({ ...TEMPORARY_DRAFT_DIRECTORY_FILTERS })
      setDirectorySearchQuery('')
      setDirectoryDismissedDeskSuggestionByKey({})
      setLeftSidebarTab('directory')
      return
    }
    setDirectoryFilters({ ...DEFAULT_DIRECTORY_FILTERS })
    setDirectoryDismissedDeskSuggestionByKey({})
  }, [])

  const acceptDirectoryDeskSuggestion = useCallback(
    (userId, slot) => {
      setDirectoryAssignmentOverrides((p) => ({
        ...p,
        [userId]: { floorId: slot.floorId, deskId: slot.deskId },
      }))
      pulseAssignedDeskOnMap(slot, userId)
      setDirectoryDismissedDeskSuggestionByKey((p) => {
        const k = `${userId}:${slot.floorId}`
        if (!p[k]) return p
        const n = { ...p }
        delete n[k]
        return n
      })
      showAssignToastForSlots([{ userId, slot }])
    },
    [pulseAssignedDeskOnMap, showAssignToastForSlots],
  )

  const applyQueueDeskSuggestion = useCallback(
    (userId, slot) => {
      setDirectoryAssignmentOverrides((p) => ({
        ...p,
        [userId]: { floorId: slot.floorId, deskId: slot.deskId },
      }))
      pulseAssignedDeskOnMap(slot, userId)
      setQueuesByFloor((prev) => ({
        ...prev,
        [currentFloorId]: (prev[currentFloorId] ?? []).filter((id) => id !== userId),
      }))
      setQueueDismissedDeskSuggestionByKey((p) => {
        const k = `${userId}:${currentFloorId}`
        if (!p[k]) return p
        const n = { ...p }
        delete n[k]
        return n
      })
      showAssignToastForSlots([{ userId, slot }])
    },
    [currentFloorId, pulseAssignedDeskOnMap, showAssignToastForSlots],
  )

  const acceptAllQueueDeskSuggestions = useCallback(() => {
    const entries = Object.entries(queueDeskSuggestionByUserId)
    if (entries.length === 0) return

    const assignedIds = new Set(entries.map(([userId]) => userId))

    setDirectoryAssignmentOverrides((p) => {
      const next = { ...p }
      for (const [userId, slot] of entries) {
        next[userId] = { floorId: slot.floorId, deskId: slot.deskId }
      }
      return next
    })

    setQueuesByFloor((prev) => ({
      ...prev,
      [currentFloorId]: (prev[currentFloorId] ?? []).filter((id) => !assignedIds.has(id)),
    }))

    setQueueDismissedDeskSuggestionByKey((p) => {
      let touched = false
      const next = { ...p }
      for (const userId of assignedIds) {
        const k = `${userId}:${currentFloorId}`
        if (next[k]) {
          delete next[k]
          touched = true
        }
      }
      return touched ? next : p
    })

    showAssignToastForSlots(entries.map(([userId, slot]) => ({ userId, slot })))
  }, [queueDeskSuggestionByUserId, currentFloorId, showAssignToastForSlots])

  const acceptAllDirectoryDeskSuggestions = useCallback(() => {
    const entries = Object.entries(directoryDeskSuggestionByUserId)
    if (entries.length === 0) return

    setDirectoryAssignmentOverrides((p) => {
      const next = { ...p }
      for (const [userId, slot] of entries) {
        next[userId] = { floorId: slot.floorId, deskId: slot.deskId }
      }
      return next
    })

    setDirectoryDismissedDeskSuggestionByKey((p) => {
      let touched = false
      const next = { ...p }
      for (const [userId, slot] of entries) {
        const k = `${userId}:${slot.floorId}`
        if (next[k]) {
          delete next[k]
          touched = true
        }
      }
      return touched ? next : p
    })

    showAssignToastForSlots(entries.map(([userId, slot]) => ({ userId, slot })))
  }, [directoryDeskSuggestionByUserId, showAssignToastForSlots])

  const addUserIdsToFloorQueue = (floorId, userIds) => {
    const floorLabel = FLOOR_OPTIONS.find((f) => f.id === floorId)?.label ?? 'Floor'
    const prevListSnapshot = queuesByFloor[floorId] ?? []
    const snapshotSeen = new Set(prevListSnapshot)
    const newlyAddedIds = userIds.filter((id) => !snapshotSeen.has(id))
    const newlyCount = newlyAddedIds.length
    const movedIds = new Set(userIds)

    setQueuesByFloor((prev) => {
      const list = [...(prev[floorId] ?? [])]
      const seen = new Set(list)
      for (const id of userIds) {
        if (!seen.has(id)) {
          seen.add(id)
          list.push(id)
        }
      }
      const next = { ...prev, [floorId]: list }
      for (const otherFloorId of Object.keys(next)) {
        if (otherFloorId === floorId) continue
        const otherList = next[otherFloorId] ?? []
        const filtered = otherList.filter((id) => !movedIds.has(id))
        if (filtered.length !== otherList.length) {
          next[otherFloorId] = filtered
        }
      }
      return next
    })
    if (newlyAddedIds.length > 0) {
      setDirectoryDismissedDeskSuggestionByKey((prev) =>
        removeDismissedDeskSuggestionKeysForUserIds(prev, newlyAddedIds),
      )
    }
    if (newlyCount > 0) {
      showQueueToast(
        `${newlyCount} user${newlyCount === 1 ? '' : 's'} added to queue on ${floorLabel}`,
        { viewFloorId: floorId },
      )
    } else if (userIds.length === 1) {
      showQueueToast(`That user is already in the queue for ${floorLabel}`)
    } else {
      showQueueToast(`Everyone selected was already in the queue for ${floorLabel}`)
    }
    return { newlyCount, newlyAddedIds }
  }

  const addSelectedUsersToFloorQueue = (floorId) => {
    const { newlyCount } = addUserIdsToFloorQueue(floorId, [...selectedUserIds])
    setAddQueuePopoverOpen(false)
    if (newlyCount > 0) {
      setSelectedUserIds([])
    }
  }

  const currentFloorIdRef = useRef(currentFloorId)
  useEffect(() => {
    currentFloorIdRef.current = currentFloorId
  }, [currentFloorId])

  const sidebarTabsRef = useRef(null)
  const floorPickerRef = useRef(null)
  const deskLayoutRef = useRef(null)
  const skipSegmentChangeRef = useRef(false)
  const skipFloorPickerSelectRef = useRef(false)
  const skipNextDeskClickRef = useRef(false)
  const skipNextToolToggleRef = useRef(false)

  const [dragChip, setDragChip] = useState(null)

  const floorPickerOpen = floorPickerExpanded || !!dragChip?.overFloorPicker

  const segmentedQueueLabel =
    dragChip?.overQueue === true ? '+ Add to queue' : `Queue (${queueCountForCurrentFloor})`

  const segmentedOptions = useMemo(
    () => [
      { label: 'Directory', value: 'directory' },
      {
        label: segmentedQueueLabel,
        value: 'queue',
        className: 'sidebar-segment-queue-target',
      },
    ],
    [segmentedQueueLabel],
  )

  const handleLeftSidebarTabChange = (value) => {
    if (skipSegmentChangeRef.current) {
      skipSegmentChangeRef.current = false
      return
    }
    if (value !== leftSidebarTab) {
      clearSelection()
    }
    setLeftSidebarTab(value)
  }

  const handleDirectoryRowPointerDown = (e, user, { onTap, suppressFollowingClick } = {}) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.currentTarget instanceof Element) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* capture is a convenience; window listeners still track the drag */
      }
    }

    const usersToDrag =
      selectedUserIds.includes(user.id) && selectedUserIds.length > 1
        ? selectedUserIds
            .map((id) => usersWithDirectoryOverrides.find((u) => u.id === id))
            .filter(Boolean)
        : [user]

    const startX = e.clientX
    const startY = e.clientY
    let didDrag = false
    const blockSelect = (ev) => ev.preventDefault()
    document.addEventListener('selectstart', blockSelect)
    document.body.classList.add('app--directory-press')

    const getOverQueue = (clientX, clientY) => {
      const queueNodes = document.querySelectorAll('[data-assignment-queue-drop]')
      for (const node of queueNodes) {
        if (!(node instanceof HTMLElement)) continue
        const rect = node.getBoundingClientRect()
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return true
        }
      }
      const rect = sidebarTabsRef.current
        ?.querySelector('.sidebar-segment-queue-target')
        ?.getBoundingClientRect()
      if (!rect) return false
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      )
    }

    const getOverFloorPickerZone = (clientX, clientY) => {
      const root = floorPickerRef.current
      if (!root) return false
      const r = root.getBoundingClientRect()
      return (
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      )
    }

    const getFloorDropTarget = (clientX, clientY) => {
      const root = floorPickerRef.current
      if (!root) return null
      const nodes = root.querySelectorAll('[data-floor-queue-drop]')
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue
        const r = node.getBoundingClientRect()
        if (r.height < 4) continue
        if (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        ) {
          return node.getAttribute('data-floor-queue-drop')
        }
      }
      return null
    }

    const getMapDeskDropTarget = (clientX, clientY) => {
      const el = document.elementFromPoint(clientX, clientY)
      let node = el
      while (node && node !== document.body) {
        if (node instanceof HTMLElement && node.hasAttribute('data-map-desk')) {
          return node.getAttribute('data-map-desk')
        }
        node = node.parentElement
      }
      return null
    }

    const onMove = (ev) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!didDrag && dx * dx + dy * dy >= 36) {
        didDrag = true
        document.body.classList.add('app--directory-dragging')
        window.getSelection()?.removeAllRanges()
      }
      if (didDrag) {
        const overFloorPicker = getOverFloorPickerZone(ev.clientX, ev.clientY)
        const floorDropHoverId = overFloorPicker
          ? getFloorDropTarget(ev.clientX, ev.clientY)
          : null
        const overQueueSeg = getOverQueue(ev.clientX, ev.clientY)
        const overQueue = overQueueSeg && !floorDropHoverId
        let mapDeskHoverIds = []
        if (!overFloorPicker && !overQueue) {
          if (usersToDrag.length > 1) {
            const floorId = currentFloorIdRef.current
            const layout = deskLayoutByFloor[floorId] ?? []
            const pt = layoutPointInDeskLayout(ev.clientX, ev.clientY, deskLayoutRef.current)
            if (pt) {
              const occ = occupiedDeskIdsOnFloor(usersWithDirectoryOverridesRef.current, floorId)
              mapDeskHoverIds = getProximityFreeDeskIdsForHighlight(
                layout,
                occ,
                pt.x,
                pt.y,
                usersToDrag.length,
              )
            }
          } else {
            const id = getMapDeskDropTarget(ev.clientX, ev.clientY)
            mapDeskHoverIds = id ? [id] : []
          }
        }
        setDragChip({
          users: usersToDrag,
          clientX: ev.clientX,
          clientY: ev.clientY,
          overFloorPicker,
          floorDropHoverId,
          overQueue,
          mapDeskHoverIds,
        })
      }
    }

    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.removeEventListener('selectstart', blockSelect)
      document.body.classList.remove('app--directory-press', 'app--directory-dragging')
      window.getSelection()?.removeAllRanges()
      if (ev.target instanceof Element && ev.target.hasPointerCapture?.(ev.pointerId)) {
        ev.target.releasePointerCapture(ev.pointerId)
      }

      if (suppressFollowingClick) {
        skipNextDeskClickRef.current = true
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            skipNextDeskClickRef.current = false
          })
        })
      }

      if (didDrag) {
        skipNextToolToggleRef.current = true
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            skipNextToolToggleRef.current = false
          })
        })
        const idsDragged = usersToDrag.map((u) => u.id)
        const floorDropId = getFloorDropTarget(ev.clientX, ev.clientY)
        const overQueueSeg = getOverQueue(ev.clientX, ev.clientY)
        const overQueue = overQueueSeg && !floorDropId

        if (floorDropId) {
          skipFloorPickerSelectRef.current = true
          const { newlyCount, newlyAddedIds } = addUserIdsToFloorQueue(floorDropId, idsDragged)
          if (newlyCount > 0) {
            const remove = new Set(newlyAddedIds)
            setSelectedUserIds((prev) => prev.filter((id) => !remove.has(id)))
          }
          document.body.style.pointerEvents = 'none'
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              document.body.style.pointerEvents = ''
            })
          })
        } else if (overQueue) {
          skipSegmentChangeRef.current = true
          const { newlyCount, newlyAddedIds } = addUserIdsToFloorQueue(
            currentFloorIdRef.current,
            idsDragged,
          )
          if (newlyCount > 0) {
            const remove = new Set(newlyAddedIds)
            setSelectedUserIds((prev) => prev.filter((id) => !remove.has(id)))
          }
          document.body.style.pointerEvents = 'none'
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              document.body.style.pointerEvents = ''
            })
          })
        } else {
          const floorId = currentFloorIdRef.current
          const layout = deskLayoutByFloor[floorId] ?? []
          const merged = usersWithDirectoryOverridesRef.current

          const finishMapDropPointerReset = () => {
            document.body.style.pointerEvents = 'none'
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                document.body.style.pointerEvents = ''
              })
            })
          }

          if (usersToDrag.length > 1) {
            const pt = layoutPointInDeskLayout(ev.clientX, ev.clientY, deskLayoutRef.current)
            if (pt) {
              const occ = occupiedDeskIdsOnFloor(merged, floorId)
              const sorted = getFreeDesksSortedByDistanceFromLayout(layout, occ, pt.x, pt.y)
              const nUsers = usersToDrag.length
              if (sorted.length === 0) {
                showQueueToast(`No open desks on ${floorLabelForId(floorId)}.`)
              } else {
                const k = Math.min(nUsers, sorted.length)
                const picked = sorted.slice(0, k)
                const batch = usersToDrag.slice(0, k)
                setDirectoryAssignmentOverrides((prev) => {
                  const next = { ...prev }
                  for (let i = 0; i < k; i++) {
                    next[batch[i].id] = { floorId, deskId: picked[i].deskId }
                  }
                  return next
                })
                setDirectoryDismissedDeskSuggestionByKey((p) =>
                  removeDismissedDeskSuggestionKeysForUserIds(
                    p,
                    batch.map((u) => u.id),
                  ),
                )
                setQueuesByFloor((prev) => {
                  const batchIds = new Set(batch.map((u) => u.id))
                  let touched = false
                  const next = { ...prev }
                  for (const fid of Object.keys(next)) {
                    const list = next[fid] ?? []
                    const filtered = list.filter((id) => !batchIds.has(id))
                    if (filtered.length !== list.length) touched = true
                    next[fid] = filtered
                  }
                  return touched ? next : prev
                })
                setQueueDismissedDeskSuggestionByKey((p) => {
                  let touched = false
                  const next = { ...p }
                  for (const key of Object.keys(p)) {
                    if (batch.some((u) => key.startsWith(`${u.id}:`))) {
                      delete next[key]
                      touched = true
                    }
                  }
                  return touched ? next : p
                })
                const batchIds = new Set(batch.map((u) => u.id))
                setSelectedUserIds((prev) => prev.filter((id) => !batchIds.has(id)))
                const floorLabel = floorLabelForId(floorId)
                let msg =
                  k === 1
                    ? `${batch[0].name} assigned to ${formatSuggestedDeskTitle(picked[0].deskId)} on ${floorLabel} (nearest open desk).`
                    : `Assigned ${k} users to the nearest open desks on ${floorLabel}.`
                if (k < nUsers) {
                  const left = nUsers - k
                  msg += ` ${left} user${left === 1 ? '' : 's'} could not be placed (not enough open desks on this floor).`
                }
                showQueueToast(msg)
              }
              finishMapDropPointerReset()
            }
          } else {
            const deskDropId = getMapDeskDropTarget(ev.clientX, ev.clientY)
            if (deskDropId) {
              const primary = usersToDrag[0]
              if (primary) {
                const occupant = merged.find((u) => u.floorId === floorId && u.deskId === deskDropId)
                const alreadyThere = occupant?.id === primary.id

                if (alreadyThere) {
                  showQueueToast(
                    `${primary.name} is already assigned to ${formatSuggestedDeskTitle(deskDropId)}.`,
                  )
                } else {
                  const displacedName =
                    occupant && occupant.id !== primary.id ? occupant.name : null
                  setDirectoryAssignmentOverrides((prev) => {
                    const next = { ...prev }
                    if (occupant && occupant.id !== primary.id) {
                      next[occupant.id] = { floorId: null, deskId: null }
                    }
                    next[primary.id] = { floorId, deskId: deskDropId }
                    return next
                  })
                  const deskLabel = formatSuggestedDeskTitle(deskDropId)
                  const floorLabel = floorLabelForId(floorId)
                  let msg = `${primary.name} assigned to ${deskLabel} on ${floorLabel}.`
                  if (displacedName) {
                    msg += ` ${displacedName} was removed from this desk.`
                  }
                  showQueueToast(msg)
                  setDirectoryDismissedDeskSuggestionByKey((p) =>
                    removeDismissedDeskSuggestionKeysForUserIds(p, [primary.id]),
                  )
                  setQueuesByFloor((prev) => {
                    let touched = false
                    const next = { ...prev }
                    for (const fid of Object.keys(next)) {
                      const list = next[fid] ?? []
                      const filtered = list.filter((id) => id !== primary.id)
                      if (filtered.length !== list.length) touched = true
                      next[fid] = filtered
                    }
                    return touched ? next : prev
                  })
                  setQueueDismissedDeskSuggestionByKey((p) => {
                    const keys = Object.keys(p).filter((k) => k.startsWith(`${primary.id}:`))
                    if (keys.length === 0) return p
                    const n = { ...p }
                    for (const k of keys) delete n[k]
                    return n
                  })
                  setSelectedUserIds((prev) => prev.filter((id) => id !== primary.id))
                }
                finishMapDropPointerReset()
              }
            }
          }
        }
        setDragChip(null)
      } else {
        onTap?.()
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const directoryDragHandle = {
    onPointerDown: handleDirectoryRowPointerDown,
  }

  const clearAllActiveFilterPills = useCallback(() => {
    setDirectoryFilters({ ...DEFAULT_DIRECTORY_FILTERS })
    setDirectoryDismissedDeskSuggestionByKey({})
  }, [])

  useEffect(() => {
    return () => {
      document.body.classList.remove('app--directory-dragging')
    }
  }, [])

  const themeVars = useMemo(() => toCssVariables(figmaTheme), [])

  const renderDirectoryQueuePanel = ({ hideTabs = false, view = leftSidebarTab } = {}) => (
    <div className="assignment-directory-queue">
      {/* People directory / queue — restored when SHOW_ASSIGNMENT_PEOPLE_SIDEBAR is true */}
      {hideTabs ? null : (
      <div className="sidebar-tabs" ref={sidebarTabsRef}>
        <Segmented
          block
          value={leftSidebarTab}
          onChange={handleLeftSidebarTabChange}
          options={segmentedOptions}
          className={[
            'sidebar-segmented',
            dragChip?.overQueue ? 'sidebar-segmented--queue-drop-active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      </div>
      )}
      <div className="sidebar-list-shell">
        {view === 'directory' ? (
          <>
            <div className="sidebar-list-header">
              <Input
                className="sidebar-search"
                placeholder="Search for a user"
                value={directorySearchQuery}
                onChange={(e) => setDirectorySearchQuery(e.target.value)}
                allowClear
                prefix={
                  <FontAwesomeIcon icon={faMagnifyingGlass} className="sidebar-search-icon" />
                }
              />
              <Popover
                trigger="click"
                placement="rightTop"
                open={directoryFilterPopoverOpen}
                onOpenChange={setDirectoryFilterPopoverOpen}
                getPopupContainer={() => document.body}
                arrow={false}
                align={{ offset: [10, 0] }}
                rootClassName="directory-more-filters-popover-root"
                title={
                  <div className="more-filters-popover-header">
                    <span className="more-filters-popover-title">More filters</span>
                    <button
                      type="button"
                      className="more-filters-popover-close"
                      aria-label="Close filters"
                      onClick={() => setDirectoryFilterPopoverOpen(false)}
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </div>
                }
                content={
                  <div className="more-filters-popover-body">
                    <div className="more-filters-field">
                      <label className="more-filters-label" htmlFor="dir-filter-assignment">
                        Assignment status
                      </label>
                      <Select
                        id="dir-filter-assignment"
                        className="more-filters-select"
                        value={directoryFilters.assignmentStatus}
                        onChange={(v) =>
                          setDirectoryFilters((prev) => ({ ...prev, assignmentStatus: v }))
                        }
                        options={DIRECTORY_ASSIGNMENT_STATUS_OPTIONS}
                      />
                    </div>
                    <div className="more-filters-field">
                      <label className="more-filters-label" htmlFor="dir-filter-date">
                        Date added
                      </label>
                      <Select
                        id="dir-filter-date"
                        className="more-filters-select"
                        value={directoryFilters.dateAdded}
                        onChange={(v) =>
                          setDirectoryFilters((prev) => ({ ...prev, dateAdded: v }))
                        }
                        options={DIRECTORY_DATE_ADDED_OPTIONS}
                      />
                    </div>
                    <div className="more-filters-field">
                      <label className="more-filters-label" htmlFor="dir-filter-dept">
                        Department
                      </label>
                      <Select
                        id="dir-filter-dept"
                        className="more-filters-select"
                        value={directoryFilters.department}
                        onChange={(v) =>
                          setDirectoryFilters((prev) => ({ ...prev, department: v }))
                        }
                        options={[
                          { value: 'any', label: 'Any' },
                          ...DIRECTORY_DEPARTMENTS.map((d) => ({ value: d, label: d })),
                        ]}
                      />
                    </div>
                    <div className="more-filters-field">
                      <label className="more-filters-label" htmlFor="dir-filter-manager">
                        Manager
                      </label>
                      <Select
                        id="dir-filter-manager"
                        className="more-filters-select"
                        showSearch
                        allowClear
                        placeholder="Any"
                        optionFilterProp="label"
                        value={directoryFilters.managerId ?? undefined}
                        onChange={(v) =>
                          setDirectoryFilters((prev) => ({
                            ...prev,
                            managerId: v ?? null,
                          }))
                        }
                        options={allUsers.map((u) => ({ value: u.id, label: u.name }))}
                      />
                    </div>
                    <button
                      type="button"
                      className="more-filters-clear"
                      onClick={() => {
                        setDirectoryFilters({ ...DEFAULT_DIRECTORY_FILTERS })
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                }
              >
                <Button
                  className={[
                    'icon-button',
                    'icon-button--filter',
                    directoryUserFiltersActive || directoryFilterPopoverOpen
                      ? 'icon-button--filter-active'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label="Open directory filters"
                  aria-expanded={directoryFilterPopoverOpen}
                >
                  <FontAwesomeIcon icon={faFilter} />
                </Button>
              </Popover>
            </div>
            {directoryUserFiltersActive ? (
              <div className="directory-active-filters">
                {directoryFilters.selectedOnly ? (
                  <div className="directory-filter-pill" role="status">
                    <span className="directory-filter-pill-label">Selected</span>
                    <button
                      type="button"
                      className="directory-filter-pill-dismiss"
                      aria-label="Remove selected filter"
                      onClick={() =>
                        setDirectoryFilters((p) => ({ ...p, selectedOnly: false }))
                      }
                    >
                      <FontAwesomeIcon icon={faXmark} className="directory-filter-pill-dismiss-icon" />
                    </button>
                  </div>
                ) : null}
                {directoryFilters.assignmentStatus !== 'any' ? (
                  <div className="directory-filter-pill" role="status">
                    <span className="directory-filter-pill-label">
                      Assignment:{' '}
                      {
                        DIRECTORY_ASSIGNMENT_STATUS_OPTIONS.find(
                          (o) => o.value === directoryFilters.assignmentStatus,
                        )?.label
                      }
                    </span>
                    <button
                      type="button"
                      className="directory-filter-pill-dismiss"
                      aria-label="Remove assignment filter"
                      onClick={() =>
                        setDirectoryFilters((p) => ({ ...p, assignmentStatus: 'any' }))
                      }
                    >
                      <FontAwesomeIcon icon={faXmark} className="directory-filter-pill-dismiss-icon" />
                    </button>
                  </div>
                ) : null}
                {directoryFilters.dateAdded !== 'any' ? (
                  <div className="directory-filter-pill" role="status">
                    <span className="directory-filter-pill-label">
                      Date added:{' '}
                      {
                        DIRECTORY_DATE_ADDED_OPTIONS.find(
                          (o) => o.value === directoryFilters.dateAdded,
                        )?.label
                      }
                    </span>
                    <button
                      type="button"
                      className="directory-filter-pill-dismiss"
                      aria-label="Remove date added filter"
                      onClick={() => setDirectoryFilters((p) => ({ ...p, dateAdded: 'any' }))}
                    >
                      <FontAwesomeIcon icon={faXmark} className="directory-filter-pill-dismiss-icon" />
                    </button>
                  </div>
                ) : null}
                {directoryFilters.department !== 'any' ? (
                  <div className="directory-filter-pill" role="status">
                    <span className="directory-filter-pill-label">
                      Department: {directoryFilters.department}
                    </span>
                    <button
                      type="button"
                      className="directory-filter-pill-dismiss"
                      aria-label="Remove department filter"
                      onClick={() => setDirectoryFilters((p) => ({ ...p, department: 'any' }))}
                    >
                      <FontAwesomeIcon icon={faXmark} className="directory-filter-pill-dismiss-icon" />
                    </button>
                  </div>
                ) : null}
                {directoryFilters.managerId ? (
                  <div className="directory-filter-pill" role="status">
                    <span className="directory-filter-pill-label">
                      Manager:{' '}
                      {allUsers.find((u) => u.id === directoryFilters.managerId)?.name ?? 'Unknown'}
                    </span>
                    <button
                      type="button"
                      className="directory-filter-pill-dismiss"
                      aria-label="Remove manager filter"
                      onClick={() => setDirectoryFilters((p) => ({ ...p, managerId: null }))}
                    >
                      <FontAwesomeIcon icon={faXmark} className="directory-filter-pill-dismiss-icon" />
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="directory-clear-all-filters"
                  onClick={clearAllActiveFilterPills}
                >
                  Clear all filters
                </button>
              </div>
            ) : null}
            {draftExperienceType === 'temporary' ? (
              <DeskRecommendationsBanner
                count={directoryDeskSuggestionCount}
                onAcceptAll={acceptAllDirectoryDeskSuggestions}
              />
            ) : null}
            <div className="sidebar-sort-row">
              <span className="sort-label">Sort by:</span>
              <button className="sort-button">First Name: A to Z ▾</button>
            </div>
            <div className="user-list-scroll" ref={directoryUserListScrollRef}>
              {directoryListBulkSelectVisible && directoryUsersFiltered.length > 0 ? (
                <div className="directory-select-all-row">
                  <Checkbox
                    className="user-checkbox directory-select-all-checkbox"
                    checked={directoryFilteredSelectAllState.allSelected}
                    indeterminate={directoryFilteredSelectAllState.indeterminate}
                    onChange={() => toggleSelectAllFilteredDirectory()}
                    aria-label={
                      directoryFilteredSelectAllState.allSelected
                        ? 'Clear selection for all users matching filters'
                        : 'Select all users matching filters'
                    }
                  />
                  <span className="directory-select-all-label">Select all</span>
                </div>
              ) : null}
              {directoryUsersFiltered.length === 0 ? (
                <div className="user-list-empty">No users in directory.</div>
              ) : (
                visibleDirectoryUsers.map((user) => {
                  const slot = directoryDeskSuggestionByUserId[user.id]
                  return (
                    <SidebarUserRow
                      key={user.id}
                      user={user}
                      currentFloorId={currentFloorId}
                      isSelected={selectedUserIds.includes(user.id)}
                      onToggle={() => toggleUserSelected(user.id, 'directory')}
                      directoryDragHandle={directoryDragHandle}
                      onOpenDeskFromUser={openDeskFromUser}
                      deskSuggestion={slot}
                      onAcceptSuggestedDesk={
                        slot
                          ? () => acceptDirectoryDeskSuggestion(user.id, slot)
                          : undefined
                      }
                      onRejectSuggestedDesk={
                        slot
                          ? () =>
                              setDirectoryDismissedDeskSuggestionByKey((p) => ({
                                ...p,
                                [`${user.id}:${currentFloorId}`]: true,
                              }))
                          : undefined
                      }
                      onOpenSuggestedDesk={
                        slot
                          ? () => {
                              setFocusedDesk({
                                floorId: slot.floorId,
                                deskId: slot.deskId,
                                occupantUserId: null,
                                suggestedAssigneeUserId: user.id,
                              })
                              setDeskPanelOpen(true)
                              setCurrentFloorId(slot.floorId)
                              showRightPanel('desk')
                            }
                          : undefined
                      }
                    />
                  )
                })
              )}
              {hasMoreDirectoryUsers ? (
                <div
                  ref={directoryUserLoadMoreRef}
                  className="user-list-load-more-sentinel"
                  aria-hidden
                />
              ) : null}
            </div>
          </>
        ) : (
          <>
            {directoryFilters.selectedOnly ? (
              <div className="directory-active-filters">
                <div className="directory-filter-pill" role="status">
                  <span className="directory-filter-pill-label">Selected</span>
                  <button
                    type="button"
                    className="directory-filter-pill-dismiss"
                    aria-label="Remove selected filter"
                    onClick={() =>
                      setDirectoryFilters((p) => ({ ...p, selectedOnly: false }))
                    }
                  >
                    <FontAwesomeIcon icon={faXmark} className="directory-filter-pill-dismiss-icon" />
                  </button>
                </div>
                <button
                  type="button"
                  className="directory-clear-all-filters"
                  onClick={clearAllActiveFilterPills}
                >
                  Clear all filters
                </button>
              </div>
            ) : null}
            <div className="sidebar-sort-row">
              <span className="sort-label">Sort by:</span>
              <button type="button" className="sort-button">
                First Name: A to Z ▾
              </button>
            </div>
            {queueDeskSuggestionCount > 0 ? (
              <DeskRecommendationsBanner
                count={queueDeskSuggestionCount}
                onAcceptAll={acceptAllQueueDeskSuggestions}
              />
            ) : null}
            <div className="user-list-scroll">
              {queuedUsersForCurrentFloor.length === 0 ? (
                <div className="user-list-empty">No one is in this floor&apos;s queue yet.</div>
              ) : (
                <>
                  <div className="directory-select-all-row">
                    <Checkbox
                      className="user-checkbox directory-select-all-checkbox"
                      checked={queueSelectAllState.allSelected}
                      indeterminate={queueSelectAllState.indeterminate}
                      onChange={() => toggleSelectAllQueuedUsers()}
                      aria-label={
                        queueSelectAllState.allSelected
                          ? 'Clear selection for everyone in this queue'
                          : 'Select everyone in this queue'
                      }
                    />
                    <span className="directory-select-all-label">Select all</span>
                  </div>
                  {queuedUsersForCurrentFloor.map((user) => {
                  const slot = queueDeskSuggestionByUserId[user.id]
                  return (
                    <SidebarUserRow
                      key={user.id}
                      user={user}
                      currentFloorId={currentFloorId}
                      isSelected={selectedUserIds.includes(user.id)}
                      onToggle={() => toggleUserSelected(user.id, 'queue')}
                      directoryDragHandle={directoryDragHandle}
                      onOpenDeskFromUser={openDeskFromUser}
                      deskSuggestion={slot}
                      onAcceptSuggestedDesk={
                        slot ? () => applyQueueDeskSuggestion(user.id, slot) : undefined
                      }
                      onRejectSuggestedDesk={
                        slot
                          ? () =>
                              setQueueDismissedDeskSuggestionByKey((p) => ({
                                ...p,
                                [`${user.id}:${currentFloorId}`]: true,
                              }))
                          : undefined
                      }
                      onOpenSuggestedDesk={
                        slot
                          ? () => {
                              setFocusedDesk({
                                floorId: slot.floorId,
                                deskId: slot.deskId,
                                occupantUserId: null,
                                suggestedAssigneeUserId: user.id,
                              })
                              setDeskPanelOpen(true)
                              setCurrentFloorId(slot.floorId)
                              showRightPanel('desk')
                            }
                          : undefined
                      }
                    />
                  )
                })}
                </>
              )}
            </div>
          </>
        )}
      </div>
      <SelectionSlideDrawer
        show={showSelectionOverlay && selectionPanel === view}
        aria-label="Selection actions"
      >
        <div className="directory-selection-header">
          <button
            type="button"
            className="directory-selection-count directory-selection-count--link"
            aria-live="polite"
            onClick={filterToSelectedUsers}
          >
            {selectedUsers.length} user{selectedUsers.length === 1 ? '' : 's'} selected
          </button>
          <button
            type="button"
            className="directory-selection-close"
            aria-label="Deselect users"
            onClick={clearSelection}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <Popover
          trigger="click"
          placement="top"
          open={addQueuePopoverOpen}
          onOpenChange={setAddQueuePopoverOpen}
          getPopupContainer={() => document.body}
          rootClassName="queue-add-popover-root"
          arrow={false}
          content={
            <div className="queue-floor-menu" role="menu" aria-label="Choose floor queue">
              {FLOOR_OPTIONS_DESC.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="menuitem"
                  className="queue-floor-menu-item"
                  onClick={() => addSelectedUsersToFloorQueue(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
        >
          <Button
            block
            className="selected-secondary-button selected-secondary-button--menu"
            aria-expanded={addQueuePopoverOpen}
            aria-haspopup="menu"
          >
            <span className="selected-secondary-button-label">Add to queue</span>
            <FontAwesomeIcon
              icon={addQueuePopoverOpen ? faChevronDown : faChevronUp}
              className="selected-secondary-button-icon"
              aria-hidden
            />
          </Button>
        </Popover>
        <Button block className="selected-secondary-button" onClick={unassignSelectedUsers}>
          Unassign
        </Button>
        {view === 'directory' ? (
          <Button block className="selected-secondary-button" onClick={selectUsersInRobinAgent}>
            Select in Robin Agent
          </Button>
        ) : null}
        {view === 'queue' ? (
          <Button
            block
            className="selected-secondary-button"
            onClick={removeSelectedUsersFromQueue}
          >
            Remove from queue
          </Button>
        ) : null}
        <Button
          type="text"
          block
          className="selected-cancel-button"
          onClick={clearSelection}
        >
          Deselect
        </Button>
      </SelectionSlideDrawer>
    </div>
  )

  return (
    <ConfigProvider theme={antdTheme}>
      <div className="app-shell" style={themeVars}>
        {appView === 'directory' ? (
          <DraftDirectory
            mode={planningMode}
            onOpenDraft={() => {
              if (planningMode === 'stack-planning') stackPlanRef.current?.openExisting()
              openDraft()
            }}
            onOpenNewDraft={() => {
              if (planningMode === 'stack-planning') stackPlanRef.current?.openNew()
              openDraft()
            }}
            onNavigate={showDirectory}
          />
        ) : null}
        <div className="draft-takeover" hidden={appView !== 'draft'}>
        {queueToast && (
          <div className="queue-toast-host" aria-live="polite">
            <div
              key={queueToast.id}
              className="queue-toast-banner"
              onAnimationEnd={handleQueueToastAnimationEnd}
            >
              <FontAwesomeIcon icon={faCircleCheck} className="queue-toast-check" aria-hidden />
              <span className="queue-toast-message">{queueToast.text}</span>
              {queueToast.viewFloorId ? (
                <button
                  type="button"
                  className="queue-toast-view"
                  onClick={() => openQueueFromToast(queueToast.viewFloorId)}
                >
                  View
                </button>
              ) : null}
            </div>
          </div>
        )}
        {dragChip && (
          <div
            className="user-directory-drag-chip"
            style={{ left: dragChip.clientX, top: dragChip.clientY }}
            aria-hidden
          >
            <DirectoryDragChipContent users={dragChip.users} currentFloorId={currentFloorId} />
          </div>
        )}
        <Modal
          className="convert-scenario-modal"
          title="Create a new scenario plan based on this stack plan."
          open={convertOpen}
          onCancel={() => setConvertOpen(false)}
          footer={[
            <Button key="create" type="primary" disabled={!convertReady} onClick={confirmConvert}>
              Create
            </Button>,
            <Button key="cancel" onClick={() => setConvertOpen(false)}>
              Cancel
            </Button>,
          ]}
        >
          {convertReady ? null : (
            <p className="convert-scenario-note">Start a stack plan before converting it.</p>
          )}
          <Radio.Group
            className="convert-scenario-options"
            value={convertMode}
            onChange={(event) => setConvertMode(event.target.value)}
          >
            <Radio value="both">Auto-create neighborhoods and auto-assign desks</Radio>
            <Radio value="neighborhoods">Auto-create neighborhoods only</Radio>
            <Radio value="assign">Auto-assign desks only</Radio>
          </Radio.Group>
        </Modal>
        <header className="app-header">
          <div className="app-header-left">
            <div className="app-title">{isStackPlanView ? 'New stack plan draft' : 'New Draft 1234'}</div>
          </div>
          <div className="app-header-right">
            <Button className="header-button" onClick={() => setAppView('directory')}>
              Close
            </Button>
            <Button className="header-button">Share</Button>
            <Button
              type={isStackPlanView ? 'default' : 'primary'}
              className={['header-button', isStackPlanView ? '' : 'header-button-accent'].filter(Boolean).join(' ')}
              onClick={isStackPlanView ? openConvertModal : undefined}
            >
              {isStackPlanView ? 'Convert to scenario plan' : 'Publish'}
            </Button>
          </div>
        </header>

        {isStackPlanView ? (
          <div className="stack-plan-shell">
            <StackPlanView
              ref={stackPlanRef}
              users={usersWithDirectoryOverrides}
              agentOpen={activeRightPanel === 'agent' && Boolean(agentBrief)}
              onDecision={handleStackDecision}
            onReset={handleStackReset}
            onPrepare={handleStackReset}
            onAgentTabChange={handleStackAgentTab}
          />
            <AgentSidebar
              open={activeRightPanel === 'agent'}
              onOpen={openAgentSidebar}
              onClose={closeRightPanel}
              onExited={() => finishRightPanelExit('agent')}
              selectedUsers={agentContextUsers}
              brief={agentBrief}
              onSuggestion={handleAgentSuggestion}
              showTab={stackAgentTab}
            />
          </div>
        ) : (
        <div className="app-workspace">
        {isAssignmentsView ? (
          <div className="assignment-subheader">
            <div className="assignment-subheader-left">
              <span className="assignment-subheader-label" id="assignment-view-by-label">
                View by:
              </span>
              <Segmented
                className="assignment-view-segmented"
                aria-labelledby="assignment-view-by-label"
                value={assignmentMapView}
                onChange={(value) => {
                  setAssignmentMapView(value)
                  if (
                    activeRightPanelRef.current === 'allocation' ||
                    exitingRightPanelRef.current === 'allocation'
                  ) {
                    closeRightPanel()
                  } else {
                    setFocusedAllocationKey(null)
                  }
                }}
                options={ASSIGNMENT_MAP_VIEWS}
              />
              <div className="assignment-subheader-controls" role="group" aria-label="Map display">
                <Checkbox
                  checked={showAssignmentAvatars}
                  onChange={(e) => setShowAssignmentAvatars(e.target.checked)}
                >
                  Avatars
                </Checkbox>
                <Checkbox
                  checked={showNeighborhoodLabels}
                  onChange={(e) => setShowNeighborhoodLabels(e.target.checked)}
                >
                  Neighborhood labels
                </Checkbox>
              </div>
            </div>
            <div className="assignment-subheader-actions">
              <Button
                className="assignment-subheader-action"
                onClick={openSearchUsers}
              >
                Search users
              </Button>
              <Button className="assignment-subheader-action">Create neighborhood</Button>
            </div>
          </div>
        ) : null}
        <div className="app-workspace-body">
        <div className="app-workspace-main">
        <div
          className={[
            'app-main',
            hideAssignmentPeopleSidebar || hideAssignmentRightOverview
              ? 'app-main--assignments-map'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {!hideAssignmentPeopleSidebar ? (
          <aside className="sidebar sidebar-left">
            <div className="sidebar-left-inner">
              <div
                ref={floorPickerRef}
                className={[
                  'floor-picker',
                  dragChip?.overFloorPicker ? 'floor-picker--drag-reveal' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <button
                  type="button"
                  className="floor-picker-bar"
                  aria-expanded={floorPickerOpen}
                  aria-controls="floor-picker-drawer"
                  id="floor-picker-toggle"
                  onClick={() => setFloorPickerExpanded((open) => !open)}
                >
                  <span className="floor-picker-bar-label">
                    {floorPickerOpen ? 'Floors' : currentFloorLabel}
                  </span>
                  <FontAwesomeIcon
                    icon={floorPickerOpen ? faChevronUp : faChevronDown}
                    className="floor-picker-chevron"
                    aria-hidden
                  />
                </button>
                <div
                  id="floor-picker-drawer"
                  className={`floor-picker-drawer ${
                    floorPickerOpen ? 'floor-picker-drawer--open' : ''
                  }`}
                  aria-hidden={!floorPickerOpen}
                  inert={!floorPickerOpen}
                >
                  <ul className="floor-picker-list" role="listbox" aria-labelledby="floor-picker-toggle">
                    {FLOOR_OPTIONS.map((f) => (
                      <li key={f.id} role="none">
                        <button
                          type="button"
                          role="option"
                          aria-selected={f.id === currentFloorId}
                          data-floor-queue-drop={f.id}
                          className={[
                            'floor-picker-option',
                            f.id === currentFloorId ? 'floor-picker-option-active' : '',
                            dragChip?.floorDropHoverId === f.id
                              ? 'floor-picker-option--queue-drop-hover'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            if (skipFloorPickerSelectRef.current) {
                              skipFloorPickerSelectRef.current = false
                              return
                            }
                            selectFloor(f.id)
                            setFloorPickerExpanded(true)
                          }}
                        >
                          <span className="floor-picker-option-label">{f.label}</span>
                          {dragChip?.floorDropHoverId === f.id ? (
                            <span className="floor-picker-option-queue-hint">Add to queue</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {isNeighborhoodsView ? (
                <>
                  <div className="neighborhood-list-scroll">
                    {neighborhoodsForFloor.map((nb) => (
                      <button
                        key={nb.id}
                        type="button"
                        className={[
                          'neighborhood-list-row',
                          selectedNeighborhoodId === nb.id ? 'neighborhood-list-row--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => {
                          if (selectedNeighborhoodId === nb.id) {
                            closeRightPanel()
                            return
                          }
                          setSelectedNeighborhoodId(nb.id)
                          showRightPanel('neighborhood')
                        }}
                      >
                        <span
                          className="neighborhood-list-swatch"
                          style={{ backgroundColor: neighborhoodColor(nb.colorIndex) }}
                          aria-hidden
                        />
                        <span className="neighborhood-list-name">{nb.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="neighborhood-list-footer">
                    <Button block className="neighborhood-new-button">
                      + New neighborhood
                    </Button>
                  </div>
                </>
              ) : (
                <>
              {renderDirectoryQueuePanel()}
                </>
              )}
            </div>
          </aside>
          ) : null}

          {hideAssignmentPeopleSidebar ? (
            <div className="assignment-left-stack">
              <div ref={floorPickerRef} className="assignment-floor-card-slot">
                <AssignmentSidePanel
                  users={usersWithDirectoryOverrides}
                  view={assignmentMapView}
                  currentFloorId={currentFloorId}
                  currentFloorLabel={currentFloorLabel}
                  activeSection={assignmentSidebarSection}
                  onSectionChange={setAssignmentSidebarSection}
                  onSelectFloor={(floorId) => {
                    selectFloor(floorId)
                  }}
                  focusedAllocationKey={focusedAllocationKey}
                  onFocusAllocationKey={focusAllocationKey}
                  showBreakdown={false}
                />
              </div>
              <div className="assignment-tool-stack">
                <section
                  className={[
                    'assignment-tool-card',
                    assignmentToolSection === 'overview' ? 'assignment-tool-card--open' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <button
                    type="button"
                    className="assignment-tool-card-header"
                    aria-expanded={assignmentToolSection === 'overview'}
                    onClick={() => {
                      if (skipNextToolToggleRef.current) return
                      setAssignmentToolSection((prev) => (prev === 'overview' ? null : 'overview'))
                    }}
                  >
                    <span>Overview</span>
                    <FontAwesomeIcon
                      icon={assignmentToolSection === 'overview' ? faChevronDown : faChevronRight}
                      className="assignment-floor-chevron"
                      aria-hidden
                    />
                  </button>
                  {assignmentToolSection === 'overview' ? (
                    <div className="assignment-tool-card-body">
                      <AssignmentOverviewBody
                        users={usersWithDirectoryOverrides}
                        view={assignmentMapView}
                        floorId={currentFloorId}
                        focusedAllocationKey={focusedAllocationKey}
                        onFocusAllocationKey={focusAllocationKey}
                      />
                    </div>
                  ) : null}
                </section>
                <section
                  className={[
                    'assignment-tool-card',
                    assignmentToolSection === 'queue' ? 'assignment-tool-card--open' : '',
                    dragChip?.overQueue ? 'assignment-tool-card--queue-drop' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-assignment-queue-drop=""
                >
                  <button
                    type="button"
                    className="assignment-tool-card-header"
                    aria-expanded={assignmentToolSection === 'queue'}
                    onClick={() => {
                      if (skipNextToolToggleRef.current) return
                      setLeftSidebarTab('queue')
                      setAssignmentToolSection((prev) => (prev === 'queue' ? null : 'queue'))
                    }}
                  >
                    <span>
                      {queueCountForCurrentFloor > 0
                        ? `Queue (${queueCountForCurrentFloor})`
                        : 'Queue'}
                    </span>
                    <FontAwesomeIcon
                      icon={assignmentToolSection === 'queue' ? faChevronDown : faChevronRight}
                      className="assignment-floor-chevron"
                      aria-hidden
                    />
                  </button>
                  {assignmentToolSection === 'queue' ? (
                    <div className="assignment-tool-card-body assignment-tool-card-body--fill">
                      {renderDirectoryQueuePanel({ hideTabs: true, view: 'queue' })}
                    </div>
                  ) : null}
                </section>
              </div>
            </div>
          ) : null}

          <main className="floor-main">
            <div className="floor-canvas-shell">
              <div className="floor-canvas">
                <div className="desk-layout" ref={deskLayoutRef}>
                  {deskLayout.map(({ deskId, x, y }) => {
                    const assigned = assignedByDesk.get(deskId)
                    const isSelectedAssignedUser =
                      assigned && selectedUserIds.includes(assigned.id)
                    const avatarSide = deskAvatarSideById[deskId] ?? 'left'
                    const isDeskMapFocused =
                      focusedDesk?.floorId === currentFloorId && focusedDesk?.deskId === deskId
                    const isDeskDropHover = Boolean(dragChip?.mapDeskHoverIds?.includes(deskId))
                    const isAssignmentPulseDesk =
                      assignmentPulseDesk?.floorId === currentFloorId &&
                      assignmentPulseDesk?.deskId === deskId
                    const deskNeighborhoodId = getDeskNeighborhoodId(currentFloorId, deskId)
                    const neighborhoodFillColor = getDeskNeighborhoodColor(currentFloorId, deskId)
                    const isNeighborhoodDimmed =
                      isNeighborhoodsView &&
                      selectedNeighborhoodId &&
                      deskNeighborhoodId !== selectedNeighborhoodId
                    const assignmentDesk = isAssignmentsView
                      ? assignmentDeskMeta(
                          assignmentMapModel,
                          currentFloorId,
                          deskId,
                          assignmentMapView,
                          assigned,
                        )
                      : null
                    const isAllocationMapView =
                      isNeighborhoodsView ||
                      (isAssignmentsView && assignmentMapView !== 'default')
                    const categoryKey = isNeighborhoodsView
                      ? deskNeighborhoodId
                      : isAllocationMapView
                        ? assignmentDesk?.key
                        : null
                    const hasCategoryAssociation =
                      Boolean(categoryKey) && categoryKey !== '__unassigned__'
                    const categoryColor = hasCategoryAssociation
                      ? isNeighborhoodsView
                        ? neighborhoodFillColor
                        : assignmentDesk?.color
                      : null
                    const isVacantDesk = !assigned
                    /** Desks with no nb/dept/manager match Default: solid gray / bordered gray +. */
                    const DEFAULT_DESK_ACCENT = '#868686'
                    const vacantAccent = hasCategoryAssociation
                      ? categoryColor || DEFAULT_DESK_ACCENT
                      : DEFAULT_DESK_ACCENT
                    const showDeskAvatars =
                      !isNeighborhoodsView && (!isAssignmentsView || showAssignmentAvatars)
                    const isOverviewFocusDimmed =
                      isAssignmentsView &&
                      focusedAllocationKey &&
                      assignmentDesk?.key !== focusedAllocationKey

                    return (
                      <div
                        key={deskId}
                        data-map-desk={deskId}
                        className={[
                          'desk-tile',
                          isVacantDesk
                            ? 'desk-tile-open'
                            : hasCategoryAssociation
                              ? 'desk-tile-neighborhood'
                              : 'desk-tile-assigned',
                          isSelectedAssignedUser ? 'desk-tile--user-selected' : '',
                          isDeskMapFocused ? 'desk-tile--map-focus' : '',
                          !isNeighborhoodsView && isDeskDropHover ? 'desk-tile--desk-drop-hover' : '',
                          !isNeighborhoodsView && isAssignmentPulseDesk
                            ? 'desk-tile--assignment-pulse'
                            : '',
                          isNeighborhoodDimmed || isOverviewFocusDimmed
                            ? 'desk-tile-neighborhood--dimmed'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{
                          left: `${x}px`,
                          top: `${y}px`,
                          ...(isVacantDesk
                            ? assignmentMapView === 'neighborhood'
                              ? {
                                  '--desk-open-accent': vacantAccent,
                                  '--desk-open-bg': lightenHexColor(vacantAccent, 0.22),
                                  '--desk-open-plus': '#ffffff',
                                }
                              : {
                                  '--desk-open-accent': vacantAccent,
                                  '--desk-open-bg': lightenHexColor(vacantAccent, 0.9),
                                  '--desk-open-plus': darkenHexColor(vacantAccent, 0.72),
                                }
                            : hasCategoryAssociation && categoryColor
                              ? { backgroundColor: categoryColor }
                              : {}),
                        }}
                        title={
                          isAllocationMapView
                            ? assignmentDesk?.label ?? undefined
                            : isVacantDesk
                              ? 'Assign desk'
                              : 'Open desk details'
                        }
                        onPointerDown={(event) => {
                          if (isNeighborhoodsView || !assigned) return
                          if (event.pointerType === 'mouse' && event.button !== 0) return
                          event.stopPropagation()
                          handleDirectoryRowPointerDown(event, assigned, {
                            suppressFollowingClick: true,
                            onTap: () => {
                              openDeskFromMap(deskId, assigned)
                            },
                          })
                        }}
                        onClick={() => {
                          if (skipNextDeskClickRef.current) {
                            skipNextDeskClickRef.current = false
                            return
                          }
                          if (!isNeighborhoodsView) openDeskFromMap(deskId, assigned)
                        }}
                      >
                        {isVacantDesk ? (
                          <span className="desk-tile-open-plus" aria-hidden>
                            +
                          </span>
                        ) : null}
                        {showDeskAvatars && assigned && (
                          <div
                            className={`desk-avatar-map desk-avatar-map--${avatarSide}${
                              isSelectedAssignedUser ? ' desk-avatar-map--selected' : ''
                            }`}
                            style={avatarFillStyle(assigned.avatarColor)}
                            aria-hidden
                          >
                            <span className="desk-avatar-map-initial">
                              {assigned.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {isNeighborhoodsView
                    ? neighborhoodLabelAnchors.map((label) => {
                        const isLabelDimmed =
                          selectedNeighborhoodId &&
                          selectedNeighborhoodId !== label.neighborhoodId
                        return (
                          <button
                            key={label.neighborhoodId}
                            type="button"
                            className={[
                              'neighborhood-map-label',
                              isLabelDimmed ? 'neighborhood-map-label--dimmed' : '',
                              selectedNeighborhoodId === label.neighborhoodId
                                ? 'neighborhood-map-label--active'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            style={{
                              left: `${label.x}px`,
                              top: `${label.y}px`,
                              color: label.labelColor,
                              borderColor: label.labelColor,
                            }}
                            aria-pressed={selectedNeighborhoodId === label.neighborhoodId}
                            onClick={() => {
                              if (selectedNeighborhoodId === label.neighborhoodId) {
                                closeRightPanel()
                                return
                              }
                              setSelectedNeighborhoodId(label.neighborhoodId)
                              showRightPanel('neighborhood')
                            }}
                          >
                            {label.name}
                          </button>
                        )
                      })
                    : null}
                  {isAssignmentsView && showNeighborhoodLabels
                    ? assignmentLabelAnchors.map((label) => {
                        const isLabelDimmed =
                          focusedAllocationKey &&
                          assignmentMapView === 'neighborhood' &&
                          focusedAllocationKey !== label.id
                        const isLabelActive =
                          assignmentMapView === 'neighborhood' && focusedAllocationKey === label.id
                        return (
                          <button
                            key={label.id}
                            type="button"
                            className={[
                              'neighborhood-map-label',
                              isLabelDimmed ? 'neighborhood-map-label--dimmed' : '',
                              isLabelActive ? 'neighborhood-map-label--active' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            style={{
                              left: `${label.x}px`,
                              top: `${label.y}px`,
                              color: label.labelColor,
                              borderColor: label.labelColor,
                            }}
                            aria-pressed={isLabelActive}
                            onClick={() => selectNeighborhoodFromMap(label.id)}
                          >
                            {label.name}
                          </button>
                        )
                      })
                    : null}
                </div>
              </div>
              <div className="zoom-controls">
                <Button className="zoom-button">+</Button>
                <Button className="zoom-button">−</Button>
              </div>
            </div>
          </main>

          {!hideAssignmentRightOverview ? (
          <aside className="sidebar sidebar-right">
            {isNeighborhoodsView ? (
              <div className="sidebar-right-overview sidebar-right-overview--neighborhoods">
                <div className="overview-header">Overview</div>
                <div className="neighborhood-overview-chart">
                  <NeighborhoodPieChart gradient={neighborhoodPieGradient} />
                </div>
                <div className="overview-body">
                  {neighborhoodOverviewStats.rows.map((row) => (
                    <div key={row.id} className="overview-row">
                      <span
                        className="overview-color"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="overview-label">{row.name}</span>
                      <span className="overview-count">{row.count}</span>
                    </div>
                  ))}
                  <div className="overview-row">
                    <span
                      className="overview-color"
                      style={{ backgroundColor: NEIGHBORHOOD_UNASSIGNED_COLOR }}
                    />
                    <span className="overview-label">No neighborhood</span>
                    <span className="overview-count">{neighborhoodOverviewStats.unassigned}</span>
                  </div>
                </div>
                <div className="overview-footer">
                  <span className="overview-label">Total</span>
                  <span className="overview-count">{neighborhoodOverviewStats.total}</span>
                </div>
              </div>
            ) : (
            <div className="sidebar-right-overview">
              <div className="overview-header">Overview</div>
              <div className="overview-body">
                <div className="overview-row">
                  <span className="overview-color overview-color-unassigned" />
                  <span className="overview-label">Not assigned to a user</span>
                  <span className="overview-count">{overviewStats.notAssigned}</span>
                </div>
                <div className="overview-row">
                  <span className="overview-color overview-color-assigned" />
                  <span className="overview-label">Assigned to a user</span>
                  <span className="overview-count">{overviewStats.assigned}</span>
                </div>
                <div className="overview-row">
                  <span className="overview-color overview-color-hotel" />
                  <span className="overview-label">Hot/Hotel desk</span>
                  <span className="overview-count">{overviewStats.hotel}</span>
                </div>
                <div className="overview-row">
                  <span className="overview-color overview-color-disabled" />
                  <span className="overview-label">Disabled desk</span>
                  <span className="overview-count">{overviewStats.disabled}</span>
                </div>
              </div>
              <div className="overview-footer">
                <span className="overview-label">Total</span>
                <span className="overview-count">{overviewStats.total}</span>
              </div>
            </div>
            )}
          </aside>
          ) : null}
        </div>
        </div>

        <AgentSidebar
          open={activeRightPanel === 'agent'}
          onOpen={openAgentSidebar}
          onClose={closeRightPanel}
          onExited={() => finishRightPanelExit('agent')}
          selectedUsers={agentContextUsers}
          brief={agentBrief}
          onSuggestion={handleAgentSuggestion}
          showTab={!agentFooterSidebarOpen}
        />

        <div className="app-right-overlay-layer">
          <div className="app-right-overlay-host app-right-overlay-host--detail">
            <RightSlideOverlay
              show={activeRightPanel === 'allocation' && Boolean(allocationDetail)}
              onExited={() => finishRightPanelExit('allocation')}
              className="sidebar-right-slide--allocation"
            >
              {allocationDetail ? (
                <AllocationDetailSidebar
                  detail={allocationDetail}
                  onClose={closeRightPanel}
                  onExpandAgent={expandAgentFromMini}
                  onOpenDesk={(deskId, user) => {
                    openDeskFromMap(deskId, user)
                  }}
                  onAssignDesk={(deskId) => {
                    openDeskFromMap(deskId, null)
                  }}
                />
              ) : null}
            </RightSlideOverlay>
            <RightSlideOverlay
              show={
                activeRightPanel === 'neighborhood' &&
                Boolean(selectedNeighborhoodId && neighborhoodSelectionDetail)
              }
              onExited={() => finishRightPanelExit('neighborhood')}
              className="sidebar-right-slide--allocation"
            >
              {neighborhoodSelectionDetail ? (
                <AllocationDetailSidebar
                  detail={neighborhoodSelectionDetail}
                  onClose={closeRightPanel}
                  onExpandAgent={expandAgentFromMini}
                  onOpenDesk={(deskId, user) => {
                    openDeskFromMap(deskId, user)
                  }}
                  onAssignDesk={(deskId) => {
                    openDeskFromMap(deskId, null)
                  }}
                />
              ) : null}
            </RightSlideOverlay>
            <RightSlideOverlay
              show={activeRightPanel === 'desk' && showDeskOverlay}
              onExited={() => finishRightPanelExit('desk')}
              className="sidebar-right-slide--desk"
            >
              {focusedDesk ? (
                <DeskDetailsSidebar
                  key={`${focusedDesk.floorId}-${focusedDesk.deskId}`}
                  floorId={focusedDesk.floorId}
                  deskId={focusedDesk.deskId}
                  occupantUserId={focusedDesk.occupantUserId ?? null}
                  suggestedAssigneeUserId={focusedDesk.suggestedAssigneeUserId}
                  onClose={closeRightPanel}
                  onExpandAgent={expandAgentFromMini}
                  onClearAssignments={() => {
                    if (focusedDesk.occupantUserId) {
                      unassignUserIds([focusedDesk.occupantUserId], {
                        deskLabel: formatSelectedDeskLabel({
                          deskId: focusedDesk.deskId,
                          floorId: focusedDesk.floorId,
                        }),
                      })
                    }
                  }}
                  allUsers={usersWithDirectoryOverrides}
                />
              ) : null}
            </RightSlideOverlay>
          </div>
          <div className="app-right-overlay-host app-right-overlay-host--assign">
            <RightSlideOverlay
              show={activeRightPanel === 'search'}
              onExited={() => finishRightPanelExit('search')}
              className="sidebar-right-slide--assign-users"
            >
              <div className="assignment-users-drawer">
                <div className="assignment-users-drawer-main">
                  <div className="assignment-users-drawer-header">
                    <span className="assignment-users-drawer-title">Search users</span>
                    <button
                      type="button"
                      className="assignment-users-drawer-close"
                      aria-label="Close search users"
                      onClick={closeSearchUsers}
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </div>
                  {renderDirectoryQueuePanel({ hideTabs: true, view: 'directory' })}
                </div>
              </div>
            </RightSlideOverlay>
          </div>
        </div>
        </div>
        </div>
        )}
        </div>
      </div>
    </ConfigProvider>
  )
}

export default App

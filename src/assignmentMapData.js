import { deskLayoutByFloor } from './mockData.js'
import {
  buildStackPlanModel,
  departmentColor,
  deskCategoryByIdForFloor,
  summarizeStackPlan,
} from './stackPlanData.js'
import {
  computeNeighborhoodLabelAnchors,
  NEIGHBORHOOD_UNASSIGNED_COLOR,
} from './neighborhoodData.js'

export const ASSIGNMENT_MAP_VIEWS = [
  { value: 'default', label: 'Default' },
  { value: 'neighborhood', label: 'Neighborhoods' },
  { value: 'department', label: 'Department' },
  { value: 'manager', label: 'Manager' },
]

/** Default view: occupied (dark) vs unoccupied (light). Hotel/disabled are ignored. */
const OCCUPIED_COLOR = '#868686'
const UNOCCUPIED_COLOR = '#d6d6d6'

function defaultFloorSummary(floorId, assignedCount) {
  const layout = deskLayoutByFloor[floorId] ?? []
  const total = layout.length
  const notAssigned = Math.max(0, total - assignedCount)
  const rows = [
    { key: 'assigned', label: 'Assigned to a user', color: OCCUPIED_COLOR, count: assignedCount },
    {
      key: 'available',
      label: 'Not assigned to a user',
      color: UNOCCUPIED_COLOR,
      count: notAssigned,
    },
  ]
  return {
    rows,
    unassigned: 0,
    unassignedLabel: 'Not assigned to a user',
    unassignedColor: UNOCCUPIED_COLOR,
    hideUnassignedRow: true,
    total,
  }
}

function assignedCountOnFloor(users, floorId) {
  let n = 0
  for (const user of users) {
    if (user.floorId === floorId && user.deskId) n += 1
  }
  return n
}

function desksFromSummary(summary) {
  const desks = []
  let i = 0
  for (const row of summary.rows) {
    for (let n = 0; n < row.count; n++) {
      desks.push({
        deskId: `${row.key}-${i++}`,
        categoryKey: row.key,
        color: row.color,
        label: row.label,
      })
    }
  }
  if (!summary.hideUnassignedRow) {
    const openColor = null
    for (let n = 0; n < summary.unassigned; n++) {
      desks.push({
        deskId: `open-${i++}`,
        categoryKey: '__unassigned__',
        color: openColor,
        label: summary.unassignedLabel,
      })
    }
  }
  return desks
}

function withDesks(summary, desks) {
  return { ...summary, desks: desks ?? desksFromSummary(summary) }
}

/** Per-floor allocation summary for the floating sidebar. */
export function buildAssignmentFloorSummary(users, floorId, view) {
  return buildAssignmentFloorSummaries(users, view)[floorId]
}

/** Summaries for every floor (floor picker expanded). */
export function buildAssignmentFloorSummaries(users, view) {
  const floorIds = Object.keys(deskLayoutByFloor)
  if (view === 'default') {
    return Object.fromEntries(
      floorIds.map((floorId) => {
        const summary = defaultFloorSummary(floorId, assignedCountOnFloor(users, floorId))
        return [floorId, withDesks(summary)]
      }),
    )
  }

  const dimension = view === 'neighborhood' ? 'neighborhood' : view
  const model = buildStackPlanModel(users, dimension)
  return Object.fromEntries(
    floorIds.map((floorId) => {
      const summary = {
        ...summarizeStackPlan(model, floorId),
        unassignedLabel: view === 'neighborhood' ? 'No neighborhood' : 'Unassigned',
        unassignedColor: NEIGHBORHOOD_UNASSIGNED_COLOR,
      }
      const floor = model.floors.find((entry) => entry.id === floorId)
      return [floorId, withDesks(summary, floor?.desks)]
    }),
  )
}

/** Shared model for map coloring / labels when view is not default. */
export function buildAssignmentMapModel(users, view) {
  if (view === 'default') return null
  const dimension = view === 'neighborhood' ? 'neighborhood' : view
  return buildStackPlanModel(users, dimension)
}

/** Dark initials on light fills (HR yellow); white initials otherwise. */
export function avatarInkColor(color) {
  const rgb = rgbFromCssColor(color)
  if (!rgb) return '#ffffff'
  const lin = (channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
  return luminance > 0.55 ? '#1f1f1f' : '#ffffff'
}

export function avatarFillStyle(color) {
  return { backgroundColor: color, color: avatarInkColor(color) }
}

function rgbFromCssColor(color) {
  if (typeof color !== 'string') return null
  const hex = color.trim()
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]
  }
  const hsl = hex.match(/^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\)$/i)
  if (!hsl) return null
  const h = Number(hsl[1]) / 360
  const s = Number(hsl[2]) / 100
  const l = Number(hsl[3]) / 100
  const hue = (p, q, t) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)].map((v) =>
    Math.round(v * 255),
  )
}

/**
 * Avatar fill for the active View by mode.
 * Seated users take the same color as their desk. Unseated users take the
 * color that mode would paint a desk of their department, manager, or
 * (for neighborhoods) the no-neighborhood gray.
 */
export function viewAvatarColorByUserId(users, view) {
  const colors = new Map()
  if (view === 'default') {
    for (const user of users) colors.set(user.id, OCCUPIED_COLOR)
    return colors
  }

  const model = buildStackPlanModel(users, view)
  for (const user of users) {
    if (user.floorId && user.deskId) {
      const category = deskCategoryByIdForFloor(model, user.floorId).get(user.deskId)
      if (category?.color) {
        colors.set(user.id, category.color)
        continue
      }
    }

    if (view === 'department') {
      colors.set(user.id, departmentColor(user.department))
      continue
    }

    if (view === 'manager') {
      const bucketId = user.managerId ?? user.id
      colors.set(
        user.id,
        model.categories.get(`mgr:${bucketId}`)?.color ?? NEIGHBORHOOD_UNASSIGNED_COLOR,
      )
      continue
    }

    colors.set(user.id, NEIGHBORHOOD_UNASSIGNED_COLOR)
  }
  return colors
}

export function assignmentDeskMeta(model, floorId, deskId, view, assignedUser) {
  if (view === 'default') {
    return assignedUser
      ? {
          key: 'assigned',
          color: OCCUPIED_COLOR,
          label: 'Assigned to a user',
          fillMode: 'default-assigned',
        }
      : {
          key: 'available',
          color: UNOCCUPIED_COLOR,
          label: 'Not assigned to a user',
          fillMode: 'default-available',
        }
  }

  if (!model) {
    return {
      key: '__unassigned__',
      color: NEIGHBORHOOD_UNASSIGNED_COLOR,
      label: view === 'neighborhood' ? 'No neighborhood' : 'Unassigned',
      fillMode: 'allocation',
    }
  }

  const category = deskCategoryByIdForFloor(model, floorId).get(deskId)
  if (category?.color) {
    return {
      key: category.key,
      color: category.color,
      label: category.label,
      fillMode: 'allocation',
    }
  }
  return {
    key: '__unassigned__',
    color: NEIGHBORHOOD_UNASSIGNED_COLOR,
    label: view === 'neighborhood' ? 'No neighborhood' : 'Unassigned',
    fillMode: 'allocation',
  }
}

/** Neighborhood labels — independent of the active View by dimension. */
export function buildAssignmentLabelAnchors(floorId, deskLayout) {
  return computeNeighborhoodLabelAnchors(floorId, deskLayout).map((label) => ({
    id: label.neighborhoodId,
    name: label.name,
    x: label.x,
    y: label.y,
    color: label.color,
    labelColor: label.labelColor,
  }))
}

export function allocationBarSegments(summary) {
  const segments = summary.rows
    .filter((row) => row.count > 0)
    .map((row) => ({ key: row.key, color: row.color, count: row.count, label: row.label }))
  if (summary.unassigned > 0) {
    segments.push({
      key: '__unassigned__',
      color: summary.unassignedColor ?? NEIGHBORHOOD_UNASSIGNED_COLOR,
      count: summary.unassigned,
      label: summary.unassignedLabel,
    })
  }
  return segments
}

function formatDeskListLabel(deskId) {
  return `Desk ${deskId}`
}

function deskItemsForKeys(layout, assigneeByDesk, floorId, includeDesk) {
  return layout.filter(({ deskId }) => includeDesk(deskId)).map(({ deskId }) => {
    const user = assigneeByDesk.get(deskId) ?? null
    return {
      id: deskId,
      kind: 'desk',
      deskId,
      floorId,
      deskLabel: formatDeskListLabel(deskId),
      user,
    }
  })
}

const FLOOR_SWATCH_OTHER = '#e4e4e4'

function desksDetail({ key, badge, title, color, desks, floorTotal }) {
  const assignedCount = desks.filter((d) => d.user).length
  const selectedCount = desks.length
  const total = floorTotal ?? selectedCount
  const otherCount = Math.max(0, total - selectedCount)
  const floorSwatches = [
    ...Array.from({ length: selectedCount }, (_, i) => ({
      deskId: `sel-${i}`,
      color: color || FLOOR_SWATCH_OTHER,
    })),
    ...Array.from({ length: otherCount }, (_, i) => ({
      deskId: `other-${i}`,
      color: FLOOR_SWATCH_OTHER,
    })),
  ]
  return {
    key,
    mode: 'desks',
    badge,
    title,
    color,
    summary: `${selectedCount} out of ${total} desks on this floor`,
    items: desks,
    assignedCount,
    selectedCount,
    totalCount: selectedCount,
    floorTotal: total,
    floorSwatches,
  }
}

/**
 * Detail model for the right-hand allocation overview sidebar.
 * Always desk-centric (desk primary, assignee or + Assign secondary),
 * scoped to the current floor so counts match the floating legend.
 */
export function buildAllocationDetail(users, floorId, view, focusedKey) {
  if (!focusedKey || !floorId) return null

  const layout = deskLayoutByFloor[floorId] ?? []
  const assigneeByDesk = new Map()
  for (const user of users) {
    if (user.floorId === floorId && user.deskId) {
      assigneeByDesk.set(user.deskId, user)
    }
  }

  if (view === 'default') {
    const isAssignedBucket = focusedKey === 'assigned'
    const desks = deskItemsForKeys(
      layout,
      assigneeByDesk,
      floorId,
      (deskId) => Boolean(assigneeByDesk.get(deskId)) === isAssignedBucket,
    )
    return desksDetail({
      key: focusedKey,
      badge: 'Status',
      title: isAssignedBucket ? 'Assigned to a user' : 'Not assigned to a user',
      color: isAssignedBucket ? OCCUPIED_COLOR : UNOCCUPIED_COLOR,
      desks,
      floorTotal: layout.length,
    })
  }

  const model = buildAssignmentMapModel(users, view)
  if (!model) return null
  const categoryByDesk = deskCategoryByIdForFloor(model, floorId)
  const meta =
    focusedKey === '__unassigned__'
      ? {
          key: '__unassigned__',
          label: view === 'neighborhood' ? 'No neighborhood' : 'Unassigned',
          color: NEIGHBORHOOD_UNASSIGNED_COLOR,
        }
      : model.categories.get(focusedKey)

  if (!meta) return null

  const badge =
    view === 'neighborhood' ? 'Neighborhood' : view === 'department' ? 'Department' : 'Manager'

  const desks = deskItemsForKeys(layout, assigneeByDesk, floorId, (deskId) => {
    const cat = categoryByDesk.get(deskId)
    const key = cat?.key ?? '__unassigned__'
    return key === focusedKey
  })

  return desksDetail({
    key: focusedKey,
    badge,
    title: meta.label,
    color: meta.color ?? NEIGHBORHOOD_UNASSIGNED_COLOR,
    desks,
    floorTotal: layout.length,
  })
}

export { NEIGHBORHOOD_UNASSIGNED_COLOR }

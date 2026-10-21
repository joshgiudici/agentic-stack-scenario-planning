import { deskLayoutByFloor, DIRECTORY_DEPARTMENTS, FLOOR_OPTIONS } from './mockData.js'
import {
  getDeskNeighborhoodId,
  getNeighborhoodsForFloor,
  neighborhoodColor,
  NEIGHBORHOOD_PALETTE,
} from './neighborhoodData.js'

/** Same palette slots the neighborhood map already uses for these names. */
const DEPARTMENT_COLOR_INDEX = {
  Marketing: 0,
  Support: 1,
  Sales: 2,
  Engineering: 3,
  Design: 4,
  Product: 5,
  Finance: 6,
  Legal: 7,
  HR: 11,
}

const UNASSIGNED_KEY = '__unassigned__'
const LEGEND_VISIBLE_LIMIT = 5

function colorAt(index) {
  if (index < NEIGHBORHOOD_PALETTE.length) return NEIGHBORHOOD_PALETTE[index]
  const hue = (index * 47) % 360
  return `hsl(${hue} 62% 46%)`
}

/** Desk color for a department label. Shared by desk fills and view-by avatars. */
export function departmentColor(label) {
  const name = label || 'Unknown'
  const paletteIndex = DEPARTMENT_COLOR_INDEX[name]
  return paletteIndex == null
    ? colorAt(hashString(name) % NEIGHBORHOOD_PALETTE.length)
    : neighborhoodColor(paletteIndex)
}

function hashString(value) {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0
  return h
}

/**
 * Desk allocation for one dimension.
 * Department and manager come from the person assigned to the desk.
 * Neighborhood comes from the desk's neighborhood, whether or not someone sits there.
 */
export function categoryForDesk(dimension, user, floorId, deskId, usersById) {
  if (dimension === 'neighborhood') {
    const id = getDeskNeighborhoodId(floorId, deskId)
    if (!id) return null
    const nb = getNeighborhoodsForFloor(floorId).find((n) => n.id === id)
    return {
      key: id,
      label: nb?.name ?? id,
      color: nb?.color || (nb ? neighborhoodColor(nb.colorIndex) : colorAt(hashString(id) % NEIGHBORHOOD_PALETTE.length)),
    }
  }

  if (!user?.deskId) return null

  if (dimension === 'department') {
    const label = user.department || 'Unknown'
    return {
      key: `dept:${label}`,
      label,
      color: departmentColor(label),
    }
  }

  const managerId = user.managerId
  const manager = managerId ? usersById.get(managerId) : null
  // Org-root seats (e.g. CEO) have no manager — fold into their own manager bucket.
  const bucketId = managerId ?? user.id
  const label = manager?.name ?? user.name ?? 'No manager'
  return {
    key: `mgr:${bucketId}`,
    label,
    color: null,
  }
}

function rowsFromCounts(counts, categories) {
  const rows = []
  for (const [key, count] of counts) {
    if (key === UNASSIGNED_KEY || count <= 0) continue
    const meta = categories.get(key)
    if (!meta) continue
    rows.push({ key, label: meta.label, color: meta.color, count })
  }
  rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return rows
}

/**
 * Stack-plan model for every floor.
 * Floors are listed top-of-stack first (highest floor id at the top).
 */
export function buildStackPlanModel(users, dimension) {
  const usersById = new Map(users.map((user) => [user.id, user]))
  const assigneeByDesk = new Map()
  for (const user of users) {
    if (user.floorId && user.deskId) {
      assigneeByDesk.set(`${user.floorId}:${user.deskId}`, user)
    }
  }

  const categories = new Map()
  const floorBuckets = FLOOR_OPTIONS.map((floor) => ({
    floor,
    counts: new Map(),
    desks: [],
  }))

  for (const bucket of floorBuckets) {
    const layout = deskLayoutByFloor[bucket.floor.id] ?? []
    for (const { deskId } of layout) {
      const user = assigneeByDesk.get(`${bucket.floor.id}:${deskId}`) ?? null
      const category = categoryForDesk(dimension, user, bucket.floor.id, deskId, usersById)
      if (category) {
        if (!categories.has(category.key)) categories.set(category.key, category)
        bucket.counts.set(category.key, (bucket.counts.get(category.key) ?? 0) + 1)
        bucket.desks.push({ deskId, categoryKey: category.key })
      } else {
        bucket.counts.set(UNASSIGNED_KEY, (bucket.counts.get(UNASSIGNED_KEY) ?? 0) + 1)
        bucket.desks.push({ deskId, categoryKey: null })
      }
    }
  }

  if (dimension === 'manager') {
    const managers = [...categories.values()].sort((a, b) => a.label.localeCompare(b.label))
    managers.forEach((manager, index) => {
      manager.color = colorAt(index)
    })
  }

  const floors = [...floorBuckets].reverse().map((bucket) => {
    const rows = rowsFromCounts(bucket.counts, categories)
    const order = new Map(rows.map((row, index) => [row.key, index]))
    const assigned = bucket.desks.filter((desk) => desk.categoryKey)
    const open = bucket.desks.filter((desk) => !desk.categoryKey)
    assigned.sort(
      (a, b) => (order.get(a.categoryKey) ?? 0) - (order.get(b.categoryKey) ?? 0),
    )
    const desks = [...assigned, ...open].map((desk) => ({
      deskId: desk.deskId,
      categoryKey: desk.categoryKey ?? null,
      color: desk.categoryKey ? categories.get(desk.categoryKey)?.color ?? null : null,
      label: desk.categoryKey ? categories.get(desk.categoryKey)?.label ?? '' : 'Unassigned',
    }))
    return {
      id: bucket.floor.id,
      label: bucket.floor.label,
      total: bucket.desks.length,
      unassigned: bucket.counts.get(UNASSIGNED_KEY) ?? 0,
      rows,
      desks,
    }
  })

  return { floors, categories }
}

/** Counts for every floor, or for one floor when `floorId` is set. */
export function summarizeStackPlan(model, floorId) {
  const floors = floorId ? model.floors.filter((floor) => floor.id === floorId) : model.floors
  const counts = new Map()
  let total = 0
  let unassigned = 0

  for (const floor of floors) {
    total += floor.total
    unassigned += floor.unassigned
    for (const row of floor.rows) {
      counts.set(row.key, (counts.get(row.key) ?? 0) + row.count)
    }
  }

  const rows = rowsFromCounts(counts, model.categories)
  return { rows, unassigned, total }
}

/**
 * Categories that can be counted on a floor for the active dimension.
 * Departments and managers are org-wide. Neighborhoods belong to that floor.
 */
export function stackPlanCatalog(model, dimension, floorId) {
  if (dimension === 'department') {
    const rows = DIRECTORY_DEPARTMENTS.map((label) => ({
      key: `dept:${label}`,
      label,
      color: departmentColor(label),
    }))
    for (const category of model.categories.values()) {
      if (!rows.some((row) => row.key === category.key)) {
        rows.push({ key: category.key, label: category.label, color: category.color })
      }
    }
    return rows.sort((a, b) => a.label.localeCompare(b.label))
  }

  if (dimension === 'neighborhood') {
    const rows = getNeighborhoodsForFloor(floorId).map((neighborhood) => ({
      key: neighborhood.id,
      label: neighborhood.name,
      color: neighborhoodColor(neighborhood.colorIndex),
    }))
    const floor = model.floors.find((entry) => entry.id === floorId)
    for (const row of floor?.rows ?? []) {
      if (!rows.some((entry) => entry.key === row.key)) {
        rows.push({ key: row.key, label: row.label, color: row.color })
      }
    }
    return rows.sort((a, b) => a.label.localeCompare(b.label))
  }

  return [...model.categories.values()]
    .map((category) => ({ key: category.key, label: category.label, color: category.color }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function floorLegend(rows) {
  const visible = rows.slice(0, LEGEND_VISIBLE_LIMIT)
  const hiddenCount = Math.max(0, rows.length - visible.length)
  return { visible, hiddenCount }
}

/** deskId → category meta for one floor (null = unassigned for that dimension). */
export function deskCategoryByIdForFloor(model, floorId) {
  const floor = model.floors.find((entry) => entry.id === floorId)
  if (!floor) return new Map()
  const byId = new Map()
  for (const desk of floor.desks) {
    byId.set(
      desk.deskId,
      desk.categoryKey || desk.color
        ? {
            key: desk.categoryKey ?? null,
            color: desk.color,
            label: desk.label,
          }
        : null,
    )
  }
  return byId
}

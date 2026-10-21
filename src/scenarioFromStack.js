import { DIRECTORY_DEPARTMENTS } from './mockData.js'
import { NEIGHBORHOOD_PALETTE } from './neighborhoodData.js'

function departmentNameFor(allocation) {
  if (allocation.key.startsWith('dept:')) return allocation.key.slice('dept:'.length)
  return (
    DIRECTORY_DEPARTMENTS.find((name) => name.toLowerCase() === allocation.label.toLowerCase()) ??
    null
  )
}

function candidatesFor(allocation, users) {
  if (allocation.key.startsWith('mgr:')) {
    const managerId = allocation.key.slice('mgr:'.length)
    return users.filter((user) => (user.managerId ?? user.id) === managerId)
  }
  const department = departmentNameFor(allocation)
  if (!department) return []
  return users.filter((user) => user.department === department)
}

function seatRank(user, floorId) {
  if (user.floorId === floorId && user.deskId) return 0
  if (!user.deskId) return 2
  return 1
}

function assignmentPriority(allocation) {
  if (allocation.key.startsWith('mgr:')) return 1
  if (departmentNameFor(allocation)) return 0
  return 2
}

function paletteIndex(color) {
  const index = NEIGHBORHOOD_PALETTE.findIndex(
    (swatch) => swatch.toLowerCase() === String(color ?? '').toLowerCase(),
  )
  return index >= 0 ? index : 0
}

/**
 * Build scenario neighborhoods and desk assignments from painted stack floors.
 * `mode` is `both`, `neighborhoods`, or `assign`.
 */
export function buildScenarioFromStack({ floors, users, mode }) {
  const createNeighborhoods = mode === 'both' || mode === 'neighborhoods'
  const assignDesks = mode === 'both' || mode === 'assign'
  const byFloor = {}
  const deskMap = {}
  const assigned = new Map()
  const used = new Set()

  const orderedFloors = [...floors].sort((a, b) => a.id.localeCompare(b.id))
  for (const floor of orderedFloors) {
    const allocated = floor.desks.filter((desk) => desk.key)
    if (createNeighborhoods) {
      const neighborhoods = []
      const seen = new Set()
      const floorDeskMap = {}
      for (const desk of allocated) {
        const id = `stack:${desk.key}`
        if (!seen.has(id)) {
          seen.add(id)
          neighborhoods.push({
            id,
            name: desk.label,
            color: desk.color,
            colorIndex: paletteIndex(desk.color),
          })
        }
        floorDeskMap[desk.deskId] = id
      }
      byFloor[floor.id] = neighborhoods
      deskMap[floor.id] = floorDeskMap
    }

    if (!assignDesks) continue
    const queues = new Map()
    const walk = [...allocated].sort(
      (a, b) => assignmentPriority(a) - assignmentPriority(b) || a.label.localeCompare(b.label),
    )
    for (const desk of walk) {
      if (!queues.has(desk.key)) {
        const queue = candidatesFor(desk, users).sort(
          (a, b) => seatRank(a, floor.id) - seatRank(b, floor.id) || a.name.localeCompare(b.name),
        )
        queues.set(desk.key, queue)
      }
      const queue = queues.get(desk.key)
      let person = queue.shift()
      while (person && used.has(person.id)) person = queue.shift()
      if (!person) continue
      used.add(person.id)
      assigned.set(person.id, { floorId: floor.id, deskId: desk.deskId })
    }
  }

  const assignmentOverrides = {}
  if (assignDesks) {
    for (const user of users) {
      assignmentOverrides[user.id] = assigned.get(user.id) ?? { floorId: null, deskId: null }
    }
  }

  return {
    neighborhoods: createNeighborhoods ? { byFloor, deskMap } : null,
    assignmentOverrides: assignDesks ? assignmentOverrides : null,
  }
}

import { buildDeskLayoutByFloor, DESK_TILE_HEIGHT, DESK_TILE_WIDTH } from './deskLayoutShared.js'

/** Neighborhood color palette (A–N). Index maps to color slot, not display name. */
export const NEIGHBORHOOD_PALETTE = [
  '#2C9C9E', // A
  '#2BA9C1', // B
  '#2E8CD9', // C
  '#625DC3', // D
  '#8242B6', // E
  '#B341BC', // F
  '#DE418D', // G
  '#CD403A', // H
  '#E26411', // I
  '#EC840C', // J
  '#F5A306', // K
  '#FFC300', // L
  '#A6BE46', // M
  '#4DAB85', // N
]

export const NEIGHBORHOOD_UNASSIGNED_COLOR = '#BBBBBB'

export function neighborhoodColor(colorIndex) {
  return NEIGHBORHOOD_PALETTE[colorIndex] ?? NEIGHBORHOOD_UNASSIGNED_COLOR
}

function parseHexRgb(hex) {
  if (!hex || typeof hex !== 'string' || hex[0] !== '#' || (hex.length !== 7 && hex.length !== 4)) {
    return null
  }
  if (hex.length === 4) {
    return {
      r: parseInt(hex[1] + hex[1], 16),
      g: parseInt(hex[2] + hex[2], 16),
      b: parseInt(hex[3] + hex[3], 16),
    }
  }
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

/** Darken a hex color for label text/borders (accessibility on white pill). */
export function darkenHexColor(hex, factor = 0.72) {
  const rgb = parseHexRgb(hex)
  if (!rgb) return hex
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${clamp(rgb.r * factor).toString(16).padStart(2, '0')}${clamp(rgb.g * factor)
    .toString(16)
    .padStart(2, '0')}${clamp(rgb.b * factor).toString(16).padStart(2, '0')}`
}

/** Mix hex toward white for vacant-desk fills (amount 0–1, higher = lighter). */
export function lightenHexColor(hex, amount = 0.82) {
  const rgb = parseHexRgb(hex)
  if (!rgb) return '#f5f5f5'
  const t = Math.max(0, Math.min(1, amount))
  const mix = (c) => Math.max(0, Math.min(255, Math.round(c + (255 - c) * t)))
  return `#${mix(rgb.r).toString(16).padStart(2, '0')}${mix(rgb.g).toString(16).padStart(2, '0')}${mix(
    rgb.b,
  )
    .toString(16)
    .padStart(2, '0')}`
}

export const NEIGHBORHOODS_BY_FLOOR = {
  'floor-1': [
    { id: 'nb-marketing', name: 'Marketing', colorIndex: 0 },
    { id: 'nb-support', name: 'Support', colorIndex: 1 },
    { id: 'nb-sales', name: 'Sales', colorIndex: 2 },
    { id: 'nb-engineering', name: 'Engineering', colorIndex: 3 },
    { id: 'nb-design', name: 'Design', colorIndex: 4 },
    { id: 'nb-product', name: 'Product', colorIndex: 5 },
    { id: 'nb-finance', name: 'Finance', colorIndex: 6 },
    { id: 'nb-legal', name: 'Legal', colorIndex: 7 },
    { id: 'nb-hr', name: 'HR', colorIndex: 11 },
  ],
  'floor-2': [
    { id: 'nb-engineering', name: 'Engineering', colorIndex: 3 },
    { id: 'nb-product', name: 'Product', colorIndex: 5 },
    { id: 'nb-design', name: 'Design', colorIndex: 4 },
  ],
  'floor-3': [
    { id: 'nb-product', name: 'Product', colorIndex: 5 },
    { id: 'nb-marketing', name: 'Marketing', colorIndex: 0 },
    { id: 'nb-sales', name: 'Sales', colorIndex: 2 },
  ],
  'floor-4': [
    { id: 'nb-hr', name: 'HR', colorIndex: 11 },
    { id: 'nb-legal', name: 'Legal', colorIndex: 7 },
  ],
}

/**
 * Per-neighborhood desk counts from layout clusters (in order). Supports odd sizes by
 * consuming desks sequentially within each cluster before moving to the next.
 *
 * Floor 1 grid (6×3 clusters):
 *   0  1  2
 *   3  4  5
 *   6  7  8
 *   9 10 11
 *  12 13 14
 *  15 16 17
 */
const FLOOR_NEIGHBORHOOD_ZONE_SPECS = {
  'floor-1': [
    { neighborhoodId: 'nb-support', clusters: [0, 3, 6, 9], takeDesks: 7 },
    { neighborhoodId: 'nb-marketing', clusters: [1, 4], takeDesks: 3 },
    { neighborhoodId: 'nb-sales', clusters: [2, 5, 8], takeDesks: 5 },
    { neighborhoodId: 'nb-engineering', clusters: [4, 7, 10], takeDesks: 4 },
    { neighborhoodId: 'nb-product', clusters: [8, 11, 14, 17], takeDesks: 7 },
    { neighborhoodId: 'nb-finance', clusters: [12, 15, 16], takeDesks: 5 },
    { neighborhoodId: 'nb-design', clusters: [13, 16], takeDesks: 3 },
    { neighborhoodId: 'nb-legal', clusters: [9, 10], takeDesks: 2 },
  ],
  'floor-2': [
    { neighborhoodId: 'nb-engineering', clusters: [0, 1, 3, 5], takeDesks: 7 },
    { neighborhoodId: 'nb-product', clusters: [2, 5], takeDesks: 3 },
    { neighborhoodId: 'nb-design', clusters: [4], takeDesks: 2 },
  ],
  'floor-3': [
    { neighborhoodId: 'nb-product', clusters: [0, 3, 6, 7], takeDesks: 7 },
    { neighborhoodId: 'nb-marketing', clusters: [1, 4, 7, 8], takeDesks: 5 },
    { neighborhoodId: 'nb-sales', clusters: [2, 5, 8], takeDesks: 3 },
  ],
  'floor-4': [
    { neighborhoodId: 'nb-hr', clusters: [0, 2], takeDesks: 3 },
    { neighborhoodId: 'nb-legal', clusters: [1, 2, 3], takeDesks: 5 },
  ],
}

function buildFloorMapFromZoneSpecs(layout, specs) {
  const floorMap = {}

  for (const { neighborhoodId, clusters, takeDesks } of specs) {
    let taken = 0
    for (const clusterIdx of clusters) {
      const pair = layout.slice(clusterIdx * 2, clusterIdx * 2 + 2)
      for (const { deskId } of pair) {
        if (floorMap[deskId]) continue
        if (taken >= takeDesks) break
        floorMap[deskId] = neighborhoodId
        taken++
      }
      if (taken >= takeDesks) break
    }
  }

  return floorMap
}

function buildDeskNeighborhoodMapFromZoneSpecs() {
  const layoutByFloor = buildDeskLayoutByFloor()
  const out = {}

  for (const [floorId, specs] of Object.entries(FLOOR_NEIGHBORHOOD_ZONE_SPECS)) {
    out[floorId] = buildFloorMapFromZoneSpecs(layoutByFloor[floorId] ?? [], specs)
  }

  return out
}

/** Desk → neighborhood id per floor. Desks omitted are unassigned (gray). */
const DESK_NEIGHBORHOOD_BY_FLOOR = buildDeskNeighborhoodMapFromZoneSpecs()

/** Scenario plan built from a stack. Null uses the published neighborhoods. */
let scenarioNeighborhoodPlan = null

export function installScenarioNeighborhoods(plan) {
  scenarioNeighborhoodPlan = plan
}

export function getNeighborhoodsForFloor(floorId) {
  if (scenarioNeighborhoodPlan) return scenarioNeighborhoodPlan.byFloor[floorId] ?? []
  return NEIGHBORHOODS_BY_FLOOR[floorId] ?? []
}

/** Neighborhoods defined on this floor (for floor picker / overview). */
export function countNeighborhoodsOnFloor(floorId) {
  return getNeighborhoodsForFloor(floorId).length
}

export function getNeighborhoodById(floorId, neighborhoodId) {
  return getNeighborhoodsForFloor(floorId).find((n) => n.id === neighborhoodId) ?? null
}

export function getDeskNeighborhoodId(floorId, deskId) {
  if (scenarioNeighborhoodPlan) return scenarioNeighborhoodPlan.deskMap[floorId]?.[deskId] ?? null
  return DESK_NEIGHBORHOOD_BY_FLOOR[floorId]?.[deskId] ?? null
}

export function neighborhoodDisplayColor(neighborhood) {
  if (!neighborhood) return NEIGHBORHOOD_UNASSIGNED_COLOR
  return neighborhood.color || neighborhoodColor(neighborhood.colorIndex)
}

export function getDeskNeighborhoodColor(floorId, deskId) {
  const nbId = getDeskNeighborhoodId(floorId, deskId)
  if (!nbId) return NEIGHBORHOOD_UNASSIGNED_COLOR
  return neighborhoodDisplayColor(getNeighborhoodById(floorId, nbId))
}

/** Overview counts grouped by neighborhood for the current floor. */
export function computeNeighborhoodOverviewStats(floorId, deskLayout) {
  const neighborhoods = getNeighborhoodsForFloor(floorId)
  const countsById = Object.fromEntries(neighborhoods.map((n) => [n.id, 0]))
  let unassigned = 0

  for (const { deskId } of deskLayout) {
    const nbId = getDeskNeighborhoodId(floorId, deskId)
    if (nbId && nbId in countsById) {
      countsById[nbId] += 1
    } else {
      unassigned += 1
    }
  }

  const rows = neighborhoods.map((n) => ({
    id: n.id,
    name: n.name,
    color: neighborhoodDisplayColor(n),
    count: countsById[n.id] ?? 0,
  }))

  const total = deskLayout.length

  return { rows, unassigned, total }
}

/** Label anchor positions — centroid of each neighborhood's desks on the map. */
export function computeNeighborhoodLabelAnchors(floorId, deskLayout) {
  const groups = {}

  for (const { deskId, x, y } of deskLayout) {
    const nbId = getDeskNeighborhoodId(floorId, deskId)
    if (!nbId) continue
    if (!groups[nbId]) groups[nbId] = { sumX: 0, sumY: 0, count: 0 }
    groups[nbId].sumX += x + DESK_TILE_WIDTH / 2
    groups[nbId].sumY += y + DESK_TILE_HEIGHT / 2
    groups[nbId].count += 1
  }

  return Object.entries(groups).map(([neighborhoodId, g]) => {
    const nb = getNeighborhoodById(floorId, neighborhoodId)
    const color = neighborhoodDisplayColor(nb)
    return {
      neighborhoodId,
      name: nb?.name ?? neighborhoodId,
      x: g.sumX / g.count,
      y: g.sumY / g.count,
      color,
      labelColor: darkenHexColor(color),
    }
  })
}

/** Conic-gradient stops for the overview pie chart. */
export function buildNeighborhoodPieGradient(rows, unassigned, total) {
  if (total <= 0) return NEIGHBORHOOD_UNASSIGNED_COLOR

  const segments = [
    ...rows.filter((r) => r.count > 0).map((r) => ({ color: r.color, count: r.count })),
    ...(unassigned > 0 ? [{ color: NEIGHBORHOOD_UNASSIGNED_COLOR, count: unassigned }] : []),
  ]

  let cursor = 0
  const stops = segments.map(({ color, count }) => {
    const start = (cursor / total) * 100
    cursor += count
    const end = (cursor / total) * 100
    return `${color} ${start}% ${end}%`
  })

  return `conic-gradient(${stops.join(', ')})`
}

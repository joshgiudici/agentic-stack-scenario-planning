/** Desk map geometry shared by mockData (render) and directoryUserDb (assignment order). */

export const DESK_TILE_WIDTH = 16
export const DESK_TILE_HEIGHT = 32

const GAP_IN_PAIR = 8
const GAP_BETWEEN_CLUSTERS = 28
const ROW_GAP = 8
const ORIGIN_X = 40
const ORIGIN_Y = 44

function buildDeskClusterGrid(originY, deskIdsInRowOrder, { rows = 3, clustersPerRow = 3 } = {}) {
  const out = []
  let idx = 0
  for (let row = 0; row < rows; row++) {
    if (idx >= deskIdsInRowOrder.length) break
    const y = originY + row * (DESK_TILE_HEIGHT + ROW_GAP)
    let x = ORIGIN_X
    for (let cluster = 0; cluster < clustersPerRow; cluster++) {
      if (idx >= deskIdsInRowOrder.length) break
      out.push({ deskId: deskIdsInRowOrder[idx++], x, y })
      if (idx >= deskIdsInRowOrder.length) break
      x += DESK_TILE_WIDTH + GAP_IN_PAIR
      out.push({ deskId: deskIdsInRowOrder[idx++], x, y })
      x += DESK_TILE_WIDTH + GAP_BETWEEN_CLUSTERS
    }
  }
  return out
}

/** Row-interleaved desk IDs so each neighborhood's two clusters are vertically adjacent on the map. */
const FLOOR_1_DESK_IDS = [
  // block 1 row 0
  'F1-101',
  'F1-102',
  'F1-107',
  'F1-108',
  'F1-113',
  'F1-114',
  // block 2 row 0 (directly below)
  'F1-119',
  'F1-120',
  'F1-125',
  'F1-126',
  'F1-131',
  'F1-132',
  // block 1 row 1
  'F1-103',
  'F1-104',
  'F1-109',
  'F1-110',
  'F1-115',
  'F1-116',
  // block 2 row 1
  'F1-121',
  'F1-122',
  'F1-127',
  'F1-128',
  'F1-133',
  'F1-134',
  // block 1 row 2
  'F1-105',
  'F1-106',
  'F1-111',
  'F1-112',
  'F1-117',
  'F1-118',
  // block 2 row 2
  'F1-123',
  'F1-124',
  'F1-129',
  'F1-130',
  'F1-135',
  'F1-136',
]

const floor1Layout = buildDeskClusterGrid(ORIGIN_Y, FLOOR_1_DESK_IDS, {
  rows: 6,
  clustersPerRow: 3,
})

const F2_IDS = [
  'F2-201',
  'F2-202',
  'F2-203',
  'F2-204',
  'F2-205',
  'F2-206',
  'F2-207',
  'F2-208',
  'F2-209',
  'F2-210',
  'F2-211',
  'F2-212',
]

const F3_IDS = [
  'F3-101',
  'F3-102',
  'F3-103',
  'F3-104',
  'F3-105',
  'F3-106',
  'F3-107',
  'F3-108',
  'F3-109',
  'F3-110',
  'F3-111',
  'F3-112',
  'F3-113',
  'F3-114',
  'F3-115',
  'F3-116',
  'F3-117',
  'F3-118',
]

const F4_IDS = ['F4-101', 'F4-102', 'F4-103', 'F4-104', 'F4-105', 'F4-106', 'F4-107', 'F4-108']

export function buildDeskLayoutByFloor() {
  return {
    'floor-1': floor1Layout,
    'floor-2': buildDeskClusterGrid(ORIGIN_Y, F2_IDS, { rows: 2, clustersPerRow: 3 }),
    'floor-3': buildDeskClusterGrid(ORIGIN_Y, F3_IDS, { rows: 3, clustersPerRow: 3 }),
    'floor-4': buildDeskClusterGrid(ORIGIN_Y, F4_IDS, { rows: 2, clustersPerRow: 2 }),
  }
}

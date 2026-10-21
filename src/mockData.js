import { buildDeskLayoutByFloor, DESK_TILE_HEIGHT, DESK_TILE_WIDTH } from './deskLayoutShared.js'

export { DESK_TILE_HEIGHT, DESK_TILE_WIDTH }

export const FLOOR_OPTIONS = [
  { id: 'floor-1', label: 'Floor 1' },
  { id: 'floor-2', label: 'Floor 2' },
  { id: 'floor-3', label: 'Floor 3' },
  { id: 'floor-4', label: 'Floor 4' },
]

/** Hotel + disabled desk counts per floor (map shows assigned vs free only; overview uses these splits). */
export const floorOverviewExtras = {
  'floor-1': { hotel: 4, disabled: 2 },
  'floor-2': { hotel: 2, disabled: 1 },
  'floor-3': { hotel: 3, disabled: 1 },
  'floor-4': { hotel: 1, disabled: 0 },
}

export { users, DIRECTORY_DEPARTMENTS } from './directoryUserDb.js'

export const desksByFloor = {
  'floor-1': [
    'F1-101',
    'F1-102',
    'F1-103',
    'F1-104',
    'F1-105',
    'F1-106',
    'F1-107',
    'F1-108',
    'F1-109',
    'F1-110',
    'F1-111',
    'F1-112',
    'F1-113',
    'F1-114',
    'F1-115',
    'F1-116',
    'F1-117',
    'F1-118',
    'F1-119',
    'F1-120',
    'F1-121',
    'F1-122',
    'F1-123',
    'F1-124',
    'F1-125',
    'F1-126',
    'F1-127',
    'F1-128',
    'F1-129',
    'F1-130',
    'F1-131',
    'F1-132',
    'F1-133',
    'F1-134',
    'F1-135',
    'F1-136',
  ],
  'floor-2': [
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
  ],
  'floor-3': [
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
  ],
  'floor-4': ['F4-101', 'F4-102', 'F4-103', 'F4-104', 'F4-105', 'F4-106', 'F4-107', 'F4-108'],
}

export const deskLayoutByFloor = buildDeskLayoutByFloor()

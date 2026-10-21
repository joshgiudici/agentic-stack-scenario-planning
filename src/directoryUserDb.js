import { buildDeskLayoutByFloor } from './deskLayoutShared.js'
import { getDeskNeighborhoodId } from './neighborhoodData.js'

/** Directory user attributes + desk slots (mirrors mockData desksByFloor for assignments). */

export const DIRECTORY_DEPARTMENTS = [
  'Support',
  'Marketing',
  'Sales',
  'Engineering',
  'Design',
  'Product',
  'Finance',
  'Legal',
  'HR',
]

const DESK_LAYOUT_BY_FLOOR = buildDeskLayoutByFloor()

function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(12, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

/**
 * `daysAgo` ranges so directory date filters (7 / 15 / 30 / 60 / 90) each have a distinct slice of users:
 * bucket 0 → last 7 only, 1 → 8–15d, 2 → 16–30d, 3 → 31–60d, 4 → 61–90d.
 */
const DATE_SPREAD_BUCKETS = [
  { lo: 0, hi: 6 },
  { lo: 7, hi: 14 },
  { lo: 15, hi: 29 },
  { lo: 30, hi: 59 },
  { lo: 60, hi: 89 },
]

/** Deskless users after the first four: start at 8+ so they never match the “Last 7 days” filter. */
const UNASSIGNED_EXTRA_BUCKETS = [
  { lo: 8, hi: 14 },
  { lo: 15, hi: 29 },
  { lo: 30, hi: 59 },
  { lo: 60, hi: 89 },
]

function daysAgoInBucket(b, salt) {
  const span = b.hi - b.lo + 1
  return b.lo + (salt % span)
}

function daysAgoInSpreadBucket(bucketIndex, salt) {
  const b = DATE_SPREAD_BUCKETS[Math.min(Math.max(0, bucketIndex), DATE_SPREAD_BUCKETS.length - 1)]
  return daysAgoInBucket(b, salt)
}

const COLORS = [
  '#f97373',
  '#fb923c',
  '#facc15',
  '#22c55e',
  '#38bdf8',
  '#a855f7',
  '#6366f1',
  '#ec4899',
  '#0ea5e9',
  '#84cc16',
  '#f97316',
  '#06b6d4',
  '#14b8a6',
  '#8b5cf6',
  '#f43f5e',
  '#10b981',
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#fb7185',
  '#06b6d4',
  '#64748b',
  '#d946ef',
  '#ea580c',
  '#22d3ee',
  '#f97316',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#c026d3',
]

/**
 * Explicit org + seating plan.
 *
 * Each department’s people sit in matching neighborhood desks, with managers
 * clustered next to their reports. Neighborhoods intentionally keep empty
 * buffer desks. A couple of seats are deliberate exceptions.
 *
 * `desk: [floorId, deskId] | null` — null means unassigned (assign queue).
 */
const ORG_BLUEPRINT = [
  {
    department: 'Executive',
    /** Not a directory filter department — maps to Product for seating/color. */
    directoryDepartment: 'Product',
    managerId: null,
    people: [
      {
        id: 'u1',
        name: 'Patricia Chen',
        title: 'Chief Executive Officer',
        desk: ['floor-1', 'F1-134'],
        isOrgRoot: true,
      },
    ],
  },
  {
    department: 'Marketing',
    managerId: 'u1',
    people: [
      // Manager centered in the larger Marketing neighborhood on Floor 3
      { id: 'u2', name: 'Kathryn Webb', title: 'Marketing Manager', desk: ['floor-3', 'F3-109'], isManager: true },
      { id: 'u3', name: 'Jordan Hayes', title: 'Brand Strategist', desk: ['floor-3', 'F3-103'] },
      { id: 'u4', name: 'Sienna Diaz', title: 'Content Lead', desk: ['floor-3', 'F3-104'] },
      { id: 'u5', name: 'Cameron Lane', title: 'Demand Gen Specialist', desk: ['floor-3', 'F3-110'] },
      // Floor 1 Marketing cluster (buffer: F1-125 empty)
      { id: 'u6', name: 'Avery Foster', title: 'Social Media Manager', desk: ['floor-1', 'F1-107'] },
      { id: 'u7', name: 'Riley Powell', title: 'Marketing Coordinator', desk: ['floor-1', 'F1-108'] },
      { id: 'u8', name: 'Harper Long', title: 'Events Specialist', desk: null },
    ],
  },
  {
    department: 'Support',
    managerId: 'u1',
    people: [
      { id: 'u9', name: 'Marvin McKinney', title: 'Support Manager', desk: ['floor-1', 'F1-119'], isManager: true },
      { id: 'u10', name: 'Esther Miles', title: 'Customer Success Lead', desk: ['floor-1', 'F1-101'] },
      { id: 'u11', name: 'Floyd Hawkins', title: 'Support Specialist', desk: ['floor-1', 'F1-102'] },
      { id: 'u12', name: 'Bessie Cooper', title: 'Support Specialist', desk: ['floor-1', 'F1-120'] },
      { id: 'u13', name: 'Guy Jones', title: 'Technical Support', desk: ['floor-1', 'F1-103'] },
      // Buffer: F1-104, F1-121 empty
      { id: 'u14', name: 'Chelsea Ortiz', title: 'Support Associate', desk: null },
    ],
  },
  {
    department: 'Sales',
    managerId: 'u1',
    people: [
      { id: 'u15', name: 'Ronald Richards', title: 'Sales Manager', desk: ['floor-1', 'F1-131'], isManager: true },
      { id: 'u16', name: 'Savannah Bell', title: 'Account Executive', desk: ['floor-1', 'F1-113'] },
      { id: 'u17', name: 'Jerome Edwards', title: 'Account Executive', desk: ['floor-1', 'F1-114'] },
      { id: 'u18', name: 'Ralph Williamson', title: 'Sales Development Rep', desk: ['floor-1', 'F1-132'] },
      // Floor 3 Sales (buffer: F3-111 empty)
      { id: 'u19', name: 'Devon Warren', title: 'Account Executive', desk: ['floor-3', 'F3-105'] },
      { id: 'u20', name: 'Wade Baxter', title: 'Sales Operations', desk: ['floor-3', 'F3-106'] },
      // Exception: Sales sitting in Product neighborhood (unique circumstance)
      { id: 'u21', name: 'Cody Harper', title: 'Enterprise AE', desk: ['floor-1', 'F1-116'] },
      { id: 'u22', name: 'Jamie Reed', title: 'SDR', desk: null },
    ],
  },
  {
    department: 'Engineering',
    managerId: 'u1',
    people: [
      // Primary eng pod on Floor 2
      { id: 'u23', name: 'Albert Flores', title: 'Engineering Manager', desk: ['floor-2', 'F2-203'], isManager: true },
      { id: 'u24', name: 'Annette Black', title: 'Staff Engineer', desk: ['floor-2', 'F2-201'] },
      { id: 'u25', name: 'Arlene McCoy', title: 'Senior Engineer', desk: ['floor-2', 'F2-202'] },
      { id: 'u26', name: 'Brooklyn Simmons', title: 'Software Engineer', desk: ['floor-2', 'F2-204'] },
      { id: 'u27', name: 'Darrell Steward', title: 'Software Engineer', desk: ['floor-2', 'F2-207'] },
      { id: 'u28', name: 'Eleanor Pena', title: 'Platform Engineer', desk: ['floor-2', 'F2-208'] },
      // Floor 1 Engineering (buffer: F1-126, F1-127 empty)
      { id: 'u29', name: 'Jacob Howard', title: 'Frontend Engineer', desk: ['floor-1', 'F1-109'] },
      { id: 'u30', name: 'Jane Cooper', title: 'Backend Engineer', desk: ['floor-1', 'F1-110'] },
      // Buffer: F2-211 empty
      { id: 'u31', name: 'Kristin Watson', title: 'QA Engineer', desk: null },
      { id: 'u32', name: 'Dianne Russell', title: 'DevOps Engineer', desk: null },
    ],
  },
  {
    department: 'Design',
    managerId: 'u1',
    people: [
      { id: 'u33', name: 'Courtney Henry', title: 'Design Manager', desk: ['floor-1', 'F1-111'], isManager: true },
      { id: 'u34', name: 'Theresa Murphy', title: 'Product Designer', desk: ['floor-1', 'F1-112'] },
      { id: 'u35', name: 'Leslie Alexander', title: 'UX Designer', desk: ['floor-1', 'F1-130'] },
      // Floor 2 Design (buffer: F2-210 empty)
      { id: 'u36', name: 'Miles Stone', title: 'Visual Designer', desk: ['floor-2', 'F2-209'] },
      { id: 'u37', name: 'Nina Ortiz', title: 'Design Intern', desk: null },
    ],
  },
  {
    department: 'Product',
    managerId: 'u1',
    people: [
      // Floor 3 Product pod
      { id: 'u38', name: 'Oscar Reed', title: 'Product Manager', desk: ['floor-3', 'F3-107'], isManager: true },
      { id: 'u39', name: 'Jenny Wilson', title: 'Senior PM', desk: ['floor-3', 'F3-101'] },
      { id: 'u40', name: 'Morgan Brooks', title: 'Product Analyst', desk: ['floor-3', 'F3-102'] },
      { id: 'u41', name: 'Quinn Hayes', title: 'Associate PM', desk: ['floor-3', 'F3-108'] },
      { id: 'u42', name: 'Parker Foster', title: 'Product Ops', desk: ['floor-3', 'F3-113'] },
      // Buffer on F3: F3-114, F3-115 empty
    ],
  },
  {
    department: 'Product',
    managerId: 'u1',
    people: [
      // Floor 1 Product pod (second team lead) + Floor 2 satellite
      { id: 'u43', name: 'Skyler Griffin', title: 'Group Product Manager', desk: ['floor-1', 'F1-133'], isManager: true },
      { id: 'u44', name: 'Drew Powell', title: 'Product Manager', desk: ['floor-1', 'F1-117'] },
      { id: 'u45', name: 'Casey Long', title: 'Technical PM', desk: ['floor-1', 'F1-118'] },
      { id: 'u46', name: 'Taylor Patel', title: 'Product Designer PM', desk: ['floor-1', 'F1-135'] },
      { id: 'u47', name: 'Alex Ross', title: 'Growth PM', desk: ['floor-1', 'F1-136'] },
      // Buffer: F1-134 taken by CEO; F1-116 taken by Sales exception
      // Floor 2 Product (buffer: F2-212 empty)
      { id: 'u48', name: 'Sam Wood', title: 'Product Analyst', desk: ['floor-2', 'F2-205'] },
      { id: 'u49', name: 'Reese Gray', title: 'Junior PM', desk: ['floor-2', 'F2-206'] },
      { id: 'u50', name: 'Blake James', title: 'Product Coordinator', desk: null },
    ],
  },
  {
    department: 'Finance',
    managerId: 'u1',
    people: [
      { id: 'u51', name: 'Charlie Cole', title: 'Finance Manager', desk: ['floor-1', 'F1-105'], isManager: true },
      { id: 'u52', name: 'Dakota West', title: 'Senior Accountant', desk: ['floor-1', 'F1-106'] },
      { id: 'u53', name: 'Emerson Rivera', title: 'Financial Analyst', desk: ['floor-1', 'F1-123'] },
      { id: 'u54', name: 'Finley Cook', title: 'FP&A Analyst', desk: ['floor-1', 'F1-124'] },
      // Buffer: F1-129 empty
      { id: 'u55', name: 'Hayden Bailey', title: 'Payroll Specialist', desk: null },
    ],
  },
  {
    department: 'Legal',
    managerId: 'u1',
    people: [
      { id: 'u56', name: 'Logan Murphy', title: 'Legal Manager', desk: ['floor-4', 'F4-103'], isManager: true },
      { id: 'u57', name: 'Monroe Rogers', title: 'Corporate Counsel', desk: ['floor-4', 'F4-104'] },
      { id: 'u58', name: 'Albert Peterson', title: 'Contracts Counsel', desk: ['floor-4', 'F4-106'] },
      { id: 'u59', name: 'Annette Cooper', title: 'Compliance Specialist', desk: ['floor-4', 'F4-107'] },
      // Buffer: F4-108 + Floor 1 Legal desks empty
      // Exception: Legal at an unassigned Floor 3 desk (swing space during remodel)
      { id: 'u60', name: 'Arlene Reed', title: 'Paralegal', desk: ['floor-3', 'F3-112'] },
      { id: 'u61', name: 'Brooklyn Kelly', title: 'Legal Assistant', desk: null },
    ],
  },
  {
    department: 'HR',
    managerId: 'u1',
    people: [
      { id: 'u62', name: 'Cody Howard', title: 'HR Manager', desk: ['floor-4', 'F4-101'], isManager: true },
      { id: 'u63', name: 'Chelsea Flores', title: 'People Partner', desk: ['floor-4', 'F4-102'] },
      // Buffer: F4-105 empty
      { id: 'u64', name: 'Sienna Black', title: 'Recruiter', desk: null },
    ],
  },
]

function assertDeskExists(floorId, deskId) {
  const layout = DESK_LAYOUT_BY_FLOOR[floorId] ?? []
  if (!layout.some((d) => d.deskId === deskId)) {
    throw new Error(`Unknown desk ${deskId} on ${floorId}`)
  }
}

function buildUsers() {
  const usedDesks = new Set()
  const out = []
  let recentUnassignedWithoutDeskRemaining = 4
  let assignedIndex = 0
  let unassignedIndex = 0

  for (const team of ORG_BLUEPRINT) {
    const department = team.directoryDepartment ?? team.department
    const teamManager = team.people.find((p) => p.isManager)
    const teamManagerId = teamManager?.id ?? team.managerId

    for (const person of team.people) {
      let floorId = null
      let deskId = null

      if (person.desk) {
        ;[floorId, deskId] = person.desk
        assertDeskExists(floorId, deskId)
        const key = `${floorId}:${deskId}`
        if (usedDesks.has(key)) {
          throw new Error(`Duplicate desk assignment: ${key}`)
        }
        usedDesks.add(key)
      }

      const hasDesk = Boolean(floorId && deskId)
      let daysAgo
      if (!hasDesk) {
        if (recentUnassignedWithoutDeskRemaining > 0) {
          daysAgo = daysAgoInSpreadBucket(0, unassignedIndex)
          recentUnassignedWithoutDeskRemaining--
        } else {
          const b = UNASSIGNED_EXTRA_BUCKETS[unassignedIndex % UNASSIGNED_EXTRA_BUCKETS.length]
          daysAgo = daysAgoInBucket(b, unassignedIndex)
        }
        unassignedIndex++
      } else {
        daysAgo = daysAgoInSpreadBucket(assignedIndex % 5, assignedIndex)
        assignedIndex++
      }

      let managerId = null
      if (person.isOrgRoot) {
        managerId = null
      } else if (person.isManager) {
        managerId = team.managerId
      } else {
        managerId = teamManagerId
      }

      out.push({
        id: person.id,
        name: person.name,
        title: person.title,
        avatarColor: COLORS[(out.length) % COLORS.length],
        floorId,
        deskId,
        dateAdded: isoDaysAgo(daysAgo),
        department,
        managerId,
      })
    }
  }

  return out
}

export const users = buildUsers()

/** Dev helper: seating vs neighborhood alignment summary. */
export function summarizeSeatingAlignment(userList = users) {
  const rows = []
  for (const user of userList) {
    if (!user.floorId || !user.deskId) continue
    const nbId = getDeskNeighborhoodId(user.floorId, user.deskId)
    const expected = `nb-${user.department.toLowerCase()}`
    rows.push({
      id: user.id,
      name: user.name,
      department: user.department,
      floorId: user.floorId,
      deskId: user.deskId,
      neighborhoodId: nbId,
      aligned: nbId === expected,
    })
  }
  return rows
}

import { deskLayoutByFloor, DIRECTORY_DEPARTMENTS, FLOOR_OPTIONS } from './mockData.js'
import { getNeighborhoodsForFloor, NEIGHBORHOOD_PALETTE } from './neighborhoodData.js'
import { buildStackPlanModel, categoryForDesk, stackPlanCatalog } from './stackPlanData.js'

const FLOOR_IDS = FLOOR_OPTIONS.map((floor) => floor.id)
const BASIS_PLURAL = {
  department: 'departments',
  manager: 'managers',
  neighborhood: 'neighborhoods',
}
const FLOOR_WORDS = { one: 1, two: 2, three: 3, four: 4 }

function normalizeClause(clause) {
  return clause
    .replace(/\bfloor\s+(one|two|three|four)\b/gi, (_, word) => `floor ${FLOOR_WORDS[word.toLowerCase()]}`)
    .replace(/\s+/g, ' ')
    .trim()
}

function basisIn(text) {
  const match = text.match(/\b(departments?|managers?|neighborhoods?)\b/i)
  if (!match) return null
  const word = match[1].toLowerCase()
  if (word.startsWith('department')) return 'department'
  if (word.startsWith('manager')) return 'manager'
  return 'neighborhood'
}

function floorNumbers(clause) {
  const match = clause.match(/\bfloors?\s+((?:\d+\s*(?:,|and|&)?\s*)+)/i)
  if (!match) return []
  return [...match[1].matchAll(/\d+/g)].map((item) => Number(item[0]))
}

function exceptionIn(clause) {
  const patterns = [
    /\bexcept(?:\s+for)?\s+([^,]+?)\s*,\s*which\s+should\s+be\s+based\s+on\s+(?:a\s+|the\s+|current\s+)?(departments?|managers?|neighborhoods?)\b/i,
    /\bexcept(?:\s+for)?\s+(.+?)\s+which\s+should\s+be\s+based\s+on\s+(?:a\s+|the\s+|current\s+)?(departments?|managers?|neighborhoods?)\b/i,
    /\bexcept(?:\s+for)?\s+(.+?)\s+based\s+on\s+(?:a\s+|the\s+|current\s+)?(departments?|managers?|neighborhoods?)\b/i,
  ]
  for (const pattern of patterns) {
    const match = clause.match(pattern)
    if (!match) continue
    const name = match[1].replace(/^["“']|["”']$/g, '').replace(/^(the|a)\s+/i, '').trim()
    const basis = basisIn(match[2])
    if (!name || !basis) return { error: 'Name the exception and whether it is based on a department, manager, or neighborhood.' }
    return { name, basis }
  }
  if (/\bexcept\b/i.test(clause)) {
    return { error: 'Name the exception and whether it is based on a department, manager, or neighborhood.' }
  }
  return null
}

/**
 * Turn a free-text starting point into per-floor instructions.
 * Unmentioned floors stay on current departments unless the prompt sets a default.
 */
export function parseStackPrompt(text) {
  const clauses = text
    .split(/[.\n;]+/)
    .map(normalizeClause)
    .filter(Boolean)
  if (clauses.length === 0) {
    return { ok: false, message: 'Describe a starting point, or choose departments, managers, or neighborhoods.' }
  }

  let defaultBasis = 'department'
  let namedDefault = false
  const instructions = new Map()

  for (const clause of clauses) {
    const exception = exceptionIn(clause)
    if (exception?.error) return { ok: false, message: exception.error }
    const floors = floorNumbers(clause)
    const withoutException = clause.replace(/\bexcept\b[\s\S]*$/i, '')
    const basis = basisIn(withoutException)
    const clearing = /\bclear(?:\s+out)?\b/i.test(withoutException)

    if (floors.length === 0) {
      if (basis) {
        defaultBasis = basis
        namedDefault = true
      }
      continue
    }

    const unknown = floors.find((number) => !FLOOR_IDS.includes(`floor-${number}`))
    if (unknown != null) {
      return { ok: false, message: 'Floors here are 1 through 4.' }
    }
    if (!clearing && !basis) {
      return {
        ok: false,
        message: 'Say whether that floor should use departments, managers, or neighborhoods.',
      }
    }

    for (const number of floors) {
      instructions.set(`floor-${number}`, {
        basis: clearing && !basis ? 'clear' : basis,
        exception: exception?.name ? { name: exception.name, basis: exception.basis } : null,
      })
    }
  }

  if (instructions.size === 0 && !namedDefault) {
    return {
      ok: false,
      message: 'Name a floor and whether to use departments, managers, or neighborhoods. You can clear a floor, or call out an exception.',
    }
  }

  return {
    ok: true,
    defaultBasis,
    namedDefault,
    instructions,
  }
}

function canonicalName(name, choices) {
  const needle = name.trim().toLowerCase()
  return choices.find((choice) => choice.toLowerCase() === needle) ?? null
}

function knownNames(basis, models) {
  if (basis === 'department') return DIRECTORY_DEPARTMENTS
  if (basis === 'manager') return [...models.manager.categories.values()].map((category) => category.label)
  const names = new Set()
  for (const floorId of FLOOR_IDS) {
    for (const neighborhood of getNeighborhoodsForFloor(floorId)) names.add(neighborhood.name)
  }
  return [...names]
}

function assigneeMap(users) {
  const usersById = new Map(users.map((user) => [user.id, user]))
  const byDesk = new Map()
  for (const user of users) {
    if (user.floorId && user.deskId) byDesk.set(`${user.floorId}:${user.deskId}`, user)
  }
  return { usersById, byDesk }
}

function withManagerColor(category, managerColors) {
  if (!category || category.color) return category
  return { ...category, color: managerColors.get(category.key) ?? '#868686' }
}

function emptyCatalog(model, basis, floorId) {
  if (basis === 'clear') return []
  return stackPlanCatalog(model, basis, floorId).map((row) => ({ ...row, count: 0 }))
}

function spareColor(used) {
  const free = NEIGHBORHOOD_PALETTE.find((swatch) => !used.has(swatch.toLowerCase()))
  if (free) return free
  const hue = (used.size * 47) % 360
  return `hsl(${hue} 62% 46%)`
}

/** Keep department and neighborhood colors. Recolor a label only when it shares a swatch on this floor. */
function separateSharedColors(catalog) {
  const ranked = [...catalog].sort((a, b) => {
    if ((a.count > 0) !== (b.count > 0)) return a.count > 0 ? -1 : 1
    return Number(a.key.startsWith('mgr:')) - Number(b.key.startsWith('mgr:'))
  })
  const used = new Set()
  const assigned = new Map()
  for (const row of ranked) {
    const current = row.color?.toLowerCase()
    const color = current && !used.has(current) ? row.color : spareColor(used)
    used.add(color.toLowerCase())
    assigned.set(row.key, color)
  }
  for (const row of catalog) row.color = assigned.get(row.key) ?? row.color
}

function instructionFor(parsed, floorId) {
  return parsed.instructions.get(floorId) ?? { basis: parsed.defaultBasis, exception: null }
}

function buildFloor(floor, instruction, models, seating, managerColors) {
  const layout = deskLayoutByFloor[floor.id] ?? []
  const catalog = emptyCatalog(
    instruction.basis === 'clear' ? models.department : models[instruction.basis],
    instruction.basis,
    floor.id,
  )
  const counts = new Map(catalog.map((row) => [row.key, 0]))

  let exceptionLabel = null
  if (instruction.exception) {
    exceptionLabel = canonicalName(instruction.exception.name, knownNames(instruction.exception.basis, models))
    if (!exceptionLabel) {
      const kind = instruction.exception.basis === 'manager' ? 'manager' : instruction.exception.basis
      return { error: `Couldn't find a ${kind} named “${instruction.exception.name.trim()}”.` }
    }
  }

  const add = (category) => {
    if (!category) return
    if (!counts.has(category.key)) {
      counts.set(category.key, 0)
      catalog.push({ key: category.key, label: category.label, color: category.color, count: 0 })
    }
    counts.set(category.key, counts.get(category.key) + 1)
  }

  for (const { deskId } of layout) {
    const user = seating.byDesk.get(`${floor.id}:${deskId}`) ?? null
    if (instruction.basis === 'clear') continue
    const base = withManagerColor(
      categoryForDesk(instruction.basis, user, floor.id, deskId, seating.usersById),
      managerColors,
    )
    if (exceptionLabel && instruction.exception) {
      const peeled = withManagerColor(
        categoryForDesk(instruction.exception.basis, user, floor.id, deskId, seating.usersById),
        managerColors,
      )
      if (peeled && peeled.label.toLowerCase() === exceptionLabel.toLowerCase()) {
        add(peeled)
        continue
      }
    }
    add(base)
  }

  catalog.sort((a, b) => a.label.localeCompare(b.label))
  for (const row of catalog) row.count = counts.get(row.key) ?? 0
  separateSharedColors(catalog)

  return {
    id: floor.id,
    label: floor.label,
    total: layout.length,
    deskIds: layout.map((desk) => desk.deskId),
    catalog,
  }
}

function draftGroupType(request, parsed) {
  if (request.kind === 'basis') return request.basis === 'manager' ? 'manager' : 'department'
  const applied = FLOOR_IDS.map((floorId) => instructionFor(parsed, floorId))
  const managers = applied.filter((instruction) => instruction.basis === 'manager').length
  const departments = applied.filter((instruction) => instruction.basis === 'department').length
  return managers > departments ? 'manager' : 'department'
}

function noteFor(request, parsed) {
  if (request.kind === 'basis') return `Started from current ${BASIS_PLURAL[request.basis]}`
  return request.text.trim()
}

function basisSummary(basis) {
  if (basis === 'manager') {
    return 'I started a new stack plan from current managers. Every floor uses a desk count for each manager’s reports from the published floor plan.'
  }
  if (basis === 'neighborhood') {
    return 'I started a new stack plan from current neighborhoods. Every floor uses the neighborhood desk counts from the published floor plan.'
  }
  return 'I started a new stack plan from current departments. Every floor uses the department desk counts from the published floor plan.'
}

function describeInstruction(floor, instruction, models) {
  if (instruction.basis === 'clear') {
    return `${floor.label} is cleared, so every desk there is unassigned.`
  }
  const grouping = BASIS_PLURAL[instruction.basis]
  const exception = instruction.exception
    ? canonicalName(instruction.exception.name, knownNames(instruction.exception.basis, models))
    : null
  if (exception) {
    return `${floor.label} uses current ${grouping}, except ${exception}, which is counted as a ${instruction.exception.basis}.`
  }
  return `${floor.label} uses current ${grouping}.`
}

function stackStartSummary(request, parsed, models) {
  if (request.kind === 'basis') return basisSummary(request.basis)
  const applied = FLOOR_IDS.map((floorId) => instructionFor(parsed, floorId))
  const uniform = applied.every(
    (instruction) => instruction.basis === applied[0].basis && !instruction.exception && instruction.basis !== 'clear',
  )
  if (uniform) return basisSummary(applied[0].basis)

  const lines = ['I started a new stack plan from your description.']
  for (const floor of FLOOR_OPTIONS) {
    if (!parsed.instructions.has(floor.id)) continue
    lines.push(describeInstruction(floor, parsed.instructions.get(floor.id), models))
  }
  const unnamed = FLOOR_IDS.length - parsed.instructions.size
  if (unnamed > 0) {
    lines.push(
      parsed.namedDefault
        ? `The other floors use current ${BASIS_PLURAL[parsed.defaultBasis]}.`
        : 'The other floors stay on current departments.',
    )
  }
  return lines.join('\n\n')
}

export const STACK_START_SUGGESTIONS = [
  { id: 'department', label: 'Departments' },
  { id: 'manager', label: 'Managers' },
  { id: 'neighborhood', label: 'Neighborhoods' },
]

export const CURRENT_STACK_AGENT = {
  text: 'You’re looking at the current stack. This is the published floor plan, so these counts stay locked. Draft a new stack plan from departments, managers, or neighborhoods when you want to change allocations.',
  suggestions: STACK_START_SUGGESTIONS,
}

export function createStackDraft(users, request) {
  const parsed =
    request.kind === 'basis'
      ? {
          ok: true,
          defaultBasis: request.basis,
          namedDefault: true,
          instructions: new Map(),
        }
      : parseStackPrompt(request.text)
  if (!parsed.ok) return parsed

  const models = {
    department: buildStackPlanModel(users, 'department'),
    manager: buildStackPlanModel(users, 'manager'),
    neighborhood: buildStackPlanModel(users, 'neighborhood'),
  }
  const managerColors = new Map(
    [...models.manager.categories.values()].map((category) => [category.key, category.color]),
  )
  const seating = assigneeMap(users)
  const floors = []
  for (const floor of [...FLOOR_OPTIONS].reverse()) {
    const built = buildFloor(floor, instructionFor(parsed, floor.id), models, seating, managerColors)
    if (built.error) return { ok: false, message: built.error }
    floors.push(built)
  }

  const covered = parsed.namedDefault || [...parsed.instructions.keys()].length >= FLOOR_IDS.length
  return {
    ok: true,
    draft: {
      note: noteFor(request, parsed),
      detail: covered ? null : 'Other floors stay on current departments.',
      agentBrief: { text: stackStartSummary(request, parsed, models), suggestions: [] },
      groupType: draftGroupType(request, parsed),
      floors,
    },
  }
}

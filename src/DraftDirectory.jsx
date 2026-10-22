import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBell,
  faBuilding,
  faCalendarDays,
  faChartColumn,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faDoorOpen,
  faEllipsis,
  faGear,
  faSort,
  faMagnifyingGlass,
  faMap,
  faTableCells,
  faUsers,
} from '@fortawesome/free-solid-svg-icons'

const PEOPLE = {
  cody: { name: 'Cody Howard', initial: 'C', color: '#7d8694' },
  kathryn: { name: 'Kathryn Webb', initial: 'K', color: '#3c9a45' },
  marvin: { name: 'Marvin McKinney', initial: 'M', color: '#7b68b0' },
}

function splitStamp(value) {
  const match = value.match(/^(.*) (\d{1,2}:\d{2} [ap]m)$/i)
  return match ? `${match[1]}\n${match[2]}` : value
}

function draft(name, person, created, updated = created, status = 'in-progress') {
  return {
    id: `${status}-${name}`,
    status,
    name,
    floor: '—',
    createdOn: splitStamp(created),
    createdBy: PEOPLE[person],
    updatedOn: splitStamp(updated),
    updatedBy: PEOPLE[person],
  }
}

const DRAFTS = {
  'scenario-planning': [
    draft('Draft - 10-06-2026', 'kathryn', 'October 06, 2026 8:33 am'),
    draft('Seating Evaluation - Tanuki HQ', 'cody', 'September 09, 2026 10:54 am', 'September 09, 2026 10:34 am'),
    draft('Assign Harper - Floor 2', 'kathryn', 'September 02, 2026 11:24 am', 'September 04, 2026 12:05 pm'),
    draft('Draft - 09-03-2026', 'marvin', 'September 03, 2026 9:12 am'),
    draft('Evaluation view - department seating', 'cody', 'September 02, 2026 3:51 pm'),
    draft('Stack plan review — Tanuki Headquarters, 2 Sep', 'cody', 'September 02, 2026 3:46 pm'),
    draft('Department seating evaluation', 'cody', 'September 02, 2026 3:30 pm'),
    draft('Stack plan review — Tanuki HQ, 2 Sep', 'cody', 'September 02, 2026 3:04 pm'),
    draft('FY25 seating — Tanuki HQ', 'cody', 'August 18, 2026 2:10 pm', 'August 20, 2026 9:04 am', 'published'),
  ],
  'stack-planning': [
    draft('Q4 stack — Tanuki Headquarters', 'cody', 'October 12, 2026 9:15 am'),
    draft('Neighborhood allocation — HQ', 'kathryn', 'October 06, 2026 8:33 am'),
    draft('Manager stacking — Floor 2', 'cody', 'September 18, 2026 1:20 pm', 'September 19, 2026 4:02 pm'),
    draft('Department stack — Tanuki HQ', 'marvin', 'September 03, 2026 9:12 am'),
    draft('Current building stack', 'cody', 'September 02, 2026 3:46 pm'),
    draft('Published stack — Tanuki Headquarters', 'kathryn', 'August 12, 2026 11:00 am', 'August 14, 2026 3:22 pm', 'published'),
  ],
}

const PAGE_COPY = {
  'scenario-planning': {
    title: 'Scenario planning',
    navId: 'scenario-planning',
  },
  'stack-planning': {
    title: 'Stack planning',
    navId: 'stack-planning',
  },
}

const NAV = [
  { id: 'search', label: 'Search', icon: faMagnifyingGlass },
  { id: 'map', label: 'Map', icon: faMap },
  { id: 'schedule', label: 'Schedule', icon: faCalendarDays },
  { id: 'people', label: 'People', icon: faUsers },
  { id: 'meeting-spaces', label: 'Meeting spaces', icon: faDoorOpen },
  { id: 'analytics', label: 'Analytics', icon: faChartColumn },
]

function PersonChip({ person }) {
  const [first, ...rest] = person.name.split(' ')
  return (
    <span className="robin-person">
      <span className="robin-person-avatar" style={{ backgroundColor: person.color }} aria-hidden>
        {person.initial}
      </span>
      <span className="robin-person-name">
        <span>{first}</span>
        {rest.length ? <span>{rest.join(' ')}</span> : null}
      </span>
    </span>
  )
}

function Stamp({ value }) {
  const [date, time] = value.split('\n')
  return (
    <span className="robin-draft-time">
      <span>{date}</span>
      {time ? <span>{time}</span> : null}
    </span>
  )
}

function SortHeading({ children }) {
  return (
    <th>
      <span className="robin-draft-sort">
        {children}
        <FontAwesomeIcon icon={faSort} />
      </span>
    </th>
  )
}

function DraftDirectory({ mode, onOpenDraft, onOpenNewDraft, onNavigate }) {
  const [tab, setTab] = useState('in-progress')
  const page = PAGE_COPY[mode]
  const rows = DRAFTS[mode].filter((row) => row.status === tab)

  return (
    <div className="robin-app">
      <aside className="robin-nav" aria-label="Robin">
        <div className="robin-nav-brand">
          <span className="robin-nav-logo" aria-hidden>
            T
          </span>
          <span className="robin-nav-brand-name">Tankuki</span>
        </div>
        <nav className="robin-nav-list">
          {NAV.map((item) => (
            <button key={item.id} type="button" className="robin-nav-item">
              <FontAwesomeIcon icon={item.icon} className="robin-nav-item-icon" />
              <span>{item.label}</span>
            </button>
          ))}
          <div className="robin-nav-group">
            <div className="robin-nav-item robin-nav-item--group">
              <FontAwesomeIcon icon={faTableCells} className="robin-nav-item-icon" />
              <span>Workspace</span>
              <FontAwesomeIcon icon={faChevronRight} className="robin-nav-chevron" />
            </div>
          </div>
          <div className="robin-nav-group">
            <div className="robin-nav-item robin-nav-item--group">
              <FontAwesomeIcon icon={faBuilding} className="robin-nav-item-icon" />
              <span>Space management</span>
              <FontAwesomeIcon icon={faChevronDown} className="robin-nav-chevron" />
            </div>
            <div className="robin-nav-sublist">
              <button
                type="button"
                className={[
                  'robin-nav-subitem',
                  page.navId === 'stack-planning' ? 'robin-nav-subitem--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={page.navId === 'stack-planning' ? 'page' : undefined}
                onClick={() => onNavigate('stack-planning')}
              >
                Stack planning
              </button>
              <button
                type="button"
                className={[
                  'robin-nav-subitem',
                  page.navId === 'scenario-planning' ? 'robin-nav-subitem--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={page.navId === 'scenario-planning' ? 'page' : undefined}
                onClick={() => onNavigate('scenario-planning')}
              >
                Scenario planning
              </button>
              <button type="button" className="robin-nav-subitem">
                Layout tool
              </button>
            </div>
          </div>
          <button type="button" className="robin-nav-item">
            <FontAwesomeIcon icon={faGear} className="robin-nav-item-icon" />
            <span>Manage</span>
          </button>
        </nav>
        <div className="robin-nav-footer">
          <button type="button" className="robin-nav-collapse" aria-label="Collapse navigation">
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button type="button" className="robin-nav-item">
            <FontAwesomeIcon icon={faBell} className="robin-nav-item-icon" />
            <span>Notifications</span>
          </button>
          <button type="button" className="robin-nav-item">
            <span>Getting started</span>
            <span className="robin-nav-badge">4/6</span>
          </button>
          <button type="button" className="robin-nav-user">
            <span className="robin-person-avatar" style={{ backgroundColor: PEOPLE.cody.color }} aria-hidden>
              {PEOPLE.cody.initial}
            </span>
            <span>{PEOPLE.cody.name}</span>
            <FontAwesomeIcon icon={faChevronDown} className="robin-nav-chevron" />
          </button>
        </div>
      </aside>

      <main className="robin-directory">
        <header className="robin-directory-header">
          <h1 className="robin-directory-title">{page.title}</h1>
          <button type="button" className="robin-new-draft" onClick={onOpenNewDraft}>
            New draft
          </button>
        </header>

        <div className="robin-directory-body">
          <button type="button" className="robin-building-select">
            <FontAwesomeIcon icon={faBuilding} />
            <span>Tanuki Headquarters</span>
            <FontAwesomeIcon icon={faChevronDown} />
          </button>

          <div className="robin-directory-tabs" role="tablist" aria-label="Draft status">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'in-progress'}
              className={tab === 'in-progress' ? 'robin-directory-tab robin-directory-tab--active' : 'robin-directory-tab'}
              onClick={() => setTab('in-progress')}
            >
              In progress
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'published'}
              className={tab === 'published' ? 'robin-directory-tab robin-directory-tab--active' : 'robin-directory-tab'}
              onClick={() => setTab('published')}
            >
              Published
            </button>
          </div>

          <div className="robin-draft-table-wrap">
            <table className="robin-draft-table">
              <thead>
                <tr>
                  <SortHeading>Status</SortHeading>
                  <SortHeading>Draft name</SortHeading>
                  <SortHeading>Floor</SortHeading>
                  <SortHeading>Created on</SortHeading>
                  <SortHeading>Created by</SortHeading>
                  <SortHeading>Last updated</SortHeading>
                  <SortHeading>Last updated by</SortHeading>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="robin-draft-empty" colSpan={8}>
                      No {tab === 'published' ? 'published' : 'in progress'} drafts
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="robin-draft-row" onClick={() => onOpenDraft(row)}>
                      <td>
                        <span className={`robin-status robin-status--${row.status}`}>
                          {row.status === 'published' ? 'Published' : 'In progress'}
                        </span>
                      </td>
                      <td className="robin-draft-name">{row.name}</td>
                      <td>{row.floor}</td>
                      <td>
                        <Stamp value={row.createdOn} />
                      </td>
                      <td>
                        <PersonChip person={row.createdBy} />
                      </td>
                      <td>
                        <Stamp value={row.updatedOn} />
                      </td>
                      <td>
                        <PersonChip person={row.updatedBy} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="robin-draft-action"
                          aria-label={`Open ${row.name}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            onOpenDraft(row)
                          }}
                        >
                          <FontAwesomeIcon icon={faEllipsis} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}

export default DraftDirectory

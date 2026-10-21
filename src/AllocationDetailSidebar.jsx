import { avatarFillStyle, avatarInkColor } from './assignmentMapData.js'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChair,
  faPlus,
  faSitemap,
  faUser,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { AgentMiniPanel } from './AgentSidebar.jsx'
import { darkenHexColor, lightenHexColor } from './neighborhoodData.js'

const AVATAR_SIZE = 40

/** Bounding-box mark: square outline with corner nodes (matches design mock). */
function NeighborhoodHeaderIcon() {
  return (
    <svg
      className="allocation-detail-header-icon-svg"
      viewBox="0 0 16 16"
      width="20"
      height="20"
      aria-hidden
    >
      <rect x="3.5" y="3.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="3.5" cy="3.5" r="1.6" fill="currentColor" />
      <circle cx="12.5" cy="3.5" r="1.6" fill="currentColor" />
      <circle cx="3.5" cy="12.5" r="1.6" fill="currentColor" />
      <circle cx="12.5" cy="12.5" r="1.6" fill="currentColor" />
    </svg>
  )
}

const CATEGORY_HEADER_ICONS = {
  Department: faSitemap,
  Manager: faUser,
  Status: faChair,
}

function PersonAvatar({ user, color, size = AVATAR_SIZE }) {
  return (
    <div
      className="allocation-detail-avatar"
      style={{
        width: size,
        height: size,
        ...avatarFillStyle(color),
      }}
      aria-hidden
    >
      {user.name.charAt(0).toUpperCase()}
    </div>
  )
}

function EmptyDeskIcon({ color, size = AVATAR_SIZE }) {
  const accent = avatarInkColor(color) === '#ffffff' ? color : darkenHexColor(color, 0.72)
  return (
    <div
      className="allocation-detail-avatar allocation-detail-avatar--empty"
      style={{
        width: size,
        height: size,
        backgroundColor: lightenHexColor(color, 0.88),
        borderColor: accent,
        color: accent,
      }}
      aria-hidden
    >
      <FontAwesomeIcon icon={faPlus} />
    </div>
  )
}

/**
 * Right-hand overview when a legend allocation is selected.
 * Rows are always desk-first: desk name, then assignee or "+ Assign".
 */
function AllocationDetailSidebar({ detail, onClose, onAssignDesk, onOpenDesk, onExpandAgent }) {
  if (!detail) return null

  const categoryLabel = detail.badge || 'Allocation'
  const headerIcon = CATEGORY_HEADER_ICONS[categoryLabel]

  return (
    <div className="allocation-detail-sidebar">
      <div className="allocation-detail-main">
        <div className="allocation-detail-header">
          <div className="allocation-detail-header-main">
            <span
              className="allocation-detail-header-icon"
              style={{ backgroundColor: detail.color }}
              aria-hidden
            >
              {categoryLabel === 'Neighborhood' ? (
                <NeighborhoodHeaderIcon />
              ) : (
                <FontAwesomeIcon icon={headerIcon ?? faChair} />
              )}
            </span>
            <div className="allocation-detail-header-text">
              <h2 className="allocation-detail-title">{detail.title}</h2>
              <div className="allocation-detail-subtitle">{categoryLabel}</div>
            </div>
          </div>
          <button
            type="button"
            className="allocation-detail-close"
            aria-label="Close allocation details"
            onClick={onClose}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="allocation-detail-summary">
          <div className="allocation-detail-floor-swatches" aria-hidden>
            {(detail.floorSwatches ?? []).map((swatch) => (
              <span
                key={swatch.deskId}
                className="allocation-detail-floor-swatch"
                style={{ backgroundColor: swatch.color }}
              />
            ))}
          </div>
          <div className="allocation-detail-summary-text">{detail.summary}</div>
        </div>

        <ul className="allocation-detail-list" role="list">
          {detail.items.map((item) => {
            const assigned = Boolean(item.user)
            return (
              <li key={item.id} className="allocation-detail-row">
                <button
                  type="button"
                  className="allocation-detail-row-button"
                  onClick={() => {
                    if (assigned) onOpenDesk?.(item.deskId, item.user)
                    else onAssignDesk?.(item.deskId)
                  }}
                >
                  {assigned ? (
                    <PersonAvatar user={item.user} color={detail.color} />
                  ) : (
                    <EmptyDeskIcon color={detail.color} />
                  )}
                  <span className="allocation-detail-row-text">
                    <span className="allocation-detail-row-primary">{item.deskLabel}</span>
                    {assigned ? (
                      <span className="allocation-detail-row-secondary">
                        <FontAwesomeIcon icon={faUser} className="allocation-detail-row-icon" />
                        {item.user.name}
                      </span>
                    ) : (
                      <span className="allocation-detail-row-assign">
                        <FontAwesomeIcon icon={faPlus} className="allocation-detail-row-assign-icon" />
                        Assign
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {detail.items.length === 0 ? (
          <div className="allocation-detail-empty">Nothing on this floor</div>
        ) : null}
      </div>

      {onExpandAgent ? <AgentMiniPanel onExpand={onExpandAgent} /> : null}
    </div>
  )
}

export default AllocationDetailSidebar

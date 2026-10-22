import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUp, faCheck, faChevronRight, faEllipsis, faXmark } from '@fortawesome/free-solid-svg-icons'
import robinAvatar from './assets/robin-agent-avatar.png'

function AgentComposer({ inputId, showPrompts = true }) {
  return (
    <>
      {showPrompts ? (
        <div className="agent-sidebar-prompts">
          <button type="button" className="agent-sidebar-prompt">
            Prompt 1
          </button>
          <button type="button" className="agent-sidebar-prompt">
            Prompt 2
          </button>
        </div>
      ) : null}
      <div className="agent-sidebar-composer">
        <input
          id={inputId}
          type="text"
          className="agent-sidebar-input"
          placeholder="What can I help you with?"
          aria-label="Ask Robin"
          readOnly
        />
        <button type="button" className="agent-sidebar-send" aria-label="Send" disabled>
          <FontAwesomeIcon icon={faArrowUp} />
        </button>
      </div>
    </>
  )
}

function RobinMark() {
  return <img className="agent-chat-robin" src={robinAvatar} alt="" />
}

function AgentThinking() {
  return (
    <span className="agent-thinking" role="status" aria-label="Robin is working">
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}

function StepSpinner() {
  return (
    <span className="agent-activity-dots" aria-hidden>
      {Array.from({ length: 8 }, (_, index) => (
        <span key={index} style={{ transform: `rotate(${index * 45}deg)` }} />
      ))}
    </span>
  )
}

function AgentChat({ messages, onSuggestion }) {
  return (
    <div className="agent-chat">
      {messages.map((message) => (
        message.role === 'user' ? (
          <div className="agent-chat-user" key={message.id}>
            <div className="agent-chat-user-bubble">{message.text}</div>
            <span className="agent-chat-user-avatar" aria-hidden>C</span>
          </div>
        ) : message.spinnerOnly ? (
          <div className="agent-chat-agent agent-chat-agent--spinner" key={message.id}>
            <AgentThinking />
          </div>
        ) : (
          <div className="agent-chat-agent" key={message.id}>
            {message.id === 'welcome' ? null : <RobinMark />}
            {message.activity?.length ? (
              <ol className="agent-activity">
                {message.activity.map((step) => (
                  <li key={step.id} className={`agent-activity-step agent-activity-step--${step.state}`}>
                    <span className="agent-activity-mark" aria-hidden>
                      {step.state === 'active' ? <StepSpinner /> : <FontAwesomeIcon icon={faCheck} />}
                    </span>
                    <span className="agent-activity-label">{step.label}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            {message.loading ? <AgentThinking /> : null}
            {message.text ? (
              <div className="agent-chat-copy">
                {message.text.split('\n\n').map((paragraph, index) => (
                  <p key={`${message.id}-${index}`}>{paragraph}</p>
                ))}
              </div>
            ) : null}
            {message.suggestions?.length ? (
              <div className="agent-chat-suggestions">
                {message.suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className="agent-sidebar-prompt"
                    onClick={() => onSuggestion?.(suggestion)}
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )
      ))}
    </div>
  )
}

/** Compact agent docked under a task sidebar — header expands to the full rail. */
export function AgentMiniPanel({ onExpand }) {
  return (
    <div className="agent-mini" aria-label="Robin Agent">
      <button type="button" className="agent-mini-header" onClick={onExpand}>
        <span className="agent-mini-header-brand">
          <span className="agent-mini-header-mark" aria-hidden>
            <FontAwesomeIcon icon={faEllipsis} />
          </span>
          <span className="agent-mini-header-title">Robin Agent</span>
        </span>
        <FontAwesomeIcon icon={faChevronRight} className="agent-mini-header-chevron" aria-hidden />
        <span className="visually-hidden">Expand Robin Agent</span>
      </button>
      <div className="agent-mini-body">
        <AgentComposer inputId="agent-mini-input" />
      </div>
    </div>
  )
}

/** Placeholder Ask Robin agent rail — open panel or collapsed edge tab. */
function AgentSidebar({ open, onOpen, onClose, onExited, selectedUsers = [], brief = null, messages = null, onSuggestion, showTab = true }) {
  const layerRef = useRef(null)
  const tabRef = useRef(null)
  const panelRef = useRef(null)
  const bodyRef = useRef(null)
  const [tabTop, setTabTop] = useState(null)
  const [tabDragging, setTabDragging] = useState(false)
  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(false)

  useLayoutEffect(() => {
    if (open) {
      setMounted(true)
      setEntered(false)
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true))
      })
      return () => cancelAnimationFrame(id)
    }
    setEntered(false)
    return undefined
  }, [open])

  const handlePanelTransitionEnd = (event) => {
    if (event.target !== panelRef.current) return
    if (event.propertyName !== 'transform') return
    if (!entered) {
      setMounted(false)
      onExited?.()
    }
  }

  useEffect(() => {
    const body = bodyRef.current
    if (!body || !messages?.length) return
    body.scrollTop = body.scrollHeight
  }, [messages])

  useEffect(() => {
    if (tabTop == null) return undefined
    const clamp = () => {
      const layer = layerRef.current
      const tab = tabRef.current
      if (!layer || !tab) return
      const max = Math.max(0, layer.clientHeight - tab.offsetHeight)
      setTabTop((current) => (current == null ? current : Math.min(current, max)))
    }
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [tabTop])

  const onTabPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const layer = layerRef.current
    const tab = tabRef.current
    if (!layer || !tab) return
    event.preventDefault()
    try {
      tab.setPointerCapture(event.pointerId)
    } catch {
      /* window listeners still follow the pointer */
    }
    const originY = event.clientY
    const startTop = tab.getBoundingClientRect().top - layer.getBoundingClientRect().top
    let dragged = false

    const onMove = (ev) => {
      const dy = ev.clientY - originY
      if (!dragged && Math.abs(dy) < 4) return
      dragged = true
      setTabDragging(true)
      const max = Math.max(0, layer.clientHeight - tab.offsetHeight)
      setTabTop(Math.min(max, Math.max(0, startTop + dy)))
    }
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (ev.target instanceof Element && ev.target.hasPointerCapture?.(ev.pointerId)) {
        ev.target.releasePointerCapture(ev.pointerId)
      }
      setTabDragging(false)
      if (!dragged) onOpen()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return (
    <div className="agent-sidebar-layer" ref={layerRef}>
      {mounted ? (
        <div className="agent-sidebar-host">
          <aside
            ref={panelRef}
            className={[
              'sidebar-right-slide',
              'agent-sidebar',
              entered ? 'sidebar-right-slide--visible' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label="Robin Agent"
            onTransitionEnd={handlePanelTransitionEnd}
          >
      <div className="agent-sidebar-header">
        <div className="agent-sidebar-header-brand">
          <span className="agent-sidebar-header-mark" aria-hidden>
            <FontAwesomeIcon icon={faEllipsis} />
          </span>
          <span className="agent-sidebar-header-title">Ask Robin</span>
        </div>
        <button
          type="button"
          className="agent-sidebar-close"
          aria-label="Collapse Robin Agent"
          onClick={onClose}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="agent-sidebar-body" ref={bodyRef}>
        {messages?.length ? <AgentChat messages={messages} onSuggestion={onSuggestion} /> : null}
        {brief?.text ? (
          <div className="agent-sidebar-brief" role="status">
            {brief.text.split('\n\n').map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {brief.suggestions?.length ? (
              <div className="agent-sidebar-brief-actions">
                {brief.suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className="agent-sidebar-prompt"
                    onClick={() => onSuggestion?.(suggestion)}
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {selectedUsers.length > 0 ? (
          <div className="agent-sidebar-selection">
            <div className="agent-sidebar-selection-label">
              {selectedUsers.length} user{selectedUsers.length === 1 ? '' : 's'} selected
            </div>
            <ul className="agent-sidebar-selection-list">
              {selectedUsers.map((user) => (
                <li key={user.id}>{user.name}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="agent-sidebar-footer">
        <AgentComposer inputId="agent-sidebar-input" showPrompts={!brief?.text && !messages?.length} />
      </div>
      </aside>
        </div>
      ) : null}
      {!mounted && showTab ? (
        <button
          ref={tabRef}
          type="button"
          className={[
            'agent-sidebar-tab',
            tabTop != null ? 'agent-sidebar-tab--placed' : '',
            tabDragging ? 'agent-sidebar-tab--dragging' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={tabTop == null ? undefined : { top: tabTop }}
          aria-label="Open Robin Agent"
          onPointerDown={onTabPointerDown}
        >
          <span className="agent-sidebar-tab-grip" aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className="agent-sidebar-tab-label">Robin Agent</span>
        </button>
      ) : null}
    </div>
  )
}

export default AgentSidebar

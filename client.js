/**
 * Background jobs: a read-only, root-scoped Harness panel listing every live
 * background job with its owning workspace and session.
 *
 * Plain browser module (no build step). The Host half is empty; this file
 * registers the `main` panel and its `sidebar.panellist` entry, then reads the
 * existing `ctx.jobs` client service plus the session/workspace snapshots.
 */
;(function (root) {
  'use strict'

  const NS = 'background-jobs'
  const PANEL_ID = 'background-jobs'

  const en = {
    panel: 'Background jobs',
    title: 'Background jobs',
    subtitle: 'Running background jobs across this Harness, with the workspace and session that own them.',
    count: '{count} running',
    'status.running': 'Running',
    'status.stopping': 'Stopping',
    'group.ungrouped': 'Ungrouped',
    'group.ungroupedHint': 'The owning session is not in a workspace.',
    'group.unassigned': 'Unassigned',
    'group.unassignedHint': 'The job has no owning session.',
    'session.untitled': 'Untitled session',
    'session.open': 'Open session {title}',
    'empty.title': 'No background jobs are running',
    'empty.body': 'Jobs started in any session appear here while they run.',
    loading: 'Loading background jobs…',
    metadataUnavailable: 'Some session details are unavailable. Showing job owners by id.',
  }

  const zh = {
    panel: '后台任务',
    title: '后台任务',
    subtitle: '本机 Harness 中正在运行的后台任务，以及它们所属的 workspace 和 session。',
    count: '{count} 个运行中',
    'status.running': '运行中',
    'status.stopping': '正在停止',
    'group.ungrouped': '未分组',
    'group.ungroupedHint': '所属 session 不在任何 workspace 中。',
    'group.unassigned': '未归属',
    'group.unassignedHint': '该任务没有所属 session。',
    'session.untitled': '未命名会话',
    'session.open': '打开会话 {title}',
    'empty.title': '没有正在运行的后台任务',
    'empty.body': '任意会话启动的后台任务，在运行期间会显示在这里。',
    loading: '正在加载后台任务…',
    metadataUnavailable: '部分 session 信息不可用，暂以 id 显示任务归属。',
  }

  /** Keep only live jobs, dedupe by id, and sort by start time. */
  function mergeRunningJobs(snapshot) {
    const rows = snapshot !== null && typeof snapshot === 'object' && snapshot.rows !== null && typeof snapshot.rows === 'object'
      ? snapshot.rows
      : {}
    const byId = new Map()
    for (const list of Object.values(rows)) {
      if (!Array.isArray(list)) continue
      for (const job of list) {
        if (job === null || typeof job !== 'object') continue
        if (job.status !== 'running' && job.status !== 'stopping') continue
        byId.set(job.id, job)
      }
    }
    return [...byId.values()].sort((a, b) => a.startedAt - b.startedAt)
  }

  /** Display title for a workspace: its title, else the last path segment. */
  function workspaceLabel(workspace) {
    if (workspace === null || workspace === undefined) return ''
    if (typeof workspace.title === 'string' && workspace.title.trim() !== '') return workspace.title
    const path = typeof workspace.path === 'string' ? workspace.path : ''
    const parts = path.split('/').filter(Boolean)
    return parts.length > 0 ? parts[parts.length - 1] : path
  }

  /** Group live jobs into real workspaces, ungrouped sessions, and unassigned jobs. */
  function groupRunningJobs(jobs, sessionById, workspaceBySession) {
    const groups = new Map()
    for (const job of jobs) {
      const session = job.owner ? sessionById.get(job.owner) : undefined
      const workspace = job.owner ? workspaceBySession.get(job.owner) : undefined
      const kind = workspace ? 'workspace' : job.owner ? 'ungrouped' : 'unassigned'
      const key = workspace ? `workspace:${workspace.workspaceId}` : kind
      let group = groups.get(key)
      if (group === undefined) {
        group = { key, kind, workspace, session, jobs: [] }
        groups.set(key, group)
      }
      group.jobs.push(job)
    }
    const list = [...groups.values()]
    for (const group of list) group.jobs.sort((a, b) => a.startedAt - b.startedAt)
    list.sort((a, b) => {
      const rank = (group) => group.kind === 'workspace' ? 0 : group.kind === 'ungrouped' ? 1 : 2
      const byRank = rank(a) - rank(b)
      if (byRank !== 0) return byRank
      if (a.kind === 'workspace') return workspaceLabel(a.workspace).localeCompare(workspaceLabel(b.workspace))
      return 0
    })
    return list
  }

  /** Largest two units, localized by Intl (for example "2h 15m"). */
  function formatDuration(ms, localeId) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    const unit = (value, name) => new Intl.NumberFormat(localeId, {
      style: 'unit',
      unit: name,
      unitDisplay: 'narrow',
    }).format(value)
    if (hours > 0) return `${unit(hours, 'hour')} ${unit(minutes, 'minute')}`
    if (minutes > 0) return `${unit(minutes, 'minute')} ${unit(seconds, 'second')}`
    return unit(seconds, 'second')
  }

  /** Absolute local start time, localized by Intl. */
  function formatStarted(ms, localeId) {
    return new Intl.DateTimeFormat(localeId, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms))
  }

  /** Eight characters after the `session-` prefix, for a stable short label. */
  function shortSessionId(id) {
    const raw = String(id === undefined || id === null ? '' : id)
    const withoutPrefix = raw.startsWith('session-') ? raw.slice('session-'.length) : raw
    return withoutPrefix.slice(0, 8)
  }

  /** Session title, falling back to the short owner id or the unassigned label. */
  function sessionTitle(session, owner, t) {
    if (session !== null && session !== undefined && typeof session.title === 'string' && session.title.trim() !== '') {
      return session.title
    }
    if (owner) return shortSessionId(owner)
    return t('group.unassigned')
  }

  const helpers = {
    mergeRunningJobs,
    groupRunningJobs,
    workspaceLabel,
    formatDuration,
    formatStarted,
    shortSessionId,
    sessionTitle,
  }

  // Test hook: the Node vm harness reads the helpers without a browser.
  if (root.__BACKGROUND_JOBS_TEST__ === true) root.__BACKGROUND_JOBS_HELPERS__ = helpers

  if (typeof window === 'undefined' || !window.__ModuleLoader__) return

  window.__ModuleLoader__.load({
    id: 'dsh-view-background-jobs',
    factory(require) {
      const React = require('react')
      const h = React.createElement

      const PAGE_CSS = `
.dsh-bg-jobs-page {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-size: 14px;
  line-height: 1.6;
}
.dsh-bg-jobs-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}
.dsh-bg-jobs-content {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 clamp(24px, 4vw, 48px) 48px;
}
.dsh-bg-jobs-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-top: 28px;
  margin-bottom: 24px;
}
[data-platform='darwin'] .dsh-bg-jobs-heading {
  padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px));
}
.dsh-bg-jobs-heading-copy { min-width: 0; }
.dsh-bg-jobs-heading h1 {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 500;
}
.dsh-bg-jobs-subtitle {
  margin: 6px 0 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}
.dsh-bg-jobs-count {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 16px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  white-space: nowrap;
}
.dsh-bg-jobs-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary);
  flex: none;
}
.dsh-bg-jobs-count--idle .dsh-bg-jobs-live-dot { background: var(--dsw-alias-state-idle-primary); }
.dsh-bg-jobs-notice {
  margin: 0 0 16px;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
}
.dsh-bg-jobs-group { margin-bottom: 28px; }
.dsh-bg-jobs-group:last-child { margin-bottom: 0; }
.dsh-bg-jobs-group-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  margin: 0 0 8px;
}
.dsh-bg-jobs-group-title {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}
.dsh-bg-jobs-group-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.dsh-bg-jobs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-1);
}
.dsh-bg-jobs-row {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  gap: 12px;
  padding: 12px 14px;
  align-items: start;
}
.dsh-bg-jobs-row + .dsh-bg-jobs-row { border-top: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-bg-jobs-dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary);
}
.dsh-bg-jobs-dot--stopping { background: var(--dsw-alias-state-warn-primary); }
.dsh-bg-jobs-main { min-width: 0; }
.dsh-bg-jobs-command {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 20px;
}
.dsh-bg-jobs-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-top: 3px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.dsh-bg-jobs-sep { opacity: 0.6; }
.dsh-bg-jobs-session {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  appearance: none;
  border: 0;
  padding: 0;
  background: none;
  color: var(--dsw-alias-brand-primary);
  font: inherit;
  cursor: pointer;
}
.dsh-bg-jobs-session:hover { text-decoration: underline; }
.dsh-bg-jobs-session:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
  border-radius: 3px;
}
.dsh-bg-jobs-session--static { color: var(--dsw-alias-label-secondary); cursor: default; }
.dsh-bg-jobs-progress {
  flex-basis: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-bg-jobs-time {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}
.dsh-bg-jobs-duration {
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
}
.dsh-bg-jobs-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 320px;
  padding: 48px 0;
  text-align: center;
}
.dsh-bg-jobs-empty-icon { color: var(--dsw-alias-state-idle-primary); }
.dsh-bg-jobs-empty h2 { margin: 0; font-size: 15px; line-height: 22px; font-weight: 500; }
.dsh-bg-jobs-empty p {
  margin: 0;
  max-width: 440px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}
@media (max-width: 640px) {
  .dsh-bg-jobs-row { grid-template-columns: 10px minmax(0, 1fr); }
  .dsh-bg-jobs-time {
    grid-column: 2;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
  }
}
`

      function BackgroundJobsIcon({ size }) {
        return h('svg', {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          'aria-hidden': true,
          style: { display: 'block', pointerEvents: 'none' },
        },
          h('rect', {
            x: 3, y: 5, width: 18, height: 14, rx: 3,
            stroke: 'currentColor', strokeWidth: 1.5,
          }),
          h('path', {
            d: 'M7.5 10.5l2 1.5-2 1.5',
            stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
          }),
          h('path', {
            d: 'M12.5 13.5h4',
            stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round',
          }),
        )
      }

      function useJobsSnapshot(jobs) {
        const subscribe = React.useCallback((listener) => jobs.state.subscribe(listener), [jobs])
        const getSnapshot = React.useCallback(() => jobs.state.getSnapshot(), [jobs])
        return React.useSyncExternalStore(subscribe, getSnapshot)
      }

      function useSessionCatalog(remote) {
        const [catalog, setCatalog] = React.useState(() => ({
          liveIds: new Set(),
          byId: new Map(),
          ready: false,
          error: false,
        }))
        React.useEffect(() => {
          let active = true
          const titleOf = (summary) => summary.projections && summary.projections.values
            ? summary.projections.values.title
            : undefined
          const offAdded = remote.$on('api-session/added', (summary) => {
            if (!active || summary === null || typeof summary !== 'object') return
            setCatalog((previous) => {
              const liveIds = new Set(previous.liveIds)
              if (summary.agentAvailable) liveIds.add(summary.sessionId)
              else liveIds.delete(summary.sessionId)
              const byId = new Map(previous.byId)
              const existing = byId.get(summary.sessionId)
              byId.set(summary.sessionId, {
                sessionId: summary.sessionId,
                title: titleOf(summary) ?? existing?.title,
                cwd: summary.cwd ?? existing?.cwd,
              })
              return { ...previous, liveIds, byId }
            })
          })
          const offRemoved = remote.$on('api-session/removed', (sessionId) => {
            if (!active) return
            setCatalog((previous) => {
              if (!previous.liveIds.has(sessionId) && !previous.byId.has(sessionId)) return previous
              const liveIds = new Set(previous.liveIds)
              liveIds.delete(sessionId)
              const byId = new Map(previous.byId)
              byId.delete(sessionId)
              return { ...previous, liveIds, byId }
            })
          })
          remote.session.list({}).then((result) => {
            if (!active) return
            if (result === null || result === undefined || result.ok !== true) {
              setCatalog((previous) => ({ ...previous, ready: true, error: true }))
              return
            }
            const liveIds = new Set()
            const byId = new Map()
            for (const item of result.value.items) {
              const title = item.projections && item.projections.values ? item.projections.values.title : undefined
              byId.set(item.sessionId, { sessionId: item.sessionId, title, cwd: item.cwd })
              if (item.agentAvailable) liveIds.add(item.sessionId)
            }
            setCatalog({ liveIds, byId, ready: true, error: false })
          }).catch(() => {
            if (active) setCatalog((previous) => ({ ...previous, ready: true, error: true }))
          })
          return () => {
            active = false
            offAdded()
            offRemoved()
          }
        }, [remote])
        return catalog
      }

      function useWatchLiveSessions(jobs, sessionIds) {
        const watched = React.useRef(new Map())
        const key = sessionIds.join('\n')
        React.useEffect(() => {
          const current = watched.current
          const next = new Set(sessionIds)
          for (const [id, release] of current) {
            if (!next.has(id)) {
              release()
              current.delete(id)
            }
          }
          for (const id of next) {
            if (!current.has(id)) current.set(id, jobs.watchRows(id))
          }
        }, [jobs, key]) // sessionIds is captured by the render that produced this key
        React.useEffect(() => () => {
          for (const release of watched.current.values()) release()
          watched.current.clear()
        }, [jobs])
      }

      function useNow(active) {
        const [now, setNow] = React.useState(() => Date.now())
        React.useEffect(() => {
          if (!active) return undefined
          setNow(Date.now())
          const timer = setInterval(() => setNow(Date.now()), 1000)
          return () => clearInterval(timer)
        }, [active])
        return now
      }

      function EmptyState({ t }) {
        return h('div', { className: 'dsh-bg-jobs-empty' },
          h('svg', {
            className: 'dsh-bg-jobs-empty-icon',
            viewBox: '0 0 48 48',
            width: 48,
            height: 48,
            fill: 'none',
            'aria-hidden': true,
          },
            h('rect', {
              x: 6, y: 10, width: 36, height: 28, rx: 5,
              stroke: 'currentColor', strokeWidth: 1.5,
            }),
            h('path', {
              d: 'M13 20l4 3-4 3',
              stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
            }),
            h('path', {
              d: 'M22 26h10',
              stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round',
            }),
          ),
          h('h2', null, t('empty.title')),
          h('p', null, t('empty.body')),
        )
      }

      function JobRow({ job, sessionById, t, localeId, now, openSession }) {
        const session = job.owner ? sessionById.get(job.owner) : undefined
        const title = sessionTitle(session, job.owner, t)
        const command = typeof job.label === 'string' && job.label !== '' ? job.label : (job.kind || job.id)
        const started = formatStarted(job.startedAt, localeId)
        const duration = formatDuration(now - job.startedAt, localeId)
        const status = job.status === 'stopping' ? t('status.stopping') : t('status.running')
        const canOpen = Boolean(job.owner && session)
        return h('li', { className: 'dsh-bg-jobs-row' },
          h('span', {
            className: `dsh-bg-jobs-dot${job.status === 'stopping' ? ' dsh-bg-jobs-dot--stopping' : ''}`,
            'aria-hidden': true,
          }),
          h('div', { className: 'dsh-bg-jobs-main' },
            h('p', { className: 'dsh-bg-jobs-command', title: command }, command),
            h('div', { className: 'dsh-bg-jobs-meta' },
              h('span', null, status),
              h('span', { className: 'dsh-bg-jobs-sep', 'aria-hidden': true }, '·'),
              canOpen
                ? h('button', {
                    type: 'button',
                    className: 'dsh-bg-jobs-session',
                    title,
                    'aria-label': t('session.open', { title }),
                    onClick: () => openSession(job.owner),
                  }, title)
                : h('span', { className: 'dsh-bg-jobs-session dsh-bg-jobs-session--static', title }, title),
              job.progress ? h('span', { className: 'dsh-bg-jobs-progress' }, job.progress) : null,
            ),
          ),
          h('div', { className: 'dsh-bg-jobs-time' },
            h('span', { title: new Date(job.startedAt).toLocaleString(localeId) }, started),
            h('span', { className: 'dsh-bg-jobs-duration' }, duration),
          ),
        )
      }

      function JobGroup({ group, sessionById, t, localeId, now, openSession }) {
        const workspace = group.workspace
        const title = workspace
          ? workspaceLabel(workspace)
          : group.kind === 'ungrouped'
            ? t('group.ungrouped')
            : t('group.unassigned')
        const detail = workspace
          ? workspace.path
          : group.kind === 'ungrouped'
            ? t('group.ungroupedHint')
            : t('group.unassignedHint')
        return h('section', { className: 'dsh-bg-jobs-group' },
          h('div', { className: 'dsh-bg-jobs-group-head' },
            h('h2', { className: 'dsh-bg-jobs-group-title' }, title),
            detail ? h('span', { className: 'dsh-bg-jobs-group-path', title: detail }, detail) : null,
          ),
          h('ul', { className: 'dsh-bg-jobs-list' },
            group.jobs.map((job) => h(JobRow, {
              key: job.id,
              job,
              sessionById,
              t,
              localeId,
              now,
              openSession,
            })),
          ),
        )
      }

      function BackgroundJobsPage(props) {
        const { useWorkspaces, jobs, remote, openSession, locale, t } = props
        const workspaces = useWorkspaces((snapshot) => snapshot)
        const snapshot = useJobsSnapshot(jobs)
        const localeSnapshot = React.useSyncExternalStore(
          (listener) => locale.subscribe(listener),
          () => locale.getSnapshot(),
        )
        const localeId = localeSnapshot.active
        const workspaceItems = Array.isArray(workspaces.items) ? workspaces.items : []
        const catalog = useSessionCatalog(remote)
        const liveSessionIds = React.useMemo(() => [...catalog.liveIds], [catalog.liveIds])
        useWatchLiveSessions(jobs, liveSessionIds)
        const runningJobs = React.useMemo(() => mergeRunningJobs(snapshot), [snapshot])
        const sessionById = catalog.byId
        const workspaceBySession = React.useMemo(() => {
          const map = new Map()
          for (const workspace of workspaceItems) {
            for (const sessionId of workspace.sessionIds || []) map.set(sessionId, workspace)
          }
          return map
        }, [workspaceItems])
        const groups = React.useMemo(
          () => groupRunningJobs(runningJobs, sessionById, workspaceBySession),
          [runningJobs, sessionById, workspaceBySession],
        )
        const now = useNow(runningJobs.length > 0)
        const metadataPending = !catalog.ready || workspaces.phase === 'pending'
        const metadataError = catalog.error || workspaces.state === 'error'
        const count = runningJobs.length

        let content
        if (metadataPending && count === 0) {
          content = h('div', { className: 'dsh-bg-jobs-empty', role: 'status' },
            h('p', null, t('loading')),
          )
        } else if (count === 0) {
          content = h(EmptyState, { t })
        } else {
          content = h('div', null, groups.map((group) => h(JobGroup, {
            key: group.key,
            group,
            sessionById,
            t,
            localeId,
            now,
            openSession,
          })))
        }

        return h('div', { className: 'dsh-bg-jobs-page' },
          h('style', null, PAGE_CSS),
          h('div', { className: 'dsh-bg-jobs-scroll' },
            h('div', { className: 'dsh-bg-jobs-content' },
              h('header', { className: 'dsh-bg-jobs-heading' },
                h('div', { className: 'dsh-bg-jobs-heading-copy' },
                  h('h1', null, t('title')),
                  h('p', { className: 'dsh-bg-jobs-subtitle' }, t('subtitle')),
                ),
                h('span', {
                  className: `dsh-bg-jobs-count${count === 0 ? ' dsh-bg-jobs-count--idle' : ''}`,
                  role: 'status',
                  'aria-live': 'polite',
                },
                  h('span', { className: 'dsh-bg-jobs-live-dot', 'aria-hidden': true }),
                  t('count', { count }),
                ),
              ),
              metadataError
                ? h('p', { className: 'dsh-bg-jobs-notice', role: 'alert' }, t('metadataUnavailable'))
                : null,
              content,
            ),
          ),
        )
      }

      return {
        inject: ['slots', 'locale', 'jobs', 'sessions', 'workspaces', 'uiWorkspace', 'remote', 'remote.session'],
        apply(ctx) {
          const t = ctx.locale.bind(NS)
          ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'background-jobs: dictionaries')
          ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            inject: () => ({
              jobs: ctx.jobs,
              remote: ctx.remote,
              openSession: (sessionId) => ctx.uiWorkspace.openSession(sessionId),
              locale: ctx.locale,
            }),
          }, BackgroundJobsPage))
          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 20,
            locale: NS,
            label: () => t('panel'),
          }, BackgroundJobsIcon))
        },
      }
    },
  })
})(typeof globalThis !== 'undefined' ? globalThis : this)

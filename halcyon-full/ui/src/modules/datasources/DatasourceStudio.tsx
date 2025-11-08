import React, { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { showToast } from '@/components/Toast'
import { useDatasourceStore } from '@/store/datasourceStore'
import type { Datasource } from './types'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
  draft: 'bg-white/10 text-white border-white/20',
  disabled: 'bg-white/5 text-white/70 border-white/10',
  error: 'bg-rose-500/10 text-rose-200 border-rose-400/40',
}

const STATUS_FILTER_OPTIONS: { label: string; value: string }[] = [
  { label: 'All statuses', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Draft', value: 'draft' },
  { label: 'Disabled', value: 'disabled' },
  { label: 'Error', value: 'error' },
]

type DetailTab = 'overview' | 'versions' | 'events' | 'test' | 'secrets'

const DEFAULT_TEST_PAYLOAD = JSON.stringify(
  {
    entity: {
      id: 'event-123',
      attrs: {
        ip: '8.8.8.8',
        domain: 'example.com',
        tags: ['production'],
      },
    },
  },
  null,
  2
)

const Spinner: React.FC = () => (
  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
)

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null
  const cls = STATUS_COLORS[status] ?? 'bg-white/10 text-white border-white/20'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status.toUpperCase()}
    </span>
  )
}

function DatasourceListItem({
  item,
  isActive,
  onClick,
}: {
  item: Datasource
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border px-4 py-3 text-left transition ${
        isActive ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-white/5 bg-white/5 hover:border-white/20'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{item.name}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-white/40">{item.type}</p>
        </div>
        <StatusBadge status={item.status} />
      </div>
      {item.description && <p className="mt-2 line-clamp-2 text-xs text-white/60">{item.description}</p>}
      {item.tags?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags.map((tag) => (
            <span key={tag} className="rounded-md bg-black/40 px-2 py-0.5 text-[11px] text-white/60">
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  )
}

export function DatasourceStudio(): JSX.Element {
  const {
    items,
    load,
    loading,
    select,
    selectedId,
    detail,
    events,
    versions,
    testResult,
    filters,
    setFilters,
    clearTest,
    lifecycle,
    publish,
    rollback,
    createVersion,
    runTest,
    secrets,
    upsertSecret,
    deleteSecret,
  } = useDatasourceStore((state) => ({
    items: state.items,
    load: state.load,
    loading: state.loading,
    select: state.select,
    selectedId: state.selectedId,
    detail: state.detail,
    events: state.events,
    versions: state.versions,
    testResult: state.testResult,
    filters: state.filters,
    setFilters: state.setFilters,
    clearTest: state.clearTest,
    lifecycle: state.lifecycle,
    publish: state.publish,
    rollback: state.rollback,
    createVersion: state.createVersion,
    runTest: state.runTest,
    secrets: state.secrets,
    upsertSecret: state.upsertSecret,
    deleteSecret: state.deleteSecret,
  }))

  const [searchValue, setSearchValue] = useState(filters.search ?? '')
  const [statusFilter, setStatusFilter] = useState(filters.status ?? 'all')
  const [typeFilter, setTypeFilter] = useState(filters.type ?? '')
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const [pendingAction, setPendingAction] = useState<'start' | 'stop' | 'restart' | 'backfill' | null>(null)
  const [pendingTest, setPendingTest] = useState(false)
  const [pendingSecret, setPendingSecret] = useState(false)
  const [testPayload, setTestPayload] = useState(DEFAULT_TEST_PAYLOAD)
  const [testVersion, setTestVersion] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [secretValue, setSecretValue] = useState('')
  const [confirmPublishVersion, setConfirmPublishVersion] = useState<number | null>(null)
  const [confirmRollbackVersion, setConfirmRollbackVersion] = useState<number | null>(null)
  const [pendingVersionAction, setPendingVersionAction] = useState<'publish' | 'rollback' | null>(null)
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null)
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createType, setCreateType] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createTags, setCreateTags] = useState('')
  const [createOwner, setCreateOwner] = useState('')
  const [createOrg, setCreateOrg] = useState('')
  const [createProject, setCreateProject] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [pendingCreate, setPendingCreate] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importJson, setImportJson] = useState('{ }')
  const [importSummary, setImportSummary] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState(false)

  useEffect(() => {
    load().catch(() => undefined)
  }, [load])

  const filteredItems = useMemo(() => {
    const lower = searchValue.toLowerCase()
    return items.filter((item) => {
      const matchesSearch =
        !lower ||
        item.name.toLowerCase().includes(lower) ||
        item.type.toLowerCase().includes(lower) ||
        item.tags?.some((tag) => tag.toLowerCase().includes(lower))
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      const matchesType = !typeFilter || item.type.toLowerCase().includes(typeFilter.toLowerCase())
      return matchesSearch && matchesStatus && matchesType
    })
  }, [items, searchValue, statusFilter, typeFilter])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const storeState = useDatasourceStore.getState()
      storeState.setFilters({ ...storeState.filters, search: searchValue || undefined })
      storeState.load({ search: searchValue || undefined }).catch(() => undefined)
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [searchValue])

  useEffect(() => {
    const storeState = useDatasourceStore.getState()
    const nextFilters = {
      ...storeState.filters,
      status: statusFilter === 'all' ? undefined : statusFilter,
      type: typeFilter ? typeFilter : undefined,
    }
    storeState.setFilters(nextFilters)
    storeState.load({ status: nextFilters.status, type: nextFilters.type }).catch(() => undefined)
  }, [statusFilter, typeFilter])

  useEffect(() => {
    setActiveTab('overview')
    setTestPayload(DEFAULT_TEST_PAYLOAD)
    setTestVersion('')
    setSecretKey('')
    setSecretValue('')
    setShowImportModal(false)
    setImportError(null)
    setImportSummary('')
    setImportJson('{ }')
  }, [detail?.id])

  const handleSelect = (id: string) => {
    select(id).catch(() => undefined)
    clearTest()
  }

  const handleLifecycle = async (action: 'start' | 'stop' | 'restart' | 'backfill') => {
    if (!detail) return
    try {
      setPendingAction(action)
      await lifecycle(detail.id, action)
    } finally {
      setPendingAction(null)
    }
  }

  const openPublishDialog = (version: number) => setConfirmPublishVersion(version)
  const openRollbackDialog = (version: number) => setConfirmRollbackVersion(version)

  const confirmPublish = async () => {
    if (!detail || confirmPublishVersion === null) return
    try {
      setPendingVersionAction('publish')
      await publish(detail.id, confirmPublishVersion)
      setConfirmPublishVersion(null)
    } finally {
      setPendingVersionAction(null)
    }
  }

  const confirmRollback = async () => {
    if (!detail || confirmRollbackVersion === null) return
    try {
      setPendingVersionAction('rollback')
      await rollback(detail.id, confirmRollbackVersion)
      setConfirmRollbackVersion(null)
    } finally {
      setPendingVersionAction(null)
    }
  }

  const handleCreateVersion = async () => {
    if (!detail) return
    await createVersion(detail.id, {
      config: detail.state?.metricsSnapshot ?? {},
      summary: 'Draft generated from runtime snapshot',
    })
  }

  const handleRunTest = async () => {
    if (!detail) return
    let parsed: Record<string, any>
    try {
      parsed = testPayload ? JSON.parse(testPayload) : {}
    } catch (err: any) {
      showToast(`Test payload must be valid JSON: ${err.message}`)
      return
    }
    try {
      setPendingTest(true)
      const versionInput = testVersion.trim()
      let version: number | undefined
      if (versionInput.length > 0) {
        const numericVersion = Number(versionInput)
        if (!Number.isFinite(numericVersion)) {
          showToast('Version must be a number')
          return
        }
        version = numericVersion
      }
      await runTest(detail.id, parsed, { version })
    } finally {
      setPendingTest(false)
    }
  }

  const handleAddSecret = async () => {
    if (!detail) return
    if (!secretKey.trim() || !secretValue.trim()) {
      showToast('Secret key and value are required')
      return
    }
    try {
      setPendingSecret(true)
      await upsertSecret(detail.id, secretKey.trim(), secretValue)
      setSecretKey('')
      setSecretValue('')
    } finally {
      setPendingSecret(false)
    }
  }

  const handleConfirmDeleteSecret = async () => {
    if (!detail || !confirmDeleteKey) return
    try {
      setPendingDeleteKey(confirmDeleteKey)
      await deleteSecret(detail.id, confirmDeleteKey)
      setConfirmDeleteKey(null)
    } finally {
      setPendingDeleteKey(null)
    }
  }

  const formatDateTime = (value?: string | null) => {
    if (!value) return '—'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '—'
    return parsed.toLocaleString()
  }

  const workerStatus = detail?.state?.workerStatus?.toLowerCase()
  const datasourceStatus = detail?.status
  const isRunning = workerStatus === 'running'
  const isStarting = workerStatus === 'starting'
  const canStart = datasourceStatus === 'active' && !isRunning && !isStarting
  const canStop = datasourceStatus === 'active' && (isRunning || isStarting)
  const canRestart = datasourceStatus === 'active' && isRunning
  const canBackfill = datasourceStatus === 'active'

  const renderOverview = () => {
    if (!detail) return null
    return (
      <section className="space-y-6">
        <section className="rounded-xl border border-white/10 bg-black/20 p-5 text-white/80">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{detail.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-white/60">
                <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 font-medium uppercase tracking-wide text-[11px] text-white/70">
                  {detail.type}
                </span>
                <StatusBadge status={detail.status} />
                {detail.currentVersion !== undefined && (
                  <span className="text-white/60">Current version: v{detail.currentVersion}</span>
                )}
                {detail.state?.workerStatus && <span className="text-white/60">Worker: {detail.state.workerStatus}</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                <p className="text-white/50">Last heartbeat</p>
                <p className="mt-0.5 font-medium text-white">
                  {formatDateTime(detail.state?.lastHeartbeatAt)}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                <p className="text-white/50">Last event</p>
                <p className="mt-0.5 font-medium text-white">
                  {formatDateTime(detail.state?.lastEventAt)}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                <p className="text-white/50">Updated</p>
                <p className="mt-0.5 font-medium text-white">
                  {formatDateTime(detail.updatedAt)}
                </p>
              </div>
            </div>
          </header>
          {detail.description && <p className="mt-4 text-sm text-white/70">{detail.description}</p>}
          {detail.tags?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
          {detail.state?.errorMessage && (
            <div className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200">
              <p className="font-semibold">Worker error</p>
              <p className="mt-1 text-rose-100/80">{detail.state.errorMessage}</p>
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-white/10 bg-black/20 p-4 text-white/70">
            <h3 className="text-base font-semibold text-white">Owner / Scope</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-white/50">Owner</dt>
                <dd className="text-white">{detail.ownerId ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/50">Org</dt>
                <dd className="text-white">{detail.orgId ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/50">Project</dt>
                <dd className="text-white">{detail.projectId ?? '—'}</dd>
              </div>
            </dl>
          </article>
          <article className="rounded-xl border border-white/10 bg-black/20 p-4 text-white/70">
            <h3 className="text-base font-semibold text-white">Runtime Metrics</h3>
            <p className="mt-2 text-sm text-white/60">
              Metric snapshots will appear here once datasource telemetry is hooked up to Grafana.
            </p>
            {detail.state?.metricsSnapshot && Object.keys(detail.state.metricsSnapshot).length ? (
              <pre className="mt-3 max-h-48 overflow-auto rounded bg-black/60 p-3 text-[11px] text-white/60">
                {JSON.stringify(detail.state.metricsSnapshot, null, 2)}
              </pre>
            ) : (
              <p className="mt-3 text-xs text-white/40">No metrics emitted yet.</p>
            )}
          </article>
        </section>
      </section>
    )
  }

  const renderVersions = () => {
    if (!detail) return null
    return (
      <section className="space-y-4">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">Version History</h3>
            <p className="text-sm text-white/60">Publish or rollback configurations with full audit coverage.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10"
              onClick={handleCreateVersion}
            >
              Draft from runtime
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {versions.map((version) => {
            const isPublished = version.state === 'published'
            const inProgress = Boolean(pendingVersionAction)
            return (
              <div
                key={version.version}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-semibold">v{version.version}</span>
                    <StatusBadge status={version.state} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!isPublished && (
                      <button
                        type="button"
                        className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => openPublishDialog(version.version)}
                        disabled={inProgress}
                      >
                        Publish
                      </button>
                    )}
                    {detail.currentVersion !== version.version && (
                      <button
                        type="button"
                        className="rounded-md border border-white/20 bg-white/5 px-3 py-1 text-xs text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => openRollbackDialog(version.version)}
                        disabled={inProgress}
                      >
                        Rollback to v{version.version}
                      </button>
                    )}
                  </div>
                </div>
                <dl className="mt-2 grid gap-2 text-xs text-white/60 sm:grid-cols-2">
                  <div>
                    <dt className="text-white/40">Created</dt>
                    <dd>{formatDateTime(version.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Published</dt>
                    <dd>{formatDateTime(version.approvedAt)}</dd>
                  </div>
                </dl>
                {version.summary && <p className="mt-2 text-xs text-white/50">{version.summary}</p>}
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-white/60">View config JSON</summary>
                  <pre className="mt-2 max-h-60 overflow-auto rounded bg-black/60 p-3 text-[11px]">
                    {JSON.stringify(version.config, null, 2)}
                  </pre>
                </details>
              </div>
            )
          })}
          {!versions.length && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
              No versions yet. Draft a config or import one to get started.
            </div>
          )}
        </div>
      </section>
    )
  }

  const renderEvents = () => (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white">Audit Trail</h3>
        <p className="text-sm text-white/60">
          Every lifecycle action and secret update is captured for compliance.
        </p>
      </div>
      <div className="space-y-2">
        {events.map((event) => (
          <div
            key={event.id}
            className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/70"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-white/50">
              <span className="font-semibold text-white">{event.eventType}</span>
              <span>{formatDateTime(event.createdAt)}</span>
            </div>
            {event.actor && <p className="mt-1 text-white/60">Actor: {event.actor}</p>}
            {event.payload && Object.keys(event.payload).length > 0 ? (
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-black/60 p-3 text-[11px]">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            ) : (
              <p className="mt-2 text-white/40">No payload</p>
            )}
          </div>
        ))}
        {!events.length && (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
            No events yet. Run lifecycle actions or publish versions to build history.
          </div>
        )}
      </div>
    </section>
  )

  const renderTest = () => (
    <section className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Sandbox Test Run</h3>
          <p className="text-sm text-white/60">
            Validate mappings against sample payloads before promoting changes.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="1"
            value={testVersion}
            onChange={(e) => setTestVersion(e.target.value)}
            className="w-28 rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder-white/40 focus:border-emerald-400 focus:outline-none"
            placeholder="Version"
          />
          <button
            type="button"
            className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10"
            onClick={() => {
              setTestPayload(DEFAULT_TEST_PAYLOAD)
              setTestVersion('')
              clearTest()
            }}
          >
            Reset
          </button>
        </div>
      </div>
      <textarea
        value={testPayload}
        onChange={(e) => setTestPayload(e.target.value)}
        className="h-64 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white placeholder-white/40 focus:border-emerald-400 focus:outline-none"
        spellCheck={false}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handleRunTest}
          disabled={pendingTest}
        >
          {pendingTest && <Spinner />}
          Run Test
        </button>
        {testResult && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              testResult.success ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/20 text-rose-200'
            }`}
          >
            {testResult.success ? 'Success' : 'Failed'}
          </span>
        )}
      </div>
      {testResult && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            testResult.success
              ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
              : 'border-rose-400/40 bg-rose-500/10 text-rose-100'
          }`}
        >
          {testResult.warnings?.length ? (
            <div className="mb-3">
              <p className="font-semibold">Warnings</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {testResult.warnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {testResult.output !== undefined && (
            <div>
              <p className="font-semibold">Output</p>
              <pre className="mt-1 max-h-60 overflow-auto rounded bg-black/40 p-2 text-[11px]">
                {JSON.stringify(testResult.output, null, 2)}
              </pre>
            </div>
          )}
          {testResult.logs?.length ? (
            <div className="mt-3">
              <p className="font-semibold">Logs</p>
              <pre className="mt-1 max-h-60 overflow-auto rounded bg-black/40 p-2 text-[11px]">
                {testResult.logs.join('\n')}
              </pre>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )

  const renderSecrets = () => (
    <section className="space-y-4">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-white">Secrets</h3>
          <p className="text-sm text-white/60">
            Credentials are encrypted with AES-256-GCM; values are never displayed after creation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Secret key (e.g. api_token)"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            className="w-48 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder-white/40 focus:border-emerald-400 focus:outline-none"
          />
          <input
            type="password"
            placeholder="Secret value"
            value={secretValue}
            onChange={(e) => setSecretValue(e.target.value)}
            className="w-64 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder-white/40 focus:border-emerald-400 focus:outline-none"
          />
          {detail && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={handleAddSecret}
              disabled={pendingSecret}
            >
              {pendingSecret && <Spinner />}
              Save Secret
            </button>
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-black/40 text-xs uppercase tracking-wide text-white/40">
            <tr>
              <th className="px-4 py-2 text-left">Key</th>
              <th className="px-4 py-2 text-left">Version</th>
              <th className="px-4 py-2 text-left">Created</th>
              <th className="px-4 py-2 text-left">Rotated</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-black/20 text-white/70">
            {secrets.map((secret) => (
              <tr key={secret.key}>
                <td className="px-4 py-2 font-mono text-xs text-white">{secret.key}</td>
                <td className="px-4 py-2 text-xs text-white/70">v{secret.version}</td>
                <td className="px-4 py-2 text-xs text-white/60">
                  {formatDateTime(secret.createdAt)}
                  {secret.createdBy && <span className="block text-white/40">by {secret.createdBy}</span>}
                </td>
                <td className="px-4 py-2 text-xs text-white/60">
                  {formatDateTime(secret.rotatedAt)}
                  {secret.rotatedBy && <span className="block text-white/40">by {secret.rotatedBy}</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    className="rounded-md border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/70 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setConfirmDeleteKey(secret.key)}
                    disabled={pendingDeleteKey !== null}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!secrets.length && (
              <tr>
                <td className="px-4 py-4 text-center text-sm text-white/50" colSpan={5}>
                  No secrets defined yet. Add one above to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-white/40">
        Secret values are write-only. Rotate credentials regularly and monitor usage through the audit trail.
      </p>
    </section>
  )

  const detailTabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'versions', label: 'Versions' },
    { id: 'events', label: 'Events' },
    { id: 'test', label: 'Test Sandbox' },
    { id: 'secrets', label: 'Secrets' },
  ]

  return (
    <>
      <div className="flex h-full min-h-0 bg-surface">
        <aside className="flex w-80 min-w-[18rem] flex-col border-r border-white/10 bg-black/20">
          <div className="px-4 py-4 border-b border-white/10">
            <h2 className="text-lg font-semibold">Datasources</h2>
            <p className="mt-1 text-sm text-white/60">
              Manage connectors, versions, and secrets.
            </p>
          </div>
          <div className="border-b border-white/10 p-4">
            <input
              type="search"
              placeholder="Search datasources…"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-emerald-400 focus:outline-none"
            />
          </div>
          <div className="border-b border-white/10 p-4 space-y-3 text-xs text-white/60">
            <label className="block">
              <span className="mb-1 block text-white/40">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-white/40">Type</span>
              <input
                type="text"
                placeholder="kafka, http, webhook…"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-emerald-400 focus:outline-none"
              />
            </label>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3 text-white/60">
            {loading && !items.length ? (
              <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm">Loading datasources…</div>
            ) : filteredItems.length ? (
              filteredItems.map((item) => (
                <DatasourceListItem
                  key={item.id}
                  item={item}
                  isActive={item.id === selectedId}
                  onClick={() => handleSelect(item.id)}
                />
              ))
            ) : (
              <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm">
                <p className="font-medium text-white">No datasources yet</p>
                <p className="mt-1">Use the actions on the right to create or import a datasource.</p>
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col">
          <header className="border-b border-white/10 px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-white">Datasource Studio</h1>
                <p className="mt-1 text-sm text-white/60">
                  Visualize runtime status, publish new versions, run sandbox tests, and manage secrets.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-500/20"
                  onClick={() => {
                    setCreateError(null)
                    setShowCreateModal(true)
                  }}
                >
                  New Datasource
                </button>
                {detail && (
                  <>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-md border border-emerald-400/50 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => handleLifecycle('start')}
                      disabled={!canStart || pendingAction !== null}
                    >
                      {pendingAction === 'start' && <Spinner />}
                      Start
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => handleLifecycle('restart')}
                      disabled={!canRestart || pendingAction !== null}
                    >
                      {pendingAction === 'restart' && <Spinner />}
                      Restart
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => handleLifecycle('stop')}
                      disabled={!canStop || pendingAction !== null}
                    >
                      {pendingAction === 'stop' && <Spinner />}
                      Stop
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => handleLifecycle('backfill')}
                      disabled={!canBackfill || pendingAction !== null}
                    >
                      {pendingAction === 'backfill' && <Spinner />}
                      Queue Backfill
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => {
                    setImportError(null)
                    setImportJson('{ }')
                    setShowImportModal(true)
                  }}
                  disabled={!detail}
                >
                  Import Config
                </button>
              </div>
            </div>
          </header>

          <section className="flex-1 min-h-0 overflow-auto p-6">
            {detail ? (
              <div className="space-y-6">
                <nav className="flex flex-wrap gap-2">
                  {detailTabs.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                        activeTab === id
                          ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/40'
                          : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                      }`}
                      onClick={() => setActiveTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'versions' && renderVersions()}
                {activeTab === 'events' && renderEvents()}
                {activeTab === 'test' && renderTest()}
                {activeTab === 'secrets' && renderSecrets()}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5 p-10 text-center text-white/60">
                <h3 className="text-lg font-semibold text-white">Select a datasource to begin</h3>
                <p className="mt-2 max-w-md text-sm">
                  Choose a datasource from the left to inspect runtime health, manage versions, run sandbox tests, and
                  configure secrets. You can also create a new datasource to connect an external system.
                </p>
              </div>
            )}
          </section>
        </main>
      </div>

      <Modal
        isOpen={confirmPublishVersion !== null}
        onClose={() => {
          if (!pendingVersionAction) setConfirmPublishVersion(null)
        }}
        title="Publish version?"
      >
        <p className="text-sm text-white/70">
          Version v{confirmPublishVersion ?? ''} will become the active configuration. Running workers will restart with
          the published config.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => setConfirmPublishVersion(null)}
            disabled={pendingVersionAction !== null}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border border-emerald-400/50 bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={confirmPublish}
            disabled={pendingVersionAction !== null}
          >
            {pendingVersionAction === 'publish' && <Spinner />}
            Publish
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={confirmRollbackVersion !== null}
        onClose={() => {
          if (!pendingVersionAction) setConfirmRollbackVersion(null)
        }}
        title="Rollback datasource?"
      >
        <p className="text-sm text-white/70">
          Roll back to version v{confirmRollbackVersion ?? ''}? Worker processes will reload the selected configuration
          after rollback completes.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => setConfirmRollbackVersion(null)}
            disabled={pendingVersionAction !== null}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={confirmRollback}
            disabled={pendingVersionAction !== null}
          >
            {pendingVersionAction === 'rollback' && <Spinner />}
            Rollback
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={confirmDeleteKey !== null}
        onClose={() => {
          if (!pendingDeleteKey) setConfirmDeleteKey(null)
        }}
        title="Delete secret?"
      >
        <p className="text-sm text-white/70">
          Remove secret <span className="font-mono text-white">{confirmDeleteKey}</span>? Connectors relying on this
          credential may fail until a replacement is provided.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => setConfirmDeleteKey(null)}
            disabled={Boolean(pendingDeleteKey)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border border-rose-400/40 bg-rose-500/20 px-3 py-1.5 text-sm text-rose-100 hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleConfirmDeleteSecret}
            disabled={Boolean(pendingDeleteKey)}
          >
            {pendingDeleteKey && <Spinner />}
            Delete secret
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          if (!pendingCreate) setShowCreateModal(false)
        }}
        title="Create datasource"
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (pendingCreate) return
            setCreateError(null)
            if (!createName.trim()) {
              setCreateError('Name is required')
              return
            }
            if (!createType.trim()) {
              setCreateError('Type is required')
              return
            }
            try {
              setPendingCreate(true)
              const created = await useDatasourceStore
                .getState()
                .create({
                  name: createName.trim(),
                  description: createDescription.trim() || undefined,
                  type: createType.trim(),
                  ownerId: createOwner.trim() || undefined,
                  orgId: createOrg.trim() || undefined,
                  projectId: createProject.trim() || undefined,
                  tags: createTags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
              if (created) {
                setShowCreateModal(false)
                setCreateName('')
                setCreateType('')
                setCreateDescription('')
                setCreateTags('')
                setCreateOwner('')
                setCreateOrg('')
                setCreateProject('')
                select(created.id).catch(() => undefined)
              } else {
                setCreateError('Unable to create datasource')
              }
            } catch (err: any) {
              setCreateError(err.message || 'Failed to create datasource')
            } finally {
              setPendingCreate(false)
            }
          }}
        >
          <div className="space-y-3">
            <label className="block text-sm text-white/70">
              Name<span className="text-rose-300">*</span>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <label className="block text-sm text-white/70">
              Type<span className="text-rose-300">*</span>
              <input
                type="text"
                value={createType}
                placeholder="kafka, http_poller, webhook…"
                onChange={(e) => setCreateType(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <label className="block text-sm text-white/70">
              Description
              <textarea
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                className="mt-1 h-20 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block text-sm text-white/70">
                Owner
                <input
                  type="text"
                  value={createOwner}
                  onChange={(e) => setCreateOwner(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                />
              </label>
              <label className="block text-sm text-white/70">
                Org ID
                <input
                  type="text"
                  value={createOrg}
                  onChange={(e) => setCreateOrg(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                />
              </label>
              <label className="block text-sm text-white/70">
                Project ID
                <input
                  type="text"
                  value={createProject}
                  onChange={(e) => setCreateProject(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                />
              </label>
            </div>
            <label className="block text-sm text-white/70">
              Tags (comma separated)
              <input
                type="text"
                value={createTags}
                onChange={(e) => setCreateTags(e.target.value)}
                placeholder="production, kafka, eu-west"
                className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
              />
            </label>
          </div>
          {createError && <p className="text-sm text-rose-300">{createError}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setShowCreateModal(false)}
              disabled={pendingCreate}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={pendingCreate}
            >
              {pendingCreate && <Spinner />}
              Create datasource
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showImportModal}
        onClose={() => {
          if (!pendingImport) setShowImportModal(false)
        }}
        title={detail ? `Import config into ${detail.name}` : 'Import config'}
      >
        {detail ? (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (pendingImport) return
              setImportError(null)
              let parsed: Record<string, any>
              try {
                parsed = importJson ? JSON.parse(importJson) : {}
              } catch (err: any) {
                setImportError(`Invalid JSON: ${err.message}`)
                return
              }
              try {
                setPendingImport(true)
                await createVersion(detail.id, { config: parsed, summary: importSummary || undefined })
                setShowImportModal(false)
                setActiveTab('versions')
                setImportJson('{ }')
                setImportSummary('')
              } catch (err: any) {
                setImportError(err.message || 'Failed to import config')
              } finally {
                setPendingImport(false)
              }
            }}
          >
            <p className="text-sm text-white/60">
              Paste a datasource configuration JSON to draft a new version. It will remain a draft until you publish it.
            </p>
            <label className="block text-sm text-white/70">
              Summary / release notes
              <input
                type="text"
                value={importSummary}
                onChange={(e) => setImportSummary(e.target.value)}
                placeholder="Imported mapping from staging"
                className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <label className="block text-sm text-white/70">
              Config JSON<span className="text-rose-300">*</span>
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                className="mt-1 h-48 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 font-mono text-sm text-white focus:border-emerald-400 focus:outline-none"
                spellCheck={false}
              />
            </label>
            {importError && <p className="text-sm text-rose-300">{importError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => setShowImportModal(false)}
                disabled={pendingImport}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={pendingImport}
              >
                {pendingImport && <Spinner />}
                Import config
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-white/60">
            Select a datasource first to import a configuration into it.
          </p>
        )}
      </Modal>
    </>
  )
}


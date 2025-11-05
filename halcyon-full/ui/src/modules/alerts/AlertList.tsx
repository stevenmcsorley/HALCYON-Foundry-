import { useEffect, useState } from "react";
import { useAlertsStore } from "@/store/alertsStore";
import { useCasesStore } from "@/store/casesStore";
import { AlertDialog } from "@/components/AlertDialog";
import CaseEditor from "@/modules/cases/CaseEditor";
import { showToast } from "@/components/Toast";
import { hasRole } from "@/services/auth";

export default function AlertList({ onCaseChipClick }: { onCaseChipClick?: (caseId: number) => void }) {
  const { alerts, filters, setFilters, load, ack, resolve } = useAlertsStore();
  const { create, assignAlerts } = useCasesStore();
  const [errorDialog, setErrorDialog] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: "",
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [caseEditorOpen, setCaseEditorOpen] = useState(false);
  const [defaultCaseTitle, setDefaultCaseTitle] = useState("");
  const canEdit = hasRole("analyst") || hasRole("admin");

  useEffect(() => {
    load();
  }, [load, filters.status, filters.severity]);

  const getSeverityColor = (sev: string) => {
    if (sev === "high") return "text-red-400";
    if (sev === "medium") return "text-yellow-400";
    return "text-blue-400";
  };

  const getStatusBadge = (status: string) => {
    if (status === "open") return "bg-blue-600";
    if (status === "ack") return "bg-yellow-600";
    return "bg-gray-600";
  };

  const handleAck = async (id: number) => {
    try {
      await ack(id);
    } catch (error: any) {
      const errorMsg = error?.message || '';
      // Silently handle expected errors (auth, not found)
      if (
        errorMsg.includes('Unauthorized') || 
        errorMsg.includes('403') || 
        errorMsg.includes('404') ||
        errorMsg.includes('Not Found')
      ) {
        return;
      }
      // Only show AlertDialog for unexpected errors (5xx, network errors)
      setErrorDialog({
        isOpen: true,
        message: errorMsg || "Failed to acknowledge alert",
      });
    }
  };

  const handleResolve = async (id: number) => {
    try {
      await resolve(id);
    } catch (error: any) {
      const errorMsg = error?.message || '';
      // Silently handle expected errors (auth, not found)
      if (
        errorMsg.includes('Unauthorized') || 
        errorMsg.includes('403') || 
        errorMsg.includes('404') ||
        errorMsg.includes('Not Found')
      ) {
        return;
      }
      // Only show AlertDialog for unexpected errors (5xx, network errors)
      setErrorDialog({
        isOpen: true,
        message: errorMsg || "Failed to resolve alert",
      });
    }
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleOpenAsCase = async (caseData: any) => {
    try {
      const newCase = await create(caseData);
      await assignAlerts(newCase.id, Array.from(selectedIds));
      setSelectedIds(new Set());
      setCaseEditorOpen(false);
      await load(); // Refresh alerts to show case chips
      showToast("Case created and alerts assigned");
    } catch (error: any) {
      const errorMsg = error?.message || '';
      if (
        !errorMsg.includes('401') &&
        !errorMsg.includes('403') &&
        !errorMsg.includes('404') &&
        !errorMsg.includes('Unauthorized') &&
        !errorMsg.includes('Not Found')
      ) {
        setErrorDialog({
          isOpen: true,
          message: errorMsg || "Failed to create case",
        });
      }
    }
  };

  const handleOpenAsCaseSubmit = async (caseData: any) => {
    // Pre-fill title if not provided
    if (!caseData.title || caseData.title.trim() === "") {
      if (selectedIds.size === 0) {
        throw new Error("No alerts selected");
      }
      const selectedAlerts = alerts.filter((a) => selectedIds.has(a.id));
      if (selectedAlerts.length === 0) {
        throw new Error("No alerts selected");
      }
      const first = selectedAlerts[0];
      const sev = first.severity.toUpperCase();
      const msg = first.message || first.fingerprint || "Alert";
      caseData.title = `[${sev}] ${msg}`;
    }
    await handleOpenAsCase(caseData);
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex gap-2 items-center">
          <select
            className="bg-panel border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500"
            value={filters.status ?? ""}
            onChange={(e) => setFilters({ status: e.target.value || undefined })}
          >
            <option value="" className="bg-panel text-white">All Status</option>
            <option value="open" className="bg-panel text-white">Open</option>
            <option value="ack" className="bg-panel text-white">Acknowledged</option>
            <option value="resolved" className="bg-panel text-white">Resolved</option>
          </select>
          <select
            className="bg-panel border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500"
            value={filters.severity ?? ""}
            onChange={(e) => setFilters({ severity: e.target.value || undefined })}
          >
            <option value="" className="bg-panel text-white">All Severity</option>
            <option value="low" className="bg-panel text-white">Low</option>
            <option value="medium" className="bg-panel text-white">Medium</option>
            <option value="high" className="bg-panel text-white">High</option>
          </select>
          {canEdit && selectedIds.size > 0 && (
            <button
              onClick={() => {
                // Pre-fill title based on first selected alert
                const selectedAlerts = alerts.filter((a) => selectedIds.has(a.id));
                if (selectedAlerts.length > 0) {
                  const first = selectedAlerts[0];
                  const sev = first.severity.toUpperCase();
                  const msg = first.message || first.fingerprint || "Alert";
                  setDefaultCaseTitle(`[${sev}] ${msg}`);
                }
                setCaseEditorOpen(true);
              }}
              className="px-3 py-2 text-sm bg-teal-600 hover:bg-teal-700 rounded text-white"
            >
              Open as Case ({selectedIds.size})
            </button>
          )}
        </div>

        <div className="rounded border border-gray-800 divide-y divide-gray-800">
          {alerts.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <div className="mb-2">No alerts found</div>
              <div className="text-xs text-gray-600">
                Create a rule or generate events to see alerts here
              </div>
            </div>
          ) : (
            alerts.map((a) => (
              <div key={a.id} className="p-3 flex items-center gap-3">
                {canEdit && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    onChange={() => handleToggleSelect(a.id)}
                    className="w-4 h-4"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-xs text-gray-400">
                      {a.firstSeen ? new Date(a.firstSeen).toLocaleString() : new Date(a.createdAt).toLocaleString()}
                    </div>
                    {a.count && a.count > 1 && (
                      <div 
                        className="text-xs bg-yellow-600 px-2 py-0.5 rounded cursor-help"
                        title={`Deduped ${a.count - 1} time(s) in mute window. First seen: ${a.firstSeen ? new Date(a.firstSeen).toLocaleString() : 'N/A'}, Last seen: ${a.lastSeen ? new Date(a.lastSeen).toLocaleString() : 'N/A'}`}
                      >
                        ×{a.count}
                      </div>
                    )}
                  </div>
                  <div className="font-medium">{a.message}</div>
                  <div className="text-xs text-gray-500 flex gap-3 mt-1 flex-wrap">
                    <span className={getSeverityColor(a.severity)}>
                      severity: {a.severity}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(a.status)}`}>
                      {a.status}
                    </span>
                    {a.caseId && (
                      <span
                        className="px-2 py-0.5 rounded text-xs bg-teal-600/30 text-teal-300 border border-teal-500/50 cursor-pointer hover:bg-teal-600/40"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCaseChipClick?.(a.caseId!);
                        }}
                      >
                        Case #{a.caseId}
                      </span>
                    )}
                    {a.suppressedBy && (
                      <span
                        className="px-2 py-0.5 rounded text-xs bg-purple-600/30 text-purple-300 border border-purple-500/50 cursor-help"
                        title={`Suppressed by ${a.suppressedBy.kind}: ${a.suppressedBy.name}`}
                      >
                        Suppressed by: {a.suppressedBy.name}
                      </span>
                    )}
                    {a.entityId && <span>entity: {a.entityId}</span>}
                    {a.lastSeen && a.count && a.count > 1 && (
                      <span className="text-gray-600" title={`Last seen: ${new Date(a.lastSeen).toLocaleString()}`}>
                        last: {new Date(a.lastSeen).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {a.status === "open" && (
                    <button className="btn btn-sm" onClick={() => handleAck(a.id)}>
                      Acknowledge
                    </button>
                  )}
                  {(a.status === "open" || a.status === "ack") && (
                    <button className="btn btn-sm" onClick={() => handleResolve(a.id)}>
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <CaseEditor
        isOpen={caseEditorOpen}
        onClose={() => {
          setCaseEditorOpen(false);
          setSelectedIds(new Set());
          setDefaultCaseTitle("");
        }}
        onSubmit={handleOpenAsCaseSubmit}
        case={defaultCaseTitle ? { title: defaultCaseTitle } as any : null}
      />
      <AlertDialog
        isOpen={errorDialog.isOpen}
        onClose={() => setErrorDialog({ isOpen: false, message: "" })}
        title="Error"
        message={errorDialog.message}
        variant="error"
      />
    </>
  );
}

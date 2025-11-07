import { useEffect, useState } from "react";
import { Alert } from "@/store/alertsStore";
import DeliveryTrace from "./DeliveryTrace";
import RoutingPreview from "./RoutingPreview";
import EnrichmentPanel from "@/modules/enrichment/EnrichmentPanel";
import PlaybooksPanel from "@/modules/enrichment/PlaybooksPanel";
import { useBindingsStore } from "@/store/bindingsStore";
import { showToast } from "@/components/Toast";

interface AlertDetailsDrawerProps {
  alert: Alert;
  onClose: () => void;
}

type Tab = "details" | "trace" | "preview" | "bindings" | "enrich" | "playbooks";

export default function AlertDetailsDrawer({ alert, onClose }: AlertDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("details");
  const {
    previewByAlertId,
    auditByAlertId,
    preview,
    run,
    loadAudit,
  } = useBindingsStore();

  const previewResults = previewByAlertId[alert.id] ?? [];
  const auditEntries = auditByAlertId[alert.id] ?? [];

  useEffect(() => {
    if (activeTab === "bindings") {
      preview(alert.id).catch((error) => {
        console.warn("Failed to preview bindings", error);
      });
      loadAudit(alert.id).catch((error) => {
        console.warn("Failed to load binding audit", error);
      });
    }
  }, [activeTab, alert.id, preview, loadAudit]);

  const handleManualRun = async (bindingId: number | undefined | null) => {
    if (!bindingId) {
      showToast("Binding does not have an ID (global binding) — cannot force run.");
      return;
    }
    try {
      await run(alert.id, bindingId);
      showToast("Binding triggered");
      await loadAudit(alert.id);
    } catch (error: any) {
      showToast(error?.message || "Failed to run binding");
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "details", label: "Details" },
    { id: "trace", label: "Trace" },
    { id: "preview", label: "Preview" },
    { id: "bindings", label: "Bindings" },
    { id: "enrich", label: "Enrich" },
    { id: "playbooks", label: "Playbooks" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-panel border border-white/20 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-xl font-semibold text-white">Alert #{alert.id}</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-white border-b-2 border-teal-500"
                  : "text-white/60 hover:text-white/80"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === "details" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm text-white/60 mb-1">Message</h3>
                <p className="text-white">{alert.message}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm text-white/60 mb-1">Severity</h3>
                  <p className="text-white">{alert.severity}</p>
                </div>
                <div>
                  <h3 className="text-sm text-white/60 mb-1">Status</h3>
                  <p className="text-white">{alert.status}</p>
                </div>
                {alert.count && (
                  <div>
                    <h3 className="text-sm text-white/60 mb-1">Count</h3>
                    <p className="text-white">{alert.count}</p>
                  </div>
                )}
                {alert.entityId && (
                  <div>
                    <h3 className="text-sm text-white/60 mb-1">Entity ID</h3>
                    <p className="text-white">{alert.entityId}</p>
                  </div>
                )}
              </div>
              {alert.fingerprint && (
                <div>
                  <h3 className="text-sm text-white/60 mb-1">Fingerprint</h3>
                  <p className="text-white font-mono text-xs">{alert.fingerprint}</p>
                </div>
              )}
              {alert.suppressedBy && (
                <div>
                  <h3 className="text-sm text-white/60 mb-1">Suppressed</h3>
                  <p className="text-purple-400">
                    {alert.suppressedBy.kind}: {alert.suppressedBy.name}
                  </p>
                </div>
              )}
              <div>
                <h3 className="text-sm text-white/60 mb-1">Created</h3>
                <p className="text-white text-sm">
                  {(() => {
                    try {
                      if (!alert.createdAt) return "N/A";
                      const date = new Date(alert.createdAt);
                      return isNaN(date.getTime()) ? "Invalid Date" : date.toLocaleString();
                    } catch {
                      return "Invalid Date";
                    }
                  })()}
                </p>
              </div>
            </div>
          )}

          {activeTab === "trace" && <DeliveryTrace alertId={alert.id} />}

          {activeTab === "preview" && <RoutingPreview alertId={alert.id} />}

          {activeTab === "bindings" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-white">Binding Decisions</h3>
                <p className="text-xs text-white/60 mb-3">
                  Preview shows how bindings match this alert and highlights guardrail reasons. Manual runs override guardrails for analyst/admins.
                </p>
                <div className="overflow-hidden border border-white/10 rounded-lg">
                  <div className="grid grid-cols-12 text-xs font-semibold uppercase tracking-wide text-white/70 bg-white/10 px-3 py-2">
                    <span className="col-span-2">Binding</span>
                    <span className="col-span-2">Mode</span>
                    <span className="col-span-3">Decision</span>
                    <span className="col-span-3">Reason</span>
                    <span className="col-span-2 text-right">Action</span>
                  </div>
                  {previewResults.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-white/60">No bindings matched this alert.</div>
                  ) : (
                    previewResults.map((entry) => (
                      <div key={entry.id} className="grid grid-cols-12 items-center px-3 py-3 border-t border-white/10 text-sm text-white/80">
                        <div className="col-span-2 text-xs font-mono">{entry.bindingId ?? "global"}</div>
                        <div className="col-span-2 capitalize">{entry.mode.replace("_", " ")}</div>
                        <div className="col-span-3">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              entry.decision === "suggested"
                                ? "bg-teal-500/20 text-teal-300"
                                : entry.decision.includes("fail")
                                ? "bg-red-500/20 text-red-300"
                                : "bg-white/10 text-white"
                            }`}
                          >
                            {entry.decision}
                          </span>
                        </div>
                        <div className="col-span-3 text-xs text-white/60">
                          {entry.reason || ""}
                        </div>
                        <div className="col-span-2 text-right">
                          {entry.decision === "suggested" && (
                            <button
                              className="px-3 py-1 rounded bg-teal-600 hover:bg-teal-500 text-xs text-white"
                              onClick={() => handleManualRun(entry.bindingId)}
                            >
                              Run now
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-white">Recent Runs</h3>
                <p className="text-xs text-white/60 mb-3">Timeline of binding evaluations and runs for this alert.</p>
                <div className="space-y-3">
                  {auditEntries.length === 0 ? (
                    <div className="text-sm text-white/60">No audit entries yet.</div>
                  ) : (
                    auditEntries.map((entry) => (
                      <div key={entry.id} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80">
                        <div className="flex items-center justify-between text-xs text-white/60">
                          <span>Binding {entry.bindingId ?? "global"}</span>
                          <span>{entry.startedAt}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-white capitalize">Mode: {entry.mode.replace("_", " ")}</span>
                          <span className="text-teal-300 text-xs">Decision: {entry.decision}</span>
                        </div>
                        {entry.reason && (
                          <div className="text-xs text-yellow-300 mt-1">Reason: {entry.reason}</div>
                        )}
                        {entry.outputRef && (
                          <div className="text-xs text-white/50 mt-1">Output: {entry.outputRef}</div>
                        )}
                        {typeof entry.success === "boolean" && (
                          <div className="text-xs text-white/60 mt-1">
                            Success: {entry.success ? "yes" : "no"}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "enrich" && (
            <EnrichmentPanel subjectKind="alert" subjectId={alert.id} />
          )}

          {activeTab === "playbooks" && (
            <PlaybooksPanel subjectKind="alert" subjectId={alert.id} />
          )}
        </div>
      </div>
    </div>
  );
}


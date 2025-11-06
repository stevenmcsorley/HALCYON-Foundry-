import { useState } from "react";
import { Alert } from "@/store/alertsStore";
import DeliveryTrace from "./DeliveryTrace";
import RoutingPreview from "./RoutingPreview";
import EnrichmentPanel from "@/modules/enrichment/EnrichmentPanel";
import PlaybooksPanel from "@/modules/enrichment/PlaybooksPanel";

interface AlertDetailsDrawerProps {
  alert: Alert;
  onClose: () => void;
}

type Tab = "details" | "trace" | "preview" | "enrich" | "playbooks";

export default function AlertDetailsDrawer({ alert, onClose }: AlertDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("details");

  const tabs: { id: Tab; label: string }[] = [
    { id: "details", label: "Details" },
    { id: "trace", label: "Trace" },
    { id: "preview", label: "Preview" },
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


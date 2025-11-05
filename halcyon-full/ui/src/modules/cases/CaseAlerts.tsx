import { useState, useEffect } from "react";
import { useAlertsStore } from "@/store/alertsStore";

interface CaseAlertsProps {
  caseId: number;
  onAlertClick?: (alertId: number) => void;
}

interface Alert {
  id: number;
  message: string;
  severity: "low" | "medium" | "high";
  status: "open" | "ack" | "resolved";
  createdAt: string;
  count?: number;
}

export default function CaseAlerts({ caseId, onAlertClick }: CaseAlertsProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const { alerts: allAlerts } = useAlertsStore();

  useEffect(() => {
    // Filter alerts by caseId from the alerts store
    const linked = allAlerts.filter((a: any) => a.caseId === caseId);
    setAlerts(linked);
  }, [caseId, allAlerts]);

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

  if (loading) {
    return <div className="text-white/60 text-sm">Loading alerts...</div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">
        Linked Alerts {alerts.length > 0 && <span className="text-white/60 text-sm">({alerts.length})</span>}
      </h3>

      {alerts.length === 0 ? (
        <div className="text-white/60 text-sm">No alerts linked to this case</div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="bg-white/5 rounded p-3 border border-white/10 hover:bg-white/10 cursor-pointer transition-colors"
              onClick={() => onAlertClick?.(alert.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-medium ${getSeverityColor(alert.severity)}`}>
                      {alert.severity}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(alert.status)}`}>
                      {alert.status}
                    </span>
                    {alert.count && alert.count > 1 && (
                      <span className="text-xs text-white/60">×{alert.count}</span>
                    )}
                  </div>
                  <p className="text-sm text-white/90">{alert.message}</p>
                  <p className="text-xs text-white/60 mt-1">
                    {new Date(alert.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

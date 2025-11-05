import { useEffect, useState } from "react";
import { useAlertsStore } from "@/store/alertsStore";
import { AlertDialog } from "@/components/AlertDialog";

export default function AlertList() {
  const { alerts, filters, setFilters, load, ack, resolve } = useAlertsStore();
  const [errorDialog, setErrorDialog] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: "",
  });

  useEffect(() => {
    load();
  }, [load, filters.status, filters.severity]);

  const getSeverityColor = (sev: string) => {
    if (sev === "high") return "text-red-400";
    if (sev === "medium") return "text-yellow-400";
    return "text-blue-400";
  };

  const getStatusBadge = (status: string) => {
    if (status === "new") return "bg-blue-600";
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
            <option value="new" className="bg-panel text-white">New</option>
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
              <div key={a.id} className="p-3 flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-xs text-gray-400">
                    {new Date(a.createdAt).toLocaleString()}
                  </div>
                  <div className="font-medium">{a.message}</div>
                  <div className="text-xs text-gray-500 flex gap-3 mt-1">
                    <span className={getSeverityColor(a.severity)}>
                      severity: {a.severity}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(a.status)}`}>
                      {a.status}
                    </span>
                    {a.entityId && <span>entity: {a.entityId}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {a.status === "new" && (
                    <button className="btn btn-sm" onClick={() => handleAck(a.id)}>
                      Acknowledge
                    </button>
                  )}
                  {(a.status === "new" || a.status === "ack") && (
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

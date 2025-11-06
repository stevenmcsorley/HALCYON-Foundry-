import { useEffect, useState } from "react";
import { useActionsStore, type ActionAttempt } from "@/store/actionsStore";
import { hasRole } from "@/services/auth";
// Button component - using inline button styles
import { Badge } from "@/components/ui/badge";
import { showToast } from "@/components/Toast";

interface DeliveryTraceProps {
  alertId: number;
}

export default function DeliveryTrace({ alertId }: DeliveryTraceProps) {
  const { loadLogs, retryAllFailed } = useActionsStore();
  const [logs, setLogs] = useState<ActionAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const canEdit = hasRole("analyst") || hasRole("admin");

  useEffect(() => {
    loadData();
    // Auto-refresh every 10s when tab is focused
    const interval = setInterval(() => {
      if (!document.hidden) {
        loadData();
      }
    }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await loadLogs(alertId);
      setLogs(data);
    } catch (error) {
      // Error handled in store
    } finally {
      setLoading(false);
    }
  };

  const handleRetryAllFailed = async () => {
    setRetrying(true);
    try {
      await retryAllFailed(alertId);
      showToast("Retry scheduled for all failed destinations");
      await loadData();
    } catch (error) {
      // Error handled in store
    } finally {
      setRetrying(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "success") return "bg-green-600";
    if (status === "failed") return "bg-red-600";
    if (status === "retry" || status === "retry_scheduled") return "bg-amber-600";
    return "bg-gray-600";
  };

  const formatTimeUntil = (scheduledAt: string | null | undefined) => {
    if (!scheduledAt) return null;
    const scheduled = new Date(scheduledAt);
    const now = new Date();
    const diffMs = scheduled.getTime() - now.getTime();
    if (diffMs <= 0) return "Now";
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "<1m";
    if (diffMins < 60) return `~${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    return `~${diffHours}h`;
  };

  if (loading && logs.length === 0) {
    return <div className="text-white/60 text-sm">Loading delivery trace...</div>;
  }

  if (logs.length === 0) {
    return <div className="text-white/60 text-sm">No delivery attempts yet</div>;
  }

  const hasFailed = logs.some(l => l.status === "failed" || l.status === "retry");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Delivery Trace</h3>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            className="px-3 py-1.5 text-sm text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/20"
          >
            Refresh
          </button>
          {canEdit && hasFailed && (
            <button
              onClick={handleRetryAllFailed}
              disabled={retrying}
              className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded"
            >
              {retrying ? "Retrying..." : "Retry Failed"}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {logs.map((log) => (
          <div
            key={log.id}
            className="bg-white/5 rounded-lg p-3 border border-white/10"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge className={`${getStatusBadge(log.status)} text-white text-xs`}>
                  {log.status}
                </Badge>
                <span className="text-sm font-medium text-white">{log.dest}</span>
                <span className="text-xs text-white/60">Attempt #{log.attempt}</span>
              </div>
              {log.status === "retry" && log.scheduledAt && (
                <span className="text-xs text-amber-400">
                  Next retry in {formatTimeUntil(log.scheduledAt)}
                </span>
              )}
            </div>

            {log.httpStatus && (
              <div className="text-xs text-white/60 mb-1">
                HTTP {log.httpStatus}
              </div>
            )}

            {log.error && (
              <div className="text-xs text-red-400 mb-1 truncate" title={log.error}>
                {log.error}
              </div>
            )}

            <div className="text-xs text-white/40">
              {log.sentAt
                ? `Sent: ${new Date(log.sentAt).toLocaleString()}`
                : `Created: ${new Date(log.createdAt).toLocaleString()}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


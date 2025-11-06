import { useEffect, useState } from "react";
import { useActionsStore, type RouteDecision } from "@/store/actionsStore";
import { hasRole } from "@/services/auth";
// Button component - using inline button styles
import { showToast } from "@/components/Toast";

interface RoutingPreviewProps {
  alertId: number;
}

export default function RoutingPreview({ alertId }: RoutingPreviewProps) {
  const { previewRoutes, retry } = useActionsStore();
  const [decisions, setDecisions] = useState<RouteDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const canEdit = hasRole("analyst") || hasRole("admin");

  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId]);

  const loadPreview = async () => {
    setLoading(true);
    try {
      const data = await previewRoutes(alertId);
      setDecisions(data);
    } catch (error) {
      // Error handled in store
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (dest: string) => {
    setRetrying(dest);
    try {
      // Extract base dest (e.g., "slack:channel" -> "slack", "webhook" -> "webhook")
      const destBase = dest.split(":")[0];
      await retry(alertId, destBase);
      showToast(`Retry scheduled for ${destBase}`);
      await loadPreview();
    } catch (error) {
      // Error handled in store
    } finally {
      setRetrying(null);
    }
  };

  if (loading && decisions.length === 0) {
    return <div className="text-white/60 text-sm">Loading routing preview...</div>;
  }

  if (decisions.length === 0) {
    return <div className="text-white/60 text-sm">No routes configured</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Routing Preview</h3>
        <button
          onClick={loadPreview}
          className="px-3 py-1.5 text-sm text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/20"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {decisions.map((decision, idx) => (
          <div
            key={idx}
            className="bg-white/5 rounded-lg p-3 border border-white/10"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                {decision.wouldSend ? (
                  <span className="text-green-400 text-lg">✅</span>
                ) : decision.suppressed ? (
                  <span className="text-purple-400 text-lg">🚫</span>
                ) : (
                  <span className="text-gray-400 text-lg">⏸</span>
                )}
                <span className="text-sm font-medium text-white">{decision.dest}</span>
              </div>
              {canEdit && !decision.wouldSend && !decision.suppressed && (
                <button
                  onClick={() => handleRetry(decision.dest)}
                  disabled={retrying === decision.dest}
                  className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded"
                >
                  {retrying === decision.dest ? "Retrying..." : "Retry Now"}
                </button>
              )}
            </div>

            <div className="text-sm text-white/70 mb-1">{decision.reason}</div>

            {decision.suppressed && (
              <div className="text-xs text-purple-400">Alert is suppressed</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


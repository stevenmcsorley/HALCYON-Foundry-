import { useEffect, useState } from "react";
import { useEnrichStore } from "@/store/enrichStore";
import { hasRole } from "@/services/auth";
import { showToast } from "@/components/Toast";
import RunOutputDrawer from "./RunOutputDrawer";

interface EnrichmentPanelProps {
  subjectKind: "alert" | "case";
  subjectId: string | number;
}

export default function EnrichmentPanel({ subjectKind, subjectId }: EnrichmentPanelProps) {
  const { actions, runs, loading, listActions, runAction, listRuns } = useEnrichStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [running, setRunning] = useState<string | null>(null);
  const canRun = hasRole("analyst") || hasRole("admin");
  
  const subjectIdStr = String(subjectId);
  const runsKey = `${subjectKind}:${subjectIdStr}`;
  const subjectRuns = runs[runsKey] || [];
  const lastUsedAction = typeof localStorage !== "undefined" 
    ? localStorage.getItem("halcyon:lastEnrichAction") 
    : null;

  useEffect(() => {
    listActions();
    listRuns(subjectKind, subjectIdStr);
  }, [subjectKind, subjectIdStr, listActions, listRuns]);

  const handleRunAction = async (actionId: string) => {
    if (!canRun) return;
    
    setRunning(actionId);
    try {
      await runAction(subjectKind, subjectIdStr, actionId, false);
      showToast("Action completed successfully");
      await listRuns(subjectKind, subjectIdStr);
    } catch (error: any) {
      showToast(`Failed to run action: ${error?.message || "Unknown error"}`);
    } finally {
      setRunning(null);
    }
  };

  const filteredActions = actions.filter((action) =>
    action.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    action.kind.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    if (status === "success") return "bg-green-600";
    if (status === "failed") return "bg-red-600";
    if (status === "running") return "bg-yellow-600";
    return "bg-gray-600";
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "N/A";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="space-y-4">
      {/* Actions Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Actions</h3>
          <input
            type="text"
            placeholder="Search actions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-panel border border-white/20 rounded px-3 py-1 text-sm text-white placeholder-white/40 focus:outline-none focus:border-teal-500"
          />
        </div>
        
        {loading && actions.length === 0 ? (
          <div className="text-center text-white/60 py-4">Loading actions...</div>
        ) : filteredActions.length === 0 ? (
          <div className="text-center text-white/60 py-4">No actions found</div>
        ) : (
          <div className="space-y-2">
            {filteredActions.map((action) => (
              <div
                key={action.id}
                className="flex items-center justify-between p-3 bg-white/5 rounded border border-white/10"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{action.name}</span>
                    {lastUsedAction === action.id && (
                      <span className="text-xs bg-teal-600 px-2 py-0.5 rounded">Last used</span>
                    )}
                  </div>
                  <span className="text-xs text-white/60">{action.kind}</span>
                </div>
                {canRun && (
                  <button
                    onClick={() => handleRunAction(action.id)}
                    disabled={running === action.id}
                    className="px-3 py-1 text-sm bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white"
                  >
                    {running === action.id ? "Running..." : "Run"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History Section */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">History</h3>
        {subjectRuns.length === 0 ? (
          <div className="text-center text-white/60 py-4">No runs yet</div>
        ) : (
          <div className="space-y-2">
            {subjectRuns
              .filter((run) => run.kind === "action")
              .map((run) => (
                <div
                  key={run.id}
                  className="p-3 bg-white/5 rounded border border-white/10 cursor-pointer hover:bg-white/10"
                  onClick={() => setSelectedRun(run)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-white">
                      {run.ref?.actionId || "Unknown action"}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(run.status)}`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-white/60">
                    <span>
                      {run.startedAt
                        ? new Date(run.startedAt).toLocaleString()
                        : "N/A"}
                    </span>
                    {run.metrics?.latencyMs && (
                      <span>Duration: {formatDuration(run.metrics.latencyMs)}</span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {selectedRun && (
        <RunOutputDrawer
          run={selectedRun}
          onClose={() => setSelectedRun(null)}
          canAttachAsNote={subjectKind === "case" || (subjectKind === "alert" && selectedRun.subjectId)}
        />
      )}
    </div>
  );
}


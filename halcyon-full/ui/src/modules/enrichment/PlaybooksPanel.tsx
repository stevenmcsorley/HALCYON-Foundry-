import { useEffect, useState } from "react";
import { useEnrichStore } from "@/store/enrichStore";
import { hasRole } from "@/services/auth";
import { showToast } from "@/components/Toast";
import RunOutputDrawer from "./RunOutputDrawer";

interface PlaybooksPanelProps {
  subjectKind: "alert" | "case";
  subjectId: string | number;
}

export default function PlaybooksPanel({ subjectKind, subjectId }: PlaybooksPanelProps) {
  const { playbooks, runs, loading, listPlaybooks, runPlaybook, listRuns } = useEnrichStore();
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [running, setRunning] = useState<string | null>(null);
  const canRun = hasRole("analyst") || hasRole("admin");
  
  const subjectIdStr = String(subjectId);
  const runsKey = `${subjectKind}:${subjectIdStr}`;
  const subjectRuns = runs[runsKey] || [];
  const lastUsedPlaybook = typeof localStorage !== "undefined"
    ? localStorage.getItem("halcyon:lastEnrichPlaybook")
    : null;

  useEffect(() => {
    listPlaybooks();
    listRuns(subjectKind, subjectIdStr);
  }, [subjectKind, subjectIdStr, listPlaybooks, listRuns]);

  const handleRunPlaybook = async (playbookId: string) => {
    if (!canRun) return;
    
    setRunning(playbookId);
    try {
      await runPlaybook(subjectKind, subjectIdStr, playbookId, false);
      showToast("Playbook completed successfully");
      await listRuns(subjectKind, subjectIdStr);
    } catch (error: any) {
      showToast(`Failed to run playbook: ${error?.message || "Unknown error"}`);
    } finally {
      setRunning(null);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === "success") return "text-green-400";
    if (status === "failed") return "text-red-400";
    if (status === "running") return "text-yellow-400";
    return "text-gray-400";
  };

  const getStepStatusColor = (status: string) => {
    if (status === "success") return "bg-green-600";
    if (status === "failed") return "bg-red-600";
    if (status === "running" || status === "pending") return "bg-yellow-600";
    return "bg-gray-600";
  };

  return (
    <div className="space-y-4">
      {/* Playbooks Section */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Playbooks</h3>
        
        {loading && playbooks.length === 0 ? (
          <div className="text-center text-white/60 py-4">Loading playbooks...</div>
        ) : playbooks.length === 0 ? (
          <div className="text-center text-white/60 py-4">No playbooks available</div>
        ) : (
          <div className="space-y-2">
            {playbooks.map((playbook) => (
              <div
                key={playbook.id}
                className="flex items-center justify-between p-3 bg-white/5 rounded border border-white/10"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{playbook.name}</span>
                    {lastUsedPlaybook === playbook.id && (
                      <span className="text-xs bg-teal-600 px-2 py-0.5 rounded">Last used</span>
                    )}
                  </div>
                  <span className="text-xs text-white/60">v{playbook.version}</span>
                </div>
                {canRun && (
                  <button
                    onClick={() => handleRunPlaybook(playbook.id)}
                    disabled={running === playbook.id}
                    className="px-3 py-1 text-sm bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white"
                  >
                    {running === playbook.id ? "Running..." : "Run"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History Section */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Playbook Runs</h3>
        {subjectRuns.length === 0 ? (
          <div className="text-center text-white/60 py-4">No runs yet</div>
        ) : (
          <div className="space-y-3">
            {subjectRuns
              .filter((run) => run.kind === "playbook")
              .map((run) => (
                <div
                  key={run.id}
                  className="p-3 bg-white/5 rounded border border-white/10 cursor-pointer hover:bg-white/10"
                  onClick={() => setSelectedRun(run)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">
                      {run.ref?.playbookId || "Unknown playbook"}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(run.status)}`}>
                      {run.status}
                    </span>
                  </div>
                  
                  {run.steps && run.steps.length > 0 && (
                    <div className="flex gap-2 flex-wrap mb-2">
                      {run.steps.map((step: any, idx: number) => (
                        <span
                          key={idx}
                          className={`text-xs px-2 py-0.5 rounded ${getStepStatusColor(step.status)}`}
                          title={`${step.stepId || step.kind}: ${step.status}`}
                        >
                          {step.stepId || step.kind}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex items-center gap-4 text-xs text-white/60">
                    <span>
                      {run.startedAt
                        ? new Date(run.startedAt).toLocaleString()
                        : "N/A"}
                    </span>
                    {run.metrics?.durationMs && (
                      <span>Duration: {run.metrics.durationMs}ms</span>
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


import { Case, useCasesStore } from "@/store/casesStore";
import { hasRole } from "@/services/auth";
import { showToast } from "@/components/Toast";
import { useState } from "react";

interface CaseInsightsProps {
  caseData: Case;
  onUpdate: (updated: Case) => void;
}

export default function CaseInsights({ caseData, onUpdate }: CaseInsightsProps) {
  const { adoptPriority, adoptOwner, get } = useCasesStore();
  const [loading, setLoading] = useState<string | null>(null);
  const canEdit = hasRole("analyst") || hasRole("admin");

  const handleAdoptPriority = async () => {
    if (!caseData.prioritySuggestion) return;
    setLoading("priority");
    try {
      const updated = await adoptPriority(caseData.id);
      onUpdate(updated);
      showToast("Priority suggestion adopted");
    } catch (err: any) {
      // Error handled by store
    } finally {
      setLoading(null);
    }
  };

  const handleAdoptOwner = async () => {
    if (!caseData.ownerSuggestion) return;
    setLoading("owner");
    try {
      const updated = await adoptOwner(caseData.id);
      onUpdate(updated);
      showToast("Owner suggestion adopted");
    } catch (err: any) {
      // Error handled by store
    } finally {
      setLoading(null);
    }
  };

  const handleOpenCase = async (caseId: number) => {
    try {
      const caseData = await get(caseId);
      // Navigate to that case - emit event that App.tsx can handle
      window.dispatchEvent(new CustomEvent("navigate-to-cases", { detail: { caseId } }));
    } catch (err) {
      // Silent error
    }
  };

  const getPriorityColor = (priority?: string | null) => {
    if (!priority) return "text-white/60";
    if (priority === "critical") return "text-red-400";
    if (priority === "high") return "text-orange-400";
    if (priority === "medium") return "text-yellow-400";
    return "text-blue-400";
  };

  // Only show insights if there are any suggestions
  if (!caseData.prioritySuggestion && !caseData.ownerSuggestion && (!caseData.similarCaseIds || caseData.similarCaseIds.length === 0)) {
    return null;
  }

  return (
    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
      <h3 className="text-lg font-semibold text-white mb-4">Insights (AI)</h3>
      <div className="space-y-4">
        {caseData.prioritySuggestion && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white/60 mb-1">Suggested Priority</div>
              <div className={`text-lg font-medium ${getPriorityColor(caseData.prioritySuggestion)}`}>
                {caseData.prioritySuggestion}
              </div>
            </div>
            {canEdit && (
              <button
                onClick={handleAdoptPriority}
                disabled={loading === "priority"}
                className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 rounded text-white disabled:opacity-50"
              >
                {loading === "priority" ? "Adopting..." : "Adopt"}
              </button>
            )}
          </div>
        )}

        {caseData.ownerSuggestion && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white/60 mb-1">Suggested Owner</div>
              <div className="text-lg text-white/90">{caseData.ownerSuggestion}</div>
            </div>
            {canEdit && (
              <button
                onClick={handleAdoptOwner}
                disabled={loading === "owner"}
                className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 rounded text-white disabled:opacity-50"
              >
                {loading === "owner" ? "Adopting..." : "Adopt"}
              </button>
            )}
          </div>
        )}

        {caseData.similarCaseIds && caseData.similarCaseIds.length > 0 && (
          <div>
            <div className="text-sm text-white/60 mb-2">Related Cases</div>
            <div className="flex gap-2 flex-wrap">
              {caseData.similarCaseIds.map((id) => (
                <button
                  key={id}
                  onClick={() => handleOpenCase(id)}
                  className="px-2 py-1 text-xs bg-teal-600/30 hover:bg-teal-600/40 border border-teal-500/50 rounded text-teal-300 cursor-pointer transition-colors"
                >
                  #{id}
                </button>
              ))}
            </div>
          </div>
        )}

        {caseData.mlVersion && (
          <div className="text-xs text-white/40 pt-2 border-t border-white/10">
            ML Model: v{caseData.mlVersion}
          </div>
        )}
      </div>
    </div>
  );
}


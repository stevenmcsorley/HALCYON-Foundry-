import { useState, useEffect } from "react";
import { Case, useCasesStore } from "@/store/casesStore";
import CaseMeta from "./CaseMeta";
import CaseNotes from "./CaseNotes";
import CaseAlerts from "./CaseAlerts";
import CaseInsights from "./CaseInsights";
import CaseFeedbackList from "./CaseFeedbackList";
import EnrichmentPanel from "@/modules/enrichment/EnrichmentPanel";
import PlaybooksPanel from "@/modules/enrichment/PlaybooksPanel";

interface CaseViewProps {
  caseId: number;
  onAlertClick?: (alertId: number) => void;
}

export default function CaseView({ caseId, onAlertClick }: CaseViewProps) {
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [loading, setLoading] = useState(false);
  const { get } = useCasesStore();

  useEffect(() => {
    loadCase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const loadCase = async () => {
    setLoading(true);
    try {
      const data = await get(caseId);
      setCaseData(data);
    } catch (err) {
      setCaseData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = (updated: Case) => {
    setCaseData(updated);
    // Reload case to get fresh ML suggestions if needed
    loadCase();
  };

  if (loading) {
    return <div className="text-white/60 text-sm">Loading case...</div>;
  }

  if (!caseData) {
    return <div className="text-white/60 text-sm">Case not found</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white mb-2">{caseData.title}</h2>
        {caseData.description && (
          <p className="text-white/80 text-sm">{caseData.description}</p>
        )}
        <div className="text-xs text-white/60 mt-2">
          Created {new Date(caseData.createdAt).toLocaleString()} by {caseData.createdBy || "Unknown"}
        </div>
      </div>

      <CaseMeta caseData={caseData} onUpdate={handleUpdate} />

      <CaseInsights caseData={caseData} onUpdate={handleUpdate} />

      {import.meta.env.VITE_ENABLE_ML_FEEDBACK !== "false" && (
        <CaseFeedbackList caseId={caseId} />
      )}

      <CaseAlerts caseId={caseId} onAlertClick={onAlertClick} />

      <CaseNotes caseId={caseId} />

      <div className="border-t border-white/10 pt-6">
        <h3 className="text-lg font-semibold text-white mb-4">Enrichment</h3>
        <EnrichmentPanel subjectKind="case" subjectId={caseId} />
      </div>

      <div className="border-t border-white/10 pt-6">
        <h3 className="text-lg font-semibold text-white mb-4">Playbooks</h3>
        <PlaybooksPanel subjectKind="case" subjectId={caseId} />
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Case, useCasesStore } from "@/store/casesStore";
import CaseMeta from "./CaseMeta";
import CaseNotes from "./CaseNotes";
import CaseAlerts from "./CaseAlerts";

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

      <CaseAlerts caseId={caseId} onAlertClick={onAlertClick} />

      <CaseNotes caseId={caseId} />
    </div>
  );
}

import { useEffect, useState } from "react";
import { useCasesStore } from "@/store/casesStore";
import { hasRole } from "@/services/auth";
import { AlertDialog } from "@/components/AlertDialog";
import CasesList from "./CasesList";
import CaseView from "./CaseView";
import EmptyCaseHint from "./EmptyCaseHint";
import CaseEditor from "./CaseEditor";

function NewCaseButton({ onCreated }: { onCreated: () => void }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const { create } = useCasesStore();

  const handleCreate = async (data: any) => {
    await create(data);
    onCreated();
  };

  return (
    <>
      <button
        onClick={() => setEditorOpen(true)}
        className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 rounded text-white"
      >
        New Case
      </button>
      <CaseEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSubmit={handleCreate}
      />
    </>
  );
}

export default function CasesTab() {
  const { list, selected, setSelected } = useCasesStore();
  const [error, setError] = useState<string | null>(null);
  const canEdit = hasRole("analyst") || hasRole("admin");

  useEffect(() => {
    list().catch((e: any) => {
      const errorMsg = e?.message || "";
      // Silent for expected errors
      if (
        !errorMsg.includes("401") &&
        !errorMsg.includes("403") &&
        !errorMsg.includes("404") &&
        !errorMsg.includes("Unauthorized") &&
        !errorMsg.includes("Not Found")
      ) {
        setError(errorMsg);
      }
    });
  }, [list]);

  const handleCaseCreated = () => {
    list(); // Refresh list
  };

  const handleAlertClick = (alertId: number) => {
    // Navigate to alerts tab - this will be handled by App.tsx via callback
    // For now, just log or emit an event
    window.dispatchEvent(new CustomEvent("navigate-to-alerts", { detail: { alertId } }));
  };

  return (
    <div className="h-full grid grid-cols-12 gap-3 p-3">
      <div className="col-span-4 bg-panel rounded-2xl p-3 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Cases</h2>
          {canEdit && <NewCaseButton onCreated={handleCaseCreated} />}
        </div>
        <CasesList onSelect={setSelected} />
      </div>

      <div className="col-span-8 bg-panel rounded-2xl p-3 overflow-auto">
        {selected ? (
          <CaseView caseId={selected.id} onAlertClick={handleAlertClick} />
        ) : (
          <EmptyCaseHint />
        )}
      </div>

      {error && (
        <AlertDialog
          isOpen={true}
          title="Error"
          message={error}
          onClose={() => setError(null)}
          variant="error"
        />
      )}
    </div>
  );
}

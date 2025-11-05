import { useState } from "react";
import { Case, CaseStatus, CasePriority, useCasesStore } from "@/store/casesStore";
import { hasRole } from "@/services/auth";

interface CaseMetaProps {
  caseData: Case;
  onUpdate: (updated: Case) => void;
}

export default function CaseMeta({ caseData, onUpdate }: CaseMetaProps) {
  const [editing, setEditing] = useState<"status" | "priority" | "owner" | null>(null);
  const [value, setValue] = useState("");
  const { update } = useCasesStore();
  const canEdit = hasRole("analyst") || hasRole("admin");

  const getStatusColor = (status: CaseStatus) => {
    if (status === "open") return "bg-blue-600";
    if (status === "in_progress") return "bg-yellow-600";
    if (status === "resolved") return "bg-green-600";
    return "bg-gray-600";
  };

  const getPriorityColor = (priority: CasePriority) => {
    if (priority === "critical") return "text-red-400";
    if (priority === "high") return "text-orange-400";
    if (priority === "medium") return "text-yellow-400";
    return "text-blue-400";
  };

  const handleStartEdit = (field: "status" | "priority" | "owner") => {
    if (!canEdit) return;
    setEditing(field);
    if (field === "status") setValue(caseData.status);
    else if (field === "priority") setValue(caseData.priority);
    else setValue(caseData.owner || "");
  };

  const handleSave = async () => {
    if (!editing) return;

    try {
      const updates: Partial<Case> = {};
      if (editing === "status") updates.status = value as CaseStatus;
      else if (editing === "priority") updates.priority = value as CasePriority;
      else updates.owner = value.trim() || null;

      const updated = await update(caseData.id, updates);
      onUpdate(updated);
      setEditing(null);
    } catch (err) {
      // Error handled by store/component
      setEditing(null);
    }
  };

  const handleCancel = () => {
    setEditing(null);
    setValue("");
  };

  return (
    <div className="space-y-3 pb-4 border-b border-white/10">
      <div className="flex items-center gap-2">
        <span className="text-sm text-white/60">Status:</span>
        {editing === "status" && canEdit ? (
          <div className="flex items-center gap-2">
            <select
              className="bg-panel border border-white/20 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-teal-500"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <button
              onClick={handleSave}
              className="px-2 py-1 text-xs bg-teal-600 hover:bg-teal-700 rounded text-white"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded text-white/80"
            >
              Cancel
            </button>
          </div>
        ) : (
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(caseData.status)} ${
              canEdit ? "cursor-pointer hover:opacity-80" : ""
            }`}
            onClick={() => handleStartEdit("status")}
          >
            {caseData.status.replace("_", " ")}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-white/60">Priority:</span>
        {editing === "priority" && canEdit ? (
          <div className="flex items-center gap-2">
            <select
              className="bg-panel border border-white/20 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-teal-500"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <button
              onClick={handleSave}
              className="px-2 py-1 text-xs bg-teal-600 hover:bg-teal-700 rounded text-white"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded text-white/80"
            >
              Cancel
            </button>
          </div>
        ) : (
          <span
            className={`font-medium ${getPriorityColor(caseData.priority)} ${
              canEdit ? "cursor-pointer hover:underline" : ""
            }`}
            onClick={() => handleStartEdit("priority")}
          >
            {caseData.priority}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-white/60">Owner:</span>
        {editing === "owner" && canEdit ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="bg-panel border border-white/20 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-teal-500"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="user@example.com"
              autoFocus
            />
            <button
              onClick={handleSave}
              className="px-2 py-1 text-xs bg-teal-600 hover:bg-teal-700 rounded text-white"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded text-white/80"
            >
              Cancel
            </button>
          </div>
        ) : (
          <span
            className={`text-white/80 ${canEdit && !caseData.owner ? "cursor-pointer hover:underline" : ""}`}
            onClick={() => caseData.owner || canEdit ? handleStartEdit("owner") : undefined}
          >
            {caseData.owner || (canEdit ? "Click to assign" : "Unassigned")}
          </span>
        )}
      </div>

      {caseData.resolvedAt && (
        <div className="text-sm text-white/60">
          Resolved: {new Date(caseData.resolvedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { Case, CaseStatus, CasePriority, useCasesStore } from "@/store/casesStore";

interface CasesListProps {
  onSelect: (caseData: Case | null) => void;
}

export default function CasesList({ onSelect }: CasesListProps) {
  const { items, loading, list, selected } = useCasesStore();
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<CasePriority | "">("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params: any = {};
    if (statusFilter) params.status = statusFilter;
    if (priorityFilter) params.priority = priorityFilter;
    if (ownerFilter.trim()) params.owner = ownerFilter.trim();
    if (search.trim()) params.search = search.trim();
    list(params);
  }, [statusFilter, priorityFilter, ownerFilter, search, list]);

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

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <input
          type="text"
          className="w-full bg-panel border border-white/20 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500"
          placeholder="Search cases..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-2">
          <select
            className="bg-panel border border-white/20 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-teal-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CaseStatus | "")}
          >
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          <select
            className="bg-panel border border-white/20 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-teal-500"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as CasePriority | "")}
          >
            <option value="">All Priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <input
          type="text"
          className="w-full bg-panel border border-white/20 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-teal-500"
          placeholder="Filter by owner..."
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-white/60 text-sm text-center py-4">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-white/60 text-sm text-center py-4">No cases found</div>
      ) : (
        <div className="space-y-1">
          {items.map((caseData) => (
            <div
              key={caseData.id}
              className={`p-3 rounded border cursor-pointer transition-colors ${
                selected?.id === caseData.id
                  ? "bg-teal-600/20 border-teal-500"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
              onClick={() => onSelect(caseData)}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="font-medium text-white text-sm flex-1">{caseData.title}</h4>
                <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(caseData.status)}`}>
                  {caseData.status.replace("_", " ")}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className={getPriorityColor(caseData.priority)}>{caseData.priority}</span>
                {caseData.owner && (
                  <>
                    <span className="text-white/40">•</span>
                    <span className="text-white/60">{caseData.owner}</span>
                  </>
                )}
              </div>
              {caseData.description && (
                <p className="text-xs text-white/70 mt-1 line-clamp-2">{caseData.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

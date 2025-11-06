import { useState, useEffect } from "react";
import { Modal } from "@/components/Modal";
import { Case, CaseStatus, CasePriority } from "@/store/casesStore";

interface CaseEditorProps {
  isOpen: boolean;
  onClose: () => void;
  case?: Case | null;
  onSubmit: (data: Partial<Case>) => Promise<void>;
}

export default function CaseEditor({ isOpen, onClose, case: caseData, onSubmit }: CaseEditorProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<CasePriority>("medium");
  const [status, setStatus] = useState<CaseStatus>("open");
  const [owner, setOwner] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (caseData && (caseData as any).id) {
      // Full case object
      setTitle(caseData.title || "");
      setDescription(caseData.description || "");
      setPriority(caseData.priority || "medium");
      setStatus(caseData.status || "open");
      setOwner(caseData.owner || "");
    } else if (caseData && (caseData as any).title) {
      // Partial case data (pre-filled from alerts)
      setTitle((caseData as any).title || "");
      setDescription("");
      setPriority("medium");
      setStatus("open");
      setOwner("");
    } else {
      setTitle("");
      setDescription("");
      setPriority("medium");
      setStatus("open");
      setOwner("");
    }
    setError(null);
  }, [caseData, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Ensure priority and status are lowercase to match backend validation
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        priority: priority.toLowerCase(),
        status: status.toLowerCase(),
        owner: owner.trim() || null,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save case");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={caseData && (caseData as any).id ? "Edit Case" : "Create Case"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-600/20 border border-red-600 rounded px-3 py-2 text-red-200 text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            className="w-full bg-panel border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Description</label>
          <textarea
            className="w-full bg-panel border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500 h-24 resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">Priority</label>
            <select
              className="w-full bg-panel border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500"
              value={priority}
              onChange={(e) => setPriority(e.target.value as CasePriority)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">Status</label>
            <select
              className="w-full bg-panel border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500"
              value={status}
              onChange={(e) => setStatus(e.target.value as CaseStatus)}
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Owner</label>
          <input
            type="text"
            className="w-full bg-panel border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="user@example.com"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded text-white/80 hover:text-white hover:bg-white/10"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded bg-teal-600 hover:bg-teal-700 text-white"
            disabled={loading}
          >
            {loading ? "Saving..." : caseData ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

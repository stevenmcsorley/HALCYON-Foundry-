import { useState, useEffect } from "react";
import { CaseNote, useCasesStore } from "@/store/casesStore";
import { hasRole } from "@/services/auth";

interface CaseNotesProps {
  caseId: number;
}

export default function CaseNotes({ caseId }: CaseNotesProps) {
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { listNotes, addNote } = useCasesStore();
  const canEdit = hasRole("analyst") || hasRole("admin");

  useEffect(() => {
    loadNotes();
  }, [caseId]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const data = await listNotes(caseId);
      setNotes(data);
    } catch (err) {
      // Error handled silently by store
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !canEdit) return;

    setSubmitting(true);
    try {
      await addNote(caseId, newNote.trim());
      setNewNote("");
      await loadNotes();
    } catch (err) {
      // Error handled by store
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-white/60 text-sm">Loading notes...</div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Notes</h3>

      {notes.length === 0 ? (
        <div className="text-white/60 text-sm">No notes yet</div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="bg-white/5 rounded p-3 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white/80">
                  {note.author || "Unknown"}
                </span>
                <span className="text-xs text-white/60">
                  {new Date(note.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-white/90 whitespace-pre-wrap">{note.body}</p>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <form onSubmit={handleAddNote} className="space-y-2">
          <textarea
            className="w-full bg-panel border border-white/20 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500 h-24 resize-none"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note..."
            disabled={submitting}
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded bg-teal-600 hover:bg-teal-700 text-white text-sm"
              disabled={!newNote.trim() || submitting}
            >
              {submitting ? "Adding..." : "Add Note"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

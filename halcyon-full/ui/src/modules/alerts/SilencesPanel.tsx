import { useEffect, useState } from 'react';
import { useSuppressStore } from '@/store/suppressStore';
import { showToast } from '@/components/Toast';
import { AlertDialog } from '@/components/AlertDialog';

export default function SilencesPanel() {
  const { silences, loading, error, loadSilences, createSilence, deleteSilence } = useSuppressStore();
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    match_json: '{}',
    starts_at: '',
    ends_at: '',
    reason: '',
  });
  const [errorDialog, setErrorDialog] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: '',
  });

  useEffect(() => {
    loadSilences();
  }, [loadSilences]);

  const handleCreate = async () => {
    try {
      const matchJson = JSON.parse(formData.match_json);
      await createSilence({
        name: formData.name,
        match_json: matchJson,
        starts_at: formData.starts_at || new Date().toISOString(),
        ends_at: formData.ends_at || new Date(Date.now() + 3600000).toISOString(),
        reason: formData.reason || undefined,
      });
      showToast('Silence created');
      setShowCreate(false);
      setFormData({ name: '', match_json: '{}', starts_at: '', ends_at: '', reason: '' });
    } catch (err: any) {
      setErrorDialog({ isOpen: true, message: err?.message || 'Failed to create silence' });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSilence(id);
      showToast('Silence deleted');
    } catch (err: any) {
      setErrorDialog({ isOpen: true, message: err?.message || 'Failed to delete silence' });
    }
  };

  const now = new Date();
  const activeSilences = silences.filter((s) => {
    const end = new Date(s.ends_at);
    return end >= now;
  });

  return (
    <>
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium">Alert Silences</h3>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 rounded text-sm"
          >
            {showCreate ? 'Cancel' : 'Create Silence'}
          </button>
        </div>

        {showCreate && (
          <div className="p-4 border border-gray-700 rounded space-y-3">
            <input
              type="text"
              placeholder="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-panel border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500"
            />
            <textarea
              placeholder='Match JSON (e.g., {"type":"Event","attrs.source":"edge-1"})'
              value={formData.match_json}
              onChange={(e) => setFormData({ ...formData, match_json: e.target.value })}
              className="w-full bg-panel border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500"
              rows={3}
            />
            <input
              type="datetime-local"
              placeholder="Start time"
              value={formData.starts_at}
              onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
              className="w-full bg-panel border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500"
            />
            <input
              type="datetime-local"
              placeholder="End time"
              value={formData.ends_at}
              onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
              className="w-full bg-panel border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500"
            />
            <input
              type="text"
              placeholder="Reason (optional)"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              className="w-full bg-panel border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500"
            />
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 rounded"
            >
              Create
            </button>
          </div>
        )}

        {loading && <div className="text-gray-500 text-sm">Loading...</div>}
        {error && !loading && (
          <div className="text-red-500 text-sm">{error}</div>
        )}

        {!loading && activeSilences.length === 0 && (
          <div className="p-6 text-center text-gray-500">
            <div className="mb-2">No active silences</div>
            <div className="text-xs text-gray-600">Create a silence to suppress matching alerts</div>
          </div>
        )}

        {activeSilences.length > 0 && (
          <div className="rounded border border-gray-800 divide-y divide-gray-800">
            {activeSilences.map((s) => (
              <div key={s.id} className="p-3 flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    <div>Match: {JSON.stringify(s.match_json)}</div>
                    <div>
                      Active: {new Date(s.starts_at).toLocaleString()} → {new Date(s.ends_at).toLocaleString()}
                    </div>
                    {s.reason && <div>Reason: {s.reason}</div>}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 rounded text-sm text-red-400"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        isOpen={errorDialog.isOpen}
        title="Error"
        message={errorDialog.message}
        onClose={() => setErrorDialog({ isOpen: false, message: '' })}
      />
    </>
  );
}

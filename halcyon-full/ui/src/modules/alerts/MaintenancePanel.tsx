import { useEffect, useState } from 'react';
import { useSuppressStore } from '@/store/suppressStore';
import { showToast } from '@/components/Toast';
import { AlertDialog } from '@/components/AlertDialog';

export default function MaintenancePanel() {
  const { maintenance, loading, error, loadMaintenance, createMaintenance, deleteMaintenance } = useSuppressStore();
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
    loadMaintenance();
  }, [loadMaintenance]);

  const handleCreate = async () => {
    try {
      const matchJson = JSON.parse(formData.match_json);
      await createMaintenance({
        name: formData.name,
        match_json: matchJson,
        starts_at: formData.starts_at || new Date().toISOString(),
        ends_at: formData.ends_at || new Date(Date.now() + 3600000).toISOString(),
        reason: formData.reason || undefined,
      });
      showToast('Maintenance window created');
      setShowCreate(false);
      setFormData({ name: '', match_json: '{}', starts_at: '', ends_at: '', reason: '' });
    } catch (err: any) {
      setErrorDialog({ isOpen: true, message: err?.message || 'Failed to create maintenance window' });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMaintenance(id);
      showToast('Maintenance window deleted');
    } catch (err: any) {
      setErrorDialog({ isOpen: true, message: err?.message || 'Failed to delete maintenance window' });
    }
  };

  const now = new Date();
  const activeMaintenance = maintenance.filter((m) => {
    const end = new Date(m.ends_at);
    return end >= now;
  });

  return (
    <>
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium">Maintenance Windows</h3>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 rounded text-sm"
          >
            {showCreate ? 'Cancel' : 'Create Window'}
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

        {!loading && activeMaintenance.length === 0 && (
          <div className="p-6 text-center text-gray-500">
            <div className="mb-2">No active maintenance windows</div>
            <div className="text-xs text-gray-600">Create a window to suppress matching alerts during maintenance</div>
          </div>
        )}

        {activeMaintenance.length > 0 && (
          <div className="rounded border border-gray-800 divide-y divide-gray-800">
            {activeMaintenance.map((m) => (
              <div key={m.id} className="p-3 flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    <div>Match: {JSON.stringify(m.match_json)}</div>
                    <div>
                      Active: {new Date(m.starts_at).toLocaleString()} → {new Date(m.ends_at).toLocaleString()}
                    </div>
                    {m.reason && <div>Reason: {m.reason}</div>}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(m.id)}
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

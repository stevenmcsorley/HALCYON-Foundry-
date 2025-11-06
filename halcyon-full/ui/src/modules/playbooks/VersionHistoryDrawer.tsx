import React, { useState } from 'react';
import usePlaybooksStore from '@/store/playbooksStore';
import { showToast } from '@/components/Toast';
import { useAuthStore } from '@/store/authStore';

interface VersionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VersionHistoryDrawer: React.FC<VersionHistoryDrawerProps> = ({ isOpen, onClose }) => {
  const { current, versions, rollback } = usePlaybooksStore();
  const { user } = useAuthStore();
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const isAdmin = user?.roles?.includes('admin') || user?.roles?.includes('analyst');

  const handleRollback = async () => {
    if (!current || !selectedVersion) return;

    try {
      await rollback(current.id, selectedVersion);
      onClose();
    } catch (error: any) {
      showToast(`Rollback failed: ${error.message}`);
    }
  };

  if (!isOpen) return null;

  const currentJson = current?.jsonBody ? JSON.stringify(current.jsonBody, null, 2) : '';
  const selectedVersionData = versions.find((v) => v.version === selectedVersion);
  const selectedJson = selectedVersionData?.jsonBody
    ? JSON.stringify(selectedVersionData.jsonBody, null, 2)
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-panel rounded-xl border border-white/10 p-6 w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Version History</h3>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="text-sm font-semibold text-white mb-2">Versions</h4>
              <div className="space-y-2">
                {versions.map((version) => (
                  <div
                    key={version.version}
                    onClick={() => {
                      setSelectedVersion(version.version);
                      setShowDiff(true);
                    }}
                    className={`p-3 rounded border cursor-pointer ${
                      selectedVersion === version.version
                        ? 'border-teal-500 bg-teal-900/20'
                        : 'border-white/20 bg-surface-dark hover:bg-surface'
                    }`}
                  >
                    <div className="text-sm font-semibold text-white">
                      Version {version.version}
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      {new Date(version.createdAt).toLocaleString()}
                    </div>
                    {version.createdBy && (
                      <div className="text-xs text-white/60 mt-1">By: {version.createdBy}</div>
                    )}
                    {version.releaseNotes && (
                      <div className="text-xs text-white/80 mt-2 italic border-l-2 border-teal-500 pl-2">
                        "{version.releaseNotes}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {showDiff && selectedVersion && (
              <div>
                <h4 className="text-sm font-semibold text-white mb-2">
                  Version {selectedVersion} vs Current
                </h4>
                <div className="grid grid-cols-2 gap-2 h-96">
                  <div className="bg-surface-dark rounded p-2 overflow-auto">
                    <div className="text-xs text-white/60 mb-2">Version {selectedVersion}</div>
                    <pre className="text-xs text-white font-mono whitespace-pre-wrap">
                      {selectedJson}
                    </pre>
                  </div>
                  <div className="bg-surface-dark rounded p-2 overflow-auto">
                    <div className="text-xs text-white/60 mb-2">Current</div>
                    <pre className="text-xs text-white font-mono whitespace-pre-wrap">
                      {currentJson}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {isAdmin && selectedVersion && (
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-white/10">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleRollback}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded"
            >
              Rollback to Version {selectedVersion}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


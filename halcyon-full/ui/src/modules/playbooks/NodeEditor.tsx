import React, { useState } from 'react';
import usePlaybooksStore from '@/store/playbooksStore';

interface NodeEditorProps {
  nodeId: string;
}

export const NodeEditor: React.FC<NodeEditorProps> = ({ nodeId }) => {
  const { current, setCurrentJson, selection } = usePlaybooksStore();
  const step = current?.jsonBody.steps.find((s) => s.id === nodeId);

  if (!step || !selection.includes(nodeId)) return null;

  const handleUpdate = (updates: Partial<typeof step>) => {
    setCurrentJson((json) => {
      const steps = json.steps.map((s) =>
        s.id === nodeId ? { ...s, ...updates } : s
      );
      return { ...json, steps };
    });
  };

  const handleSetEntry = () => {
    setCurrentJson((json) => ({
      ...json,
      entry: nodeId,
    }));
  };

  const isEntry = current?.jsonBody.entry === nodeId;

  return (
    <div className="p-4 bg-surface-dark border border-white/20 rounded">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-white">Edit Step: {step.name || step.type}</h4>
        {!isEntry && (
          <button
            onClick={handleSetEntry}
            className="px-2 py-1 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded"
          >
            Set as Entry
          </button>
        )}
        {isEntry && (
          <span className="px-2 py-1 text-xs bg-green-600 text-white rounded">Entry Point</span>
        )}
      </div>

      <div className="space-y-2">
        <div>
          <label className="block text-xs text-white/80 mb-1">Name</label>
          <input
            type="text"
            value={step.name || ''}
            onChange={(e) => handleUpdate({ name: e.target.value })}
            className="w-full bg-panel border border-white/20 rounded px-2 py-1 text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 text-sm"
            placeholder={step.type}
          />
        </div>

        {step.type === 'output' && (
          <div>
            <label className="block text-xs text-white/80 mb-1">Note Text</label>
            <textarea
              value={(step.params?.text as string) || ''}
              onChange={(e) => handleUpdate({ params: { ...step.params, text: e.target.value } })}
              className="w-full bg-panel border border-white/20 rounded px-2 py-1 text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 text-sm"
              placeholder="Enter note text to attach..."
              rows={3}
            />
          </div>
        )}

        <div>
          <label className="block text-xs text-white/80 mb-1">On Fail</label>
          <select
            value={step.onFail || 'continue'}
            onChange={(e) => handleUpdate({ onFail: e.target.value as 'continue' | 'stop' })}
            className="w-full bg-panel border border-white/20 rounded px-2 py-1 text-white focus:outline-none focus:border-teal-500 text-sm"
          >
            <option value="continue" className="bg-panel text-white">Continue</option>
            <option value="stop" className="bg-panel text-white">Stop</option>
          </select>
        </div>
      </div>
    </div>
  );
};


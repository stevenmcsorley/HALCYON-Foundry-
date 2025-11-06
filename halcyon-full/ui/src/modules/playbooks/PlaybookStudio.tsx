import React, { useEffect, useState } from 'react';
import usePlaybooksStore from '@/store/playbooksStore';
import { useAuthStore } from '@/store/authStore';
import { Canvas } from './Canvas';
import { NodePalette } from './NodePalette';
import { JsonPreview } from './JsonPreview';
import { TestRunPanel } from './TestRunPanel';
import { AiAssistPanel } from './AiAssistPanel';
import { VersionHistoryDrawer } from './VersionHistoryDrawer';
import { NodeEditor } from './NodeEditor';
import { showToast } from '@/components/Toast';
import { AlertDialog } from '@/components/AlertDialog';
import type { Playbook } from './types';
import { PLAYBOOK_TEMPLATES } from './templates';

type Tab = 'json' | 'test' | 'ai' | 'versions';

export const PlaybookStudio: React.FC = () => {
  const {
    items,
    current,
    load,
    open,
    createDraft,
    setCurrentJson,
    setSelection,
    isDirty,
    selection,
  } = usePlaybooksStore();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('json');
  const [showVersionDrawer, setShowVersionDrawer] = useState(false);
  const [showNewDraftDialog, setShowNewDraftDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [newDraftName, setNewDraftName] = useState('');

  const isViewer = user?.roles?.includes('viewer') && !user?.roles?.includes('analyst') && !user?.roles?.includes('admin');
  const canEdit = !isViewer;

  useEffect(() => {
    load();
  }, [load]);

  const handleNewDraft = async (templateId?: string) => {
    if (!newDraftName.trim()) {
      showToast('Please enter a name');
      return;
    }

    try {
      let jsonBody: Playbook['jsonBody'];
      if (templateId) {
        const template = PLAYBOOK_TEMPLATES.find(t => t.id === templateId);
        if (template) {
          jsonBody = JSON.parse(JSON.stringify(template.jsonBody)); // Deep clone
        } else {
          jsonBody = { steps: [], version: '1.0.0' };
        }
      } else {
        jsonBody = { steps: [], version: '1.0.0' };
      }

      const draft = await createDraft({
        name: newDraftName,
        jsonBody,
      });
      await open(draft.id);
      setShowNewDraftDialog(false);
      setShowTemplateDialog(false);
      setNewDraftName('');
    } catch (error: any) {
      showToast(`Failed to create draft: ${error.message}`);
    }
  };

  const handleAddNode = (type: string) => {
    if (!current || !canEdit) return;

    const newId = `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newStep: any = {
      id: newId,
      type: type as any,
      name: type,
      next: [],
    };
    
    // For output steps, add default text in params
    if (type === 'output') {
      newStep.params = { text: 'Enrichment summary attached by playbook' };
    }

    setCurrentJson((json) => {
      const steps = [...json.steps, newStep];
      // Set as entry if it's the first step
      const entry = json.entry || (steps.length === 1 ? newId : json.entry);
      return { ...json, steps, entry };
    });
  };

  const handleNodeClick = (nodeId: string) => {
    setSelection([nodeId]);
  };

  const handlePublish = () => {
    load();
  };

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={current?.id || ''}
            onChange={(e) => {
              if (e.target.value) {
                open(e.target.value);
              }
            }}
            className="bg-panel border border-white/20 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500"
          >
            <option value="" className="bg-panel text-white">Select Playbook...</option>
            {items.map((item) => (
              <option key={item.id} value={item.id} className="bg-panel text-white">
                {item.name} ({item.status})
              </option>
            ))}
          </select>

          {canEdit && (
            <>
              <button
                onClick={() => setShowNewDraftDialog(true)}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded"
              >
                New Draft
              </button>
              <button
                onClick={() => setShowTemplateDialog(true)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
              >
                New from Template
              </button>
            </>
          )}

          {current && (
            <>
              <span
                className={`px-2 py-1 rounded text-xs ${
                  current.status === 'published'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-600 text-white'
                }`}
              >
                {current.status}
              </span>
              {isDirty && (
                <span className="px-2 py-1 rounded text-xs bg-yellow-600 text-white">
                  Unsaved
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Node Palette + Canvas */}
        <div className="flex flex-col w-1/2 border-r border-white/10 min-h-0">
          {canEdit && <NodePalette onAddNode={handleAddNode} />}
          <div className="flex-1 relative min-h-0" style={{ minHeight: '400px' }}>
            <Canvas onNodeClick={handleNodeClick} />
            {selection.length > 0 && canEdit && (
              <div className="absolute top-4 right-4 w-64 z-10">
                <NodeEditor nodeId={selection[0]} />
              </div>
            )}
          </div>
        </div>

        {/* Right: Tabs */}
        <div className="w-1/2 flex flex-col">
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveTab('json')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'json'
                  ? 'border-b-2 border-white text-white'
                  : 'opacity-70 hover:opacity-100 text-white'
              }`}
            >
              JSON
            </button>
            {canEdit && (
              <>
                <button
                  onClick={() => setActiveTab('test')}
                  className={`px-4 py-2 text-sm font-medium ${
                    activeTab === 'test'
                      ? 'border-b-2 border-white text-white'
                      : 'opacity-70 hover:opacity-100 text-white'
                  }`}
                >
                  Test Run
                </button>
                <button
                  onClick={() => setActiveTab('ai')}
                  className={`px-4 py-2 text-sm font-medium ${
                    activeTab === 'ai'
                      ? 'border-b-2 border-white text-white'
                      : 'opacity-70 hover:opacity-100 text-white'
                  }`}
                >
                  AI Assist
                </button>
              </>
            )}
            <button
              onClick={() => {
                setActiveTab('versions');
                setShowVersionDrawer(true);
              }}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'versions'
                  ? 'border-b-2 border-white text-white'
                  : 'opacity-70 hover:opacity-100 text-white'
              }`}
            >
              Versions
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === 'json' && <JsonPreview onPublish={handlePublish} onRollback={() => setShowVersionDrawer(true)} />}
            {activeTab === 'test' && canEdit && <TestRunPanel />}
            {activeTab === 'ai' && canEdit && <AiAssistPanel />}
            {activeTab === 'versions' && (
              <div className="p-4 text-white/60 text-sm">
                Click "Versions" tab to view version history
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Draft Dialog */}
      {showNewDraftDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-panel rounded-xl border border-white/10 p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">New Draft</h3>
            <input
              type="text"
              value={newDraftName}
              onChange={(e) => setNewDraftName(e.target.value)}
              placeholder="Playbook name"
              className="w-full bg-panel border border-white/20 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 mb-4"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleNewDraft();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowNewDraftDialog(false);
                  setNewDraftName('');
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleNewDraft}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Dialog */}
      {showTemplateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-panel rounded-xl border border-white/10 p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-4">New from Template</h3>
            <input
              type="text"
              value={newDraftName}
              onChange={(e) => setNewDraftName(e.target.value)}
              placeholder="Playbook name"
              className="w-full bg-panel border border-white/20 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 mb-4"
            />
            <div className="space-y-3 mb-4">
              {PLAYBOOK_TEMPLATES.map((template) => (
                <div
                  key={template.id}
                  className="p-4 bg-surface-dark border border-white/10 rounded cursor-pointer hover:border-teal-500 transition-colors"
                  onClick={() => {
                    if (newDraftName.trim()) {
                      handleNewDraft(template.id);
                    } else {
                      setNewDraftName(template.name);
                    }
                  }}
                >
                  <div className="font-semibold text-white mb-1">{template.name}</div>
                  <div className="text-sm text-white/60">{template.description}</div>
                  <div className="text-xs text-white/40 mt-2">
                    {template.jsonBody.steps.length} steps
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowTemplateDialog(false);
                  setNewDraftName('');
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version History Drawer */}
      <VersionHistoryDrawer
        isOpen={showVersionDrawer}
        onClose={() => {
          setShowVersionDrawer(false);
          setActiveTab('json');
        }}
      />
    </div>
  );
};


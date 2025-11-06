import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import usePlaybooksStore from '@/store/playbooksStore';
import { AlertDialog } from '@/components/AlertDialog';
import { showToast } from '@/components/Toast';
import type { Playbook } from './types';

interface JsonPreviewProps {
  onPublish?: () => void;
  onRollback?: () => void;
}

export const JsonPreview: React.FC<JsonPreviewProps> = ({ onPublish, onRollback }) => {
  const { current, update, validate, isDirty } = usePlaybooksStore();
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    warnings?: string[];
    errors?: string[];
  } | null>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [preflightStatus, setPreflightStatus] = useState<{
    hasEntry: boolean;
    hasDanglingEdges: boolean;
    hasUnconnectedSteps: boolean;
    hasSteps: boolean;
  } | null>(null);

  const jsonString = JSON.stringify(current?.jsonBody || {}, null, 2);

  const updatePreflightStatus = () => {
    if (!current) return;
    
    const guardrails = checkPublishGuardrails(current.jsonBody);
    setPreflightStatus({
      hasEntry: !!current.jsonBody.entry && current.jsonBody.steps.some(s => s.id === current.jsonBody.entry),
      hasDanglingEdges: guardrails.errors.some(e => e.includes('references non-existent step')),
      hasUnconnectedSteps: guardrails.warnings.some(w => w.includes('not connected')),
      hasSteps: current.jsonBody.steps.length > 0,
    });
  };

  useEffect(() => {
    updatePreflightStatus();
  }, [current?.jsonBody]);

  const handleValidate = async () => {
    if (!current) return;
    
    const result = await validate(current.jsonBody);
    setValidationResult(result);
    updatePreflightStatus();
    
    if (result.isValid) {
      showToast('Playbook is valid');
    } else {
      showToast('Validation failed - check errors');
    }
  };

  const handleSaveDraft = async () => {
    if (!current) return;
    
    try {
      await update(current.id, {
        jsonBody: current.jsonBody,
        status: 'draft',
      });
      showToast('Draft saved');
    } catch (error: any) {
      showToast(`Failed to save: ${error.message}`);
    }
  };

  const checkPublishGuardrails = (jsonBody: Playbook['jsonBody']): { canPublish: boolean; errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check for entry step
    if (!jsonBody.entry) {
      errors.push('No entry step defined. Set an entry point before publishing.');
    } else {
      // Verify entry step exists
      const entryExists = jsonBody.steps.some(s => s.id === jsonBody.entry);
      if (!entryExists) {
        errors.push(`Entry step "${jsonBody.entry}" not found in steps.`);
      }
    }
    
    // Check for dangling edges (next references that don't exist)
    const stepIds = new Set(jsonBody.steps.map(s => s.id));
    jsonBody.steps.forEach((step, index) => {
      if (step.next && step.next.length > 0) {
        step.next.forEach(nextId => {
          if (!stepIds.has(nextId)) {
            errors.push(`Step "${step.name || step.id || `Step ${index + 1}`}" references non-existent step "${nextId}"`);
          }
        });
      }
    });
    
    // Check for steps with no connections (warnings)
    if (jsonBody.steps.length > 1) {
      const connectedSteps = new Set<string>();
      if (jsonBody.entry) connectedSteps.add(jsonBody.entry);
      jsonBody.steps.forEach(step => {
        if (step.next) {
          step.next.forEach(nextId => connectedSteps.add(nextId));
        }
      });
      
      jsonBody.steps.forEach(step => {
        if (!connectedSteps.has(step.id) && step.id !== jsonBody.entry) {
          warnings.push(`Step "${step.name || step.id}" is not connected to the playbook flow`);
        }
      });
    }
    
    // Check for at least one step
    if (jsonBody.steps.length === 0) {
      errors.push('Playbook must have at least one step');
    }
    
    return {
      canPublish: errors.length === 0,
      errors,
      warnings,
    };
  };

  const handlePublish = async () => {
    if (!current) return;
    
    // Check guardrails first
    const guardrails = checkPublishGuardrails(current.jsonBody);
    if (!guardrails.canPublish) {
      setValidationResult({
        isValid: false,
        errors: guardrails.errors,
        warnings: guardrails.warnings,
      });
      showToast('Cannot publish - check errors');
      return;
    }
    
    // Validate before publishing
    const result = await validate(current.jsonBody);
    if (!result.isValid) {
      setValidationResult({
        isValid: false,
        errors: [...guardrails.errors, ...(result.errors || [])],
        warnings: [...guardrails.warnings, ...(result.warnings || [])],
      });
      showToast('Cannot publish - validation failed');
      return;
    }
    
    // Show warnings but allow publish
    if (guardrails.warnings.length > 0) {
      setValidationResult({
        isValid: true,
        warnings: guardrails.warnings,
      });
    }

    try {
      await update(current.id, {
        jsonBody: current.jsonBody,
        status: 'published',
        releaseNotes: releaseNotes.trim() || undefined,
      });
      setShowPublishDialog(false);
      setReleaseNotes('');
      showToast('Playbook published');
      onPublish?.();
    } catch (error: any) {
      showToast(`Failed to publish: ${error.message}`);
    }
  };

  const handleExport = () => {
    if (!current) return;
    
    const exportData = {
      name: current.name,
      description: current.description,
      version: current.jsonBody.version || '1.0.0',
      ...current.jsonBody,
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${current.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Playbook exported');
  };

  const handleImport = () => {
    if (!current) {
      showToast('Please select a playbook first');
      return;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        
        // Transform imported data to frontend format if needed
        // Check if it's in backend format (has 'kind' field) or frontend format (has 'type' field)
        const steps = imported.steps || [];
        const transformedSteps = steps.map((step: any) => {
          // If already in frontend format, use as-is
          if (step.type) {
            return step;
          }
          // Transform from backend format
          return {
            id: step.stepId || step.id || `step-${Date.now()}-${Math.random()}`,
            type: step.actionId || step.kind || step.type,
            name: step.name || step.stepId,
            params: step.config || step.params || (step.kind === 'attach_note' && step.text ? { text: step.text } : {}),
            onFail: step.onError === 'fail' ? 'stop' : 'continue',
            next: step.next || [],
          };
        });
        
        const jsonBody: Playbook['jsonBody'] = {
          steps: transformedSteps,
          version: imported.version || '1.0.0',
          entry: imported.entry,
        };
        
        // Validate imported JSON
        const result = await validate(jsonBody);
        if (!result.isValid) {
          setValidationResult(result);
          showToast(`Import failed: ${result.errors?.join(', ') || 'Invalid playbook format'}`);
          return;
        }
        
        // Update current playbook with imported data
        await update(current.id, {
          name: imported.name || current.name,
          description: imported.description || current.description,
          jsonBody,
        });
        showToast('Playbook imported successfully');
      } catch (error: any) {
        showToast(`Import failed: ${error.message}`);
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/10 flex items-center gap-2 flex-wrap">
        <button
          onClick={handleValidate}
          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded"
        >
          Validate
        </button>
        <button
          onClick={handleSaveDraft}
          disabled={!isDirty}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded"
        >
          Save Draft
        </button>
        <button
          onClick={() => setShowPublishDialog(true)}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
        >
          Publish
        </button>
        <button
          onClick={handleExport}
          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded"
        >
          Export
        </button>
        <button
          onClick={handleImport}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded"
        >
          Import
        </button>
        <button
          onClick={() => setShowRollbackDialog(true)}
          className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded"
        >
          Rollback
        </button>
      </div>

      {/* Preflight Checklist */}
      {preflightStatus && (
        <div className="p-3 border-b border-white/10 bg-surface-dark">
          <div className="text-xs font-semibold text-white/80 mb-2">Preflight Checklist</div>
          <div className="space-y-1 text-xs">
            <div className={`flex items-center ${preflightStatus.hasSteps ? 'text-green-400' : 'text-red-400'}`}>
              {preflightStatus.hasSteps ? '✓' : '✗'} At least one step
            </div>
            <div className={`flex items-center ${preflightStatus.hasEntry ? 'text-green-400' : 'text-red-400'}`}>
              {preflightStatus.hasEntry ? '✓' : '✗'} Entry step defined
            </div>
            <div className={`flex items-center ${!preflightStatus.hasDanglingEdges ? 'text-green-400' : 'text-red-400'}`}>
              {!preflightStatus.hasDanglingEdges ? '✓' : '✗'} No dangling edges
            </div>
            <div className={`flex items-center ${!preflightStatus.hasUnconnectedSteps ? 'text-green-400' : 'text-yellow-400'}`}>
              {!preflightStatus.hasUnconnectedSteps ? '✓' : '⚠'} All steps connected
            </div>
          </div>
        </div>
      )}

      {validationResult && (
        <div className={`p-3 border-b ${validationResult.isValid ? 'bg-green-900/20 border-green-500' : 'bg-red-900/20 border-red-500'}`}>
          <div className="text-sm font-semibold mb-1">
            {validationResult.isValid ? '✓ Valid' : '✗ Invalid'}
          </div>
          {validationResult.errors && validationResult.errors.length > 0 && (
            <div className="text-red-300 text-xs">
              {validationResult.errors.map((err, i) => (
                <div key={i}>{err}</div>
              ))}
            </div>
          )}
          {validationResult.warnings && validationResult.warnings.length > 0 && (
            <div className="text-yellow-300 text-xs mt-1">
              {validationResult.warnings.map((warn, i) => (
                <div key={i}>⚠ {warn}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="json"
          value={jsonString}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 12,
          }}
        />
      </div>

      {showPublishDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-panel rounded-xl border border-white/10 p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Publish Playbook</h3>
            <p className="text-white/80 mb-4">Are you sure you want to publish this playbook? Published playbooks are available to all users.</p>
            <div className="mb-4">
              <label className="block text-xs text-white/80 mb-2">Release Notes (optional)</label>
              <textarea
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                placeholder="What's new in this version?"
                className="w-full h-20 bg-panel border border-white/20 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowPublishDialog(false);
                  setReleaseNotes('');
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        isOpen={showRollbackDialog}
        onClose={() => setShowRollbackDialog(false)}
        title="Rollback Playbook"
        message="Select a version to rollback to from the Versions tab."
        variant="info"
        buttonText="OK"
      />
    </div>
  );
};


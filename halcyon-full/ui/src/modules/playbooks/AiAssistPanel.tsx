import React, { useState } from 'react';
import usePlaybooksStore from '@/store/playbooksStore';
import { showToast } from '@/components/Toast';
import { AlertDialog } from '@/components/AlertDialog';

export const AiAssistPanel: React.FC = () => {
  const { current, aiGenerate, setCurrentJson, markDirty } = usePlaybooksStore();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [generatedPlaybook, setGeneratedPlaybook] = useState<any>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showToast('Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    try {
      const result = await aiGenerate(prompt);
      setGeneratedPlaybook(result);
      setShowConfirm(true);
    } catch (error: any) {
      showToast(`AI generation failed: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReplace = () => {
    if (!current || !generatedPlaybook) return;

    setCurrentJson(() => generatedPlaybook);
    markDirty(true);
    setShowConfirm(false);
    setPrompt('');
    setGeneratedPlaybook(null);
    showToast('Playbook replaced with AI-generated draft');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/10">
        <h3 className="text-sm font-semibold mb-2 text-white">AI Assist</h3>
        <p className="text-xs text-white/60 mb-4">
          Generate a playbook from natural language description
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., Create a playbook that looks up GeoIP, WHOIS, and sends Slack message"
          className="w-full h-24 bg-panel border border-white/20 rounded p-2 text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 text-sm"
        />
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="mt-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded"
        >
          {isGenerating ? 'Generating...' : 'Generate Draft'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-white/60 text-sm">
          <p className="mb-2">Examples:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>"Create a playbook that looks up GeoIP and WHOIS"</li>
            <li>"Enrich IP addresses with VirusTotal hash check"</li>
            <li>"Get geolocation and reverse geocode coordinates"</li>
          </ul>
        </div>
      </div>

      {showConfirm && generatedPlaybook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-panel rounded-xl border border-white/10 p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Replace Current Playbook?</h3>
            <p className="text-white/80 mb-4">
              This will replace your current playbook with the AI-generated version. Continue?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setGeneratedPlaybook(null);
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleReplace}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


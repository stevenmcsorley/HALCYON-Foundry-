import { useState } from "react";

interface RunOutputDrawerProps {
  run: {
    id: string;
    output?: Record<string, any> | null;
    error?: string | null;
    steps?: Array<{
      stepId: string;
      kind: string;
      status: string;
      output?: any;
      error?: string;
      durationMs: number;
    }>;
  };
  onClose: () => void;
  onAttachAsNote?: () => void;
  canAttachAsNote?: boolean;
}

export default function RunOutputDrawer({
  run,
  onClose,
  onAttachAsNote,
  canAttachAsNote = false,
}: RunOutputDrawerProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    const text = JSON.stringify(run.output || run, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusColor = (status: string) => {
    if (status === "success") return "text-green-400";
    if (status === "failed") return "text-red-400";
    if (status === "running") return "text-yellow-400";
    return "text-gray-400";
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-panel border border-white/20 rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-xl font-semibold text-white">Run Output</h2>
          <div className="flex items-center gap-2">
            {canAttachAsNote && onAttachAsNote && (
              <button
                onClick={onAttachAsNote}
                className="px-3 py-1 text-sm bg-teal-600 hover:bg-teal-700 rounded text-white"
              >
                Attach as Note
              </button>
            )}
            <button
              onClick={copyToClipboard}
              className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 rounded text-white"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {run.error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-500/50 rounded">
              <h3 className="text-sm font-semibold text-red-400 mb-1">Error</h3>
              <p className="text-white text-sm">{run.error}</p>
            </div>
          )}

          {run.steps && run.steps.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-white/60 mb-2">Steps</h3>
              <div className="space-y-2">
                {run.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white/5 rounded border border-white/10"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-white">
                        {step.stepId || step.kind}
                      </span>
                      <span className={`text-xs ${getStatusColor(step.status)}`}>
                        {step.status}
                      </span>
                    </div>
                    {step.output && (
                      <details className="mt-2">
                        <summary className="text-xs text-white/60 cursor-pointer">
                          Output
                        </summary>
                        <pre className="mt-2 p-2 bg-black/30 rounded text-xs text-white overflow-auto max-h-40">
                          {JSON.stringify(step.output, null, 2)}
                        </pre>
                      </details>
                    )}
                    {step.error && (
                      <p className="mt-2 text-xs text-red-400">{step.error}</p>
                    )}
                    <p className="mt-1 text-xs text-white/40">
                      Duration: {step.durationMs}ms
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {run.output && (
            <div>
              <h3 className="text-sm font-semibold text-white/60 mb-2">Output</h3>
              <pre className="p-4 bg-black/30 rounded text-sm text-white overflow-auto max-h-96">
                {JSON.stringify(run.output, null, 2)}
              </pre>
            </div>
          )}

          {!run.output && !run.error && !run.steps && (
            <div className="text-center text-white/60 py-8">
              No output available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


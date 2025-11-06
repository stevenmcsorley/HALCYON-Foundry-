import React, { useState } from 'react';
import usePlaybooksStore from '@/store/playbooksStore';
import { showToast } from '@/components/Toast';
import { AlertDialog } from '@/components/AlertDialog';

const DEFAULT_MOCK_ALERT = JSON.stringify({
  id: 'test-alert-1',
  message: 'Suspicious IP 8.8.8.8 detected',
  attrs: {
    ip: '8.8.8.8',
    domain: 'example.com',
    hash: 'abc123def456',
  },
}, null, 2);

export const TestRunPanel: React.FC = () => {
  const { current, testRun } = usePlaybooksStore();
  const [mockAlert, setMockAlert] = useState(DEFAULT_MOCK_ALERT);
  const [logs, setLogs] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleTestRun = async () => {
    if (!current) {
      showToast('No playbook selected');
      return;
    }

    setIsRunning(true);
    setLogs([]);

    try {
      let mockSubject;
      try {
        mockSubject = JSON.parse(mockAlert);
      } catch (e) {
        setErrorMessage('Invalid JSON in mock alert');
        setShowError(true);
        setIsRunning(false);
        return;
      }

      const result = await testRun(current.jsonBody);
      setLogs(result.logs);

      if (result.success) {
        showToast('Test run completed successfully');
      } else {
        showToast('Test run completed with errors');
      }
    } catch (error: any) {
      setErrorMessage(error.message || 'Test run failed');
      setShowError(true);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/10">
        <h3 className="text-sm font-semibold mb-2 text-white">Test Run</h3>
        <p className="text-xs text-white/60 mb-4">
          Test this playbook with mock alert data. No external HTTP calls will be made.
        </p>
        <div className="mb-4">
          <label className="block text-xs text-white/80 mb-2">Mock Alert JSON</label>
          <textarea
            value={mockAlert}
            onChange={(e) => setMockAlert(e.target.value)}
            className="w-full h-32 bg-panel border border-white/20 rounded p-2 text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 text-xs font-mono"
            placeholder="Enter mock alert JSON..."
          />
        </div>
        <button
          onClick={handleTestRun}
          disabled={isRunning || !current}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded"
        >
          {isRunning ? 'Running...' : 'Run Test'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {logs.length === 0 && !isRunning && (
          <div className="text-white/60 text-sm text-center py-8">
            Click "Run Test" to execute the playbook
          </div>
        )}

        {isRunning && (
          <div className="text-white/60 text-sm text-center py-8">
            Running test...
          </div>
        )}

        {logs.length > 0 && (
          <div className="space-y-2">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`p-3 rounded border ${
                  log.status === 'success'
                    ? 'bg-green-900/20 border-green-500/50'
                    : 'bg-red-900/20 border-red-500/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-white">
                    {log.stepId || `Step ${index + 1}`}
                  </span>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      log.status === 'success'
                        ? 'bg-green-600 text-white'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {log.status || 'unknown'}
                  </span>
                </div>
                {log.kind && (
                  <div className="text-xs text-white/60 mb-1">Kind: {log.kind}</div>
                )}
                {log.output && (
                  <pre className="text-xs text-white/80 mt-2 bg-black/20 p-2 rounded overflow-x-auto">
                    {JSON.stringify(log.output, null, 2)}
                  </pre>
                )}
                {log.error && (
                  <div className="text-xs text-red-300 mt-2">{log.error}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        isOpen={showError}
        onClose={() => setShowError(false)}
        title="Test Run Error"
        message={errorMessage}
        variant="error"
        buttonText="OK"
      />
    </div>
  );
};


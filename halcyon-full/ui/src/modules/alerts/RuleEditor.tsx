import { useState } from "react";
import { api } from "@/services/api";
import { showToast } from "@/components/Toast";
import { AlertDialog } from "@/components/AlertDialog";

export default function RuleEditor() {
  const [json, setJson] = useState(`{
  "match": { "type": "Event", "attrs.severity": "high" },
  "window": "5m",
  "threshold": 3,
  "group_by": "attrs.source",
  "message": "High severity burst from \${attrs.source}"
}`);
  const [name, setName] = useState("High severity burst");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("high");
  const [saving, setSaving] = useState(false);
  const [apiHint, setApiHint] = useState<string>("");
  const [errorDialog, setErrorDialog] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: "",
  });

  async function save() {
    setSaving(true);
    setApiHint(""); // Clear previous hint
    try {
      let conditionJson;
      try {
        conditionJson = JSON.parse(json);
      } catch (e) {
        setErrorDialog({
          isOpen: true,
          message: `Invalid JSON: ${(e as Error).message}`,
        });
        setSaving(false);
        return;
      }

      const payload = {
        name,
        severity,
        conditionJson,
        actionsJson: [{ type: "slack", config: {} }],
        enabled: true,
      };

      await api.post("/alerts/rules", payload);
      // Success - show toast notification
      showToast("Rule saved successfully!");
      // Reset form
      setName("");
      setJson(`{
  "match": { "type": "Event", "attrs.severity": "high" },
  "window": "5m",
  "threshold": 3,
  "group_by": "attrs.source",
  "message": "High severity burst from \${attrs.source}"
}`);
      setApiHint("");
    } catch (e: any) {
      const errorMessage = e.response?.data?.detail || e.message || "Unknown error occurred";
      // Silently handle 404 errors (backend routes not configured yet)
      // Show inline hint instead of modal
      if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
        setApiHint("Rules API not available - backend routes may not be configured");
        setSaving(false);
        return;
      }
      // Show AlertDialog only for unexpected errors (5xx, network errors)
      setErrorDialog({
        isOpen: true,
        message: errorMessage,
      });
      setSaving(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-3">
        <div className="text-xs text-gray-500 p-2 bg-panel/50 rounded border border-gray-700">
          💡 Use <strong>Silences</strong> for ad-hoc suppression and <strong>Maintenance</strong> for scheduled windows. Suppressed alerts do not notify but still stream to UI.
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-white">Rule Name</label>
          <input
            type="text"
            className="bg-panel border border-white/20 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="High severity burst"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-white">Severity</label>
          <select
            className="bg-panel border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as "low" | "medium" | "high")}
          >
            <option value="low" className="bg-panel text-white">Low</option>
            <option value="medium" className="bg-panel text-white">Medium</option>
            <option value="high" className="bg-panel text-white">High</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-white">Condition JSON</label>
          <textarea
            className="w-full h-56 font-mono p-2 bg-black/40 border border-gray-800 rounded text-sm text-white placeholder-gray-400 focus:outline-none focus:border-teal-500"
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button 
            className="bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded transition-colors" 
            onClick={save} 
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Rule"}
          </button>
          {apiHint && (
            <span className="text-xs text-yellow-400 italic">{apiHint}</span>
          )}
        </div>
      </div>

      <AlertDialog
        isOpen={errorDialog.isOpen}
        onClose={() => setErrorDialog({ isOpen: false, message: "" })}
        title="Error"
        message={errorDialog.message}
        variant="error"
      />
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { api } from "@/services/api";
import { showToast } from "@/components/Toast";
import { AlertDialog } from "@/components/AlertDialog";
import { Modal } from "@/components/Modal";
import { useBindingsStore, type PlaybookMode, type PlaybookBinding } from "@/store/bindingsStore";
import usePlaybooksStore from "@/store/playbooksStore";

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

  const [bindingRuleId, setBindingRuleId] = useState<string>("");
  const [loadedRuleId, setLoadedRuleId] = useState<number | null>(null);
  const [isBindingModalOpen, setBindingModalOpen] = useState(false);
  const [editingBinding, setEditingBinding] = useState<PlaybookBinding | null>(null);
  const [matchTypes, setMatchTypes] = useState<string>("");
  const [matchSeverities, setMatchSeverities] = useState<string>("");
  const [matchTags, setMatchTags] = useState<string>("");
  const [mode, setMode] = useState<PlaybookMode>("suggest");
  const [playbookId, setPlaybookId] = useState<string>("");
  const [maxPerMinute, setMaxPerMinute] = useState<number>(30);
  const [maxConcurrent, setMaxConcurrent] = useState<number>(5);
  const [dailyQuota, setDailyQuota] = useState<number>(500);
  const [enabled, setEnabled] = useState<boolean>(true);

  const {
    bindings,
    list: listBindings,
    create: createBinding,
    update: updateBinding,
    remove: removeBinding,
    error: bindingsError,
    clearError,
  } = useBindingsStore();

  const { items: playbooks, load: loadPlaybooks } = usePlaybooksStore();

  useEffect(() => {
    loadPlaybooks("published").catch((error) => {
      console.warn("Failed to load playbooks", error);
    });
  }, [loadPlaybooks]);

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

  const availableBindings = useMemo(() => {
    if (loadedRuleId == null) return [];
    return bindings.filter((b) => b.ruleId === loadedRuleId);
  }, [bindings, loadedRuleId]);

  async function loadBindingsForRule() {
    clearError();
    if (!bindingRuleId) {
      showToast("Enter a rule ID to load bindings");
      return;
    }
    const id = Number(bindingRuleId);
    if (Number.isNaN(id)) {
      showToast("Rule ID must be a number");
      return;
    }
    await listBindings({ ruleId: id });
    setLoadedRuleId(id);
  }

  function openBindingModal(binding?: PlaybookBinding) {
    clearError();
    if (!loadedRuleId) {
      showToast("Load a rule's bindings first");
      return;
    }
    if (binding) {
      setEditingBinding(binding);
      setMatchTypes(binding.matchTypes.join(", "));
      setMatchSeverities(binding.matchSeverities.join(", "));
      setMatchTags(binding.matchTags.join(", "));
      setMode(binding.mode);
      setPlaybookId(binding.playbookId);
      setMaxPerMinute(binding.maxPerMinute);
      setMaxConcurrent(binding.maxConcurrent);
      setDailyQuota(binding.dailyQuota);
      setEnabled(binding.enabled);
    } else {
      setEditingBinding(null);
      setMatchTypes("Event");
      setMatchSeverities("high");
      setMatchTags("");
      setMode("suggest");
      setPlaybookId(playbooks[0]?.id ?? "");
      setMaxPerMinute(30);
      setMaxConcurrent(5);
      setDailyQuota(500);
      setEnabled(true);
    }
    setBindingModalOpen(true);
  }

  async function handleBindingSave() {
    if (!loadedRuleId) return;
    if (!playbookId) {
      showToast("Select a playbook");
      return;
    }

    const payload = {
      ruleId: loadedRuleId,
      playbookId,
      mode,
      matchTypes: matchTypes.split(",").map((t) => t.trim()).filter(Boolean),
      matchSeverities: matchSeverities.split(",").map((t) => t.trim()).filter(Boolean),
      matchTags: matchTags.split(",").map((t) => t.trim()).filter(Boolean),
      maxPerMinute,
      maxConcurrent,
      dailyQuota,
      enabled,
    };

    try {
      if (editingBinding) {
        await updateBinding(editingBinding.id, payload);
        showToast("Binding updated");
      } else {
        await createBinding(payload);
        showToast("Binding created");
      }
      await loadBindingsForRule();
      setBindingModalOpen(false);
    } catch (error: any) {
      console.error("Failed to save binding", error);
    }
  }

  async function handleDeleteBinding(binding: PlaybookBinding) {
    if (!confirm(`Delete binding for playbook ${binding.playbookId}?`)) return;
    const success = await removeBinding(binding.id);
    if (success) {
      showToast("Binding removed");
      await loadBindingsForRule();
    }
  }

  const bindingErrorBanner = bindingsError ? (
    <div className="text-xs text-red-400 bg-red-900/20 border border-red-700 px-3 py-2 rounded">
      {bindingsError}
    </div>
  ) : null;

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

      <div className="mt-10 space-y-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-white mb-1">Rule ID</label>
            <input
              className="bg-panel border border-white/20 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 w-full"
              placeholder="Enter rule ID to manage bindings"
              value={bindingRuleId}
              onChange={(e) => setBindingRuleId(e.target.value)}
            />
          </div>
          <button
            onClick={loadBindingsForRule}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded"
          >
            Load Bindings
          </button>
          <button
            onClick={() => openBindingModal()}
            disabled={!loadedRuleId}
            className="bg-teal-600 hover:bg-teal-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded"
          >
            Add Binding
          </button>
        </div>

        <div className="text-xs text-white/70">
          Bind playbooks to this rule to automatically suggest, dry-run, or auto-run enrichments when alerts fire. Use filters to target specific severities, entity types, or tags.
        </div>

        {bindingErrorBanner}

        {loadedRuleId && (
          <div className="bg-black/40 border border-white/10 rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 text-xs font-semibold uppercase tracking-wide text-white/70 bg-white/10 px-3 py-2">
              <span className="col-span-1">ID</span>
              <span className="col-span-2">Playbook</span>
              <span className="col-span-2">Mode</span>
              <span className="col-span-2">Match Types</span>
              <span className="col-span-2">Severities</span>
              <span className="col-span-1">Tags</span>
              <span className="col-span-2 text-right">Guardrails</span>
            </div>
            {availableBindings.length === 0 ? (
              <div className="px-3 py-4 text-sm text-white/60">No bindings configured for this rule.</div>
            ) : (
              availableBindings.map((binding) => (
                <div key={binding.id} className="grid grid-cols-12 items-center px-3 py-3 border-t border-white/10 text-sm text-white/80">
                  <div className="col-span-1 text-xs font-mono">{binding.id}</div>
                  <div className="col-span-2 text-xs font-mono truncate">{binding.playbookId}</div>
                  <div className="col-span-2 capitalize">{binding.mode.replace("_", " ")}</div>
                  <div className="col-span-2 truncate">{binding.matchTypes.join(", ") || "Any"}</div>
                  <div className="col-span-2 truncate">{binding.matchSeverities.join(", ") || "Any"}</div>
                  <div className="col-span-1 truncate text-xs">{binding.matchTags.join(", ") || "Any"}</div>
                  <div className="col-span-2 text-right space-x-2">
                    <span className="text-xs text-white/60">{binding.maxPerMinute}/min • {binding.maxConcurrent} conc • {binding.dailyQuota}/day</span>
                    <button
                      className="text-teal-400 hover:text-teal-200 text-xs"
                      onClick={() => openBindingModal(binding)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-red-400 hover:text-red-200 text-xs"
                      onClick={() => handleDeleteBinding(binding)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={isBindingModalOpen}
        onClose={() => setBindingModalOpen(false)}
        title={editingBinding ? "Edit Binding" : "Add Binding"}
      >
        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-semibold text-white mb-1">Playbook</label>
            <select
              className="bg-panel border border-white/20 rounded px-3 py-2 text-white w-full"
              value={playbookId}
              onChange={(e) => setPlaybookId(e.target.value)}
            >
              <option value="" disabled className="bg-panel text-white/70">Select playbook</option>
              {playbooks.map((pb) => (
                <option key={pb.id} value={pb.id} className="bg-panel text-white">
                  {pb.name} ({pb.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-white mb-1">Mode</label>
            <select
              className="bg-panel border border-white/20 rounded px-3 py-2 text-white w-full"
              value={mode}
              onChange={(e) => setMode(e.target.value as PlaybookMode)}
            >
              <option value="suggest" className="bg-panel text-white">Suggest</option>
              <option value="dry_run" className="bg-panel text-white">Dry Run</option>
              <option value="auto_run" className="bg-panel text-white">Auto Run</option>
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-white mb-1">Match Types</label>
              <input
                className="bg-panel border border-white/20 rounded px-3 py-2 text-white w-full"
                placeholder="Event, Anomaly"
                value={matchTypes}
                onChange={(e) => setMatchTypes(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white mb-1">Match Severities</label>
              <input
                className="bg-panel border border-white/20 rounded px-3 py-2 text-white w-full"
                placeholder="high, critical"
                value={matchSeverities}
                onChange={(e) => setMatchSeverities(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white mb-1">Match Tags</label>
              <input
                className="bg-panel border border-white/20 rounded px-3 py-2 text-white w-full"
                placeholder="finance, edge"
                value={matchTags}
                onChange={(e) => setMatchTags(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-white mb-1">Max / Minute</label>
              <input
                type="number"
                className="bg-panel border border-white/20 rounded px-3 py-2 text-white w-full"
                value={maxPerMinute}
                min={0}
                onChange={(e) => setMaxPerMinute(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white mb-1">Max Concurrent</label>
              <input
                type="number"
                className="bg-panel border border-white/20 rounded px-3 py-2 text-white w-full"
                value={maxConcurrent}
                min={0}
                onChange={(e) => setMaxConcurrent(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white mb-1">Daily Quota</label>
              <input
                type="number"
                className="bg-panel border border-white/20 rounded px-3 py-2 text-white w-full"
                value={dailyQuota}
                min={0}
                onChange={(e) => setDailyQuota(Number(e.target.value))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-white">
            <input
              type="checkbox"
              className="accent-teal-500"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enabled
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white"
              onClick={() => setBindingModalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded bg-teal-600 hover:bg-teal-500 text-white"
              onClick={handleBindingSave}
            >
              {editingBinding ? "Update Binding" : "Create Binding"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

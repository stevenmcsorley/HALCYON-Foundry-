import { useState } from "react";
import { api } from "@/services/api";

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

  async function save() {
    setSaving(true);
    try {
      let conditionJson;
      try {
        conditionJson = JSON.parse(json);
      } catch (e) {
        alert("Invalid JSON: " + (e as Error).message);
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
      alert("Rule saved!");
      // Reset form
      setName("");
      setJson(`{
  "match": { "type": "Event", "attrs.severity": "high" },
  "window": "5m",
  "threshold": 3,
  "group_by": "attrs.source",
  "message": "High severity burst from \${attrs.source}"
}`);
    } catch (e: any) {
      alert("Error: " + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">Rule Name</label>
        <input
          type="text"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="High severity burst"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Severity</label>
        <select
          className="select"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as "low" | "medium" | "high")}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Condition JSON</label>
        <textarea
          className="w-full h-56 font-mono p-2 bg-black/40 border border-gray-800 rounded text-sm"
          value={json}
          onChange={(e) => setJson(e.target.value)}
        />
      </div>
      <button className="btn" onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save Rule"}
      </button>
    </div>
  );
}

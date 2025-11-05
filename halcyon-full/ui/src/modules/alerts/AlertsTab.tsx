import { useEffect, useState } from "react";
import AlertList from "./AlertList";
import RuleEditor from "./RuleEditor";
import SilencesPanel from "./SilencesPanel";
import MaintenancePanel from "./MaintenancePanel";
import { useAlertsStore } from "@/store/alertsStore";

type AlertsSubTab = 'list' | 'rules' | 'silences' | 'maintenance';

export default function AlertsTab() {
  const [activeSubTab, setActiveSubTab] = useState<AlertsSubTab>('list');
  const load = useAlertsStore((s) => s.load);
  const setFilters = useAlertsStore((s) => s.setFilters);
  const setUnreadZero = () => useAlertsStore.setState({ unread: 0 });

  useEffect(() => {
    // Initial load + clear unread when entering Alerts
    load().finally(setUnreadZero);
    // Optional: default sort/filter on entry
    setFilters({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear unread when tab becomes visible
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) {
        useAlertsStore.setState({ unread: 0 });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex gap-4 border-b border-gray-800 mb-4">
        <button
          onClick={() => setActiveSubTab('list')}
          className={`px-4 py-2 text-sm font-medium ${
            activeSubTab === 'list'
              ? 'border-b-2 border-teal-500 text-teal-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          List
        </button>
        <button
          onClick={() => setActiveSubTab('rules')}
          className={`px-4 py-2 text-sm font-medium ${
            activeSubTab === 'rules'
              ? 'border-b-2 border-teal-500 text-teal-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Rules
        </button>
        <button
          onClick={() => setActiveSubTab('silences')}
          className={`px-4 py-2 text-sm font-medium ${
            activeSubTab === 'silences'
              ? 'border-b-2 border-teal-500 text-teal-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Silences
        </button>
        <button
          onClick={() => setActiveSubTab('maintenance')}
          className={`px-4 py-2 text-sm font-medium ${
            activeSubTab === 'maintenance'
              ? 'border-b-2 border-teal-500 text-teal-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Maintenance
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {activeSubTab === 'list' && <AlertList onCaseChipClick={(caseId) => {
          // Navigate to cases tab - emit event that App.tsx can listen to
          window.dispatchEvent(new CustomEvent('navigate-to-cases', { detail: { caseId } }));
        }} />}
        {activeSubTab === 'rules' && <RuleEditor />}
        {activeSubTab === 'silences' && <SilencesPanel />}
        {activeSubTab === 'maintenance' && <MaintenancePanel />}
      </div>
    </div>
  );
}

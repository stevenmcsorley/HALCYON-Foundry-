import { useEffect } from "react";
import AlertList from "./AlertList";
import RuleEditor from "./RuleEditor";
import { useAlertsStore } from "@/store/alertsStore";

export default function AlertsTab() {
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
    <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
      <div className="h-full overflow-auto">
        <h2 className="text-sm uppercase tracking-wide text-gray-400 mb-2">Alerts</h2>
        <AlertList />
      </div>
      <div className="h-full overflow-auto">
        <h2 className="text-sm uppercase tracking-wide text-gray-400 mb-2">Rule Editor</h2>
        <RuleEditor />
      </div>
    </div>
  );
}

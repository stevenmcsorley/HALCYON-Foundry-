import { useAlertsStore } from "@/store/alertsStore";

export function NotificationBell() {
  const unread = useAlertsStore((s) => s.unread);
  return (
    <div className="relative cursor-pointer">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-gray-400"
      >
        <path d="M12 2a7 7 0 0 0-7 7v3l-2 2v2h18v-2l-2-2V9a7 7 0 0 0-7-7zm0 20a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3z" />
      </svg>
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 text-[10px] bg-red-600 text-white rounded-full px-1.5 min-w-[18px] text-center">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useMLStore, type FeedbackEvent } from "@/store/mlStore";
import { Badge } from "@/components/ui/badge";

interface CaseFeedbackListProps {
  caseId: number;
}

export default function CaseFeedbackList({ caseId }: CaseFeedbackListProps) {
  const { getFeedback } = useMLStore();
  const [feedback, setFeedback] = useState<FeedbackEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const loadFeedback = async () => {
    setLoading(true);
    try {
      const fb = await getFeedback(caseId);
      setFeedback(fb);
    } catch (error) {
      // Error handled in store
    } finally {
      setLoading(false);
    }
  };

  if (loading || feedback.length === 0) {
    return null;
  }

  const getActionColor = (action: string) => {
    if (action === "accepted") return "bg-green-600";
    if (action === "rejected") return "bg-red-600";
    return "bg-amber-600";
  };

  return (
    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="text-lg font-semibold text-white">
          Feedback History ({feedback.length})
        </h3>
        <span className="text-white/60 text-sm">{expanded ? "▼" : "▶"}</span>
      </button>
      
      {expanded && (
        <div className="mt-4 space-y-3">
          {feedback.map((fb) => (
            <div
              key={fb.id}
              className="bg-white/5 rounded p-3 border border-white/5"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge className={`${getActionColor(fb.action)} text-white text-xs`}>
                    {fb.action}
                  </Badge>
                  <span className="text-sm text-white/80 capitalize">
                    {fb.suggestionType}
                  </span>
                </div>
                <span className="text-xs text-white/40">
                  {new Date(fb.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="text-sm text-white/70">
                Suggested: <span className="font-medium">{fb.suggestedValue}</span>
                {fb.finalValue && (
                  <>
                    {" → "}
                    <span className="font-medium">{fb.finalValue}</span>
                  </>
                )}
              </div>
              {fb.userId && (
                <div className="text-xs text-white/40 mt-1">By: {fb.userId}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


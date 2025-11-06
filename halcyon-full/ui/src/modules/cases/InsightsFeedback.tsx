import { useState } from "react";
// Button component - using inline button styles
import { useMLStore, type FeedbackAction, type SuggestionType } from "@/store/mlStore";
import { hasRole } from "@/services/auth";
import { Case } from "@/store/casesStore";
import { showToast } from "@/components/Toast";

interface InsightsFeedbackProps {
  caseData: Case;
  suggestionType: "priority" | "owner";
  suggestedValue: string;
  score?: number | null;
  onFeedbackSubmitted?: () => void;
}

export default function InsightsFeedback({
  caseData,
  suggestionType,
  suggestedValue,
  score,
  onFeedbackSubmitted,
}: InsightsFeedbackProps) {
  const { provideFeedback } = useMLStore();
  const [submitting, setSubmitting] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideValue, setOverrideValue] = useState("");

  // Only show for analyst/admin
  if (!hasRole("analyst") && !hasRole("admin")) {
    return null;
  }

  const handleFeedback = async (action: FeedbackAction, finalValue?: string) => {
    setSubmitting(true);
    try {
      await provideFeedback({
        caseId: caseData.id,
        suggestionType: suggestionType as SuggestionType,
        suggestedValue,
        finalValue,
        action,
        score: score || undefined,
      });
      showToast("Feedback submitted", "success");
      setShowOverride(false);
      onFeedbackSubmitted?.();
    } catch (error) {
      // Error handling is done in mlStore
    } finally {
      setSubmitting(false);
    }
  };

  const handleThumbsUp = () => {
    handleFeedback("accepted");
  };

  const handleThumbsDown = () => {
    setShowOverride(true);
  };

  const handleOverrideSubmit = () => {
    if (overrideValue) {
      handleFeedback("overridden", overrideValue);
    } else {
      handleFeedback("rejected");
    }
  };

  if (showOverride) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted">What did you choose?</span>
        {suggestionType === "priority" ? (
          <select
            value={overrideValue}
            onChange={(e) => setOverrideValue(e.target.value)}
            className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm"
          >
            <option value="">Rejected</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        ) : (
          <input
            type="text"
            value={overrideValue}
            onChange={(e) => setOverrideValue(e.target.value)}
            placeholder="Owner email"
            className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm w-32"
          />
        )}
        <button
          onClick={handleOverrideSubmit}
          disabled={submitting}
          className="px-2 py-1 text-xs bg-teal-600 hover:bg-teal-700 rounded text-white disabled:opacity-50"
        >
          Submit
        </button>
        <button
          onClick={() => {
            setShowOverride(false);
            setOverrideValue("");
          }}
          className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded text-white"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted">Was this helpful?</span>
      <button
        onClick={handleThumbsUp}
        disabled={submitting}
        className="w-7 h-7 p-0 bg-transparent hover:bg-white/10 rounded disabled:opacity-50"
        title="Mark as helpful"
      >
        👍
      </button>
      <button
        onClick={handleThumbsDown}
        disabled={submitting}
        className="w-7 h-7 p-0 bg-transparent hover:bg-white/10 rounded disabled:opacity-50"
        title="Mark as not helpful"
      >
        👎
      </button>
    </div>
  );
}


import { create } from "zustand";
import { api } from "@/services/api";

export type FeedbackAction = "accepted" | "rejected" | "overridden";
export type SuggestionType = "priority" | "owner";

export interface FeedbackEvent {
  id: number;
  caseId: number;
  suggestionType: SuggestionType;
  suggestedValue: string;
  finalValue?: string | null;
  action: FeedbackAction;
  score?: number | null;
  userId?: string | null;
  createdAt: string;
}

export interface ProvideFeedbackInput {
  caseId: number;
  suggestionType: SuggestionType;
  suggestedValue: string;
  finalValue?: string;
  action: FeedbackAction;
  score?: number;
}

type MLState = {
  provideFeedback: (input: ProvideFeedbackInput) => Promise<FeedbackEvent>;
  getFeedback: (caseId: number) => Promise<FeedbackEvent[]>;
};

export const useMLStore = create<MLState>(() => ({
  provideFeedback: async (input: ProvideFeedbackInput) => {
    try {
      const res = await api.post<FeedbackEvent>(`/ml/cases/${input.caseId}/feedback`, {
        suggestionType: input.suggestionType,
        suggestedValue: input.suggestedValue,
        finalValue: input.finalValue || null,
        action: input.action,
        score: input.score || null,
      });
      return res.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const errorMsg = error?.message || "";
      
      // Silent handling for expected errors (same policy as alertsStore)
      if (
        status === 401 ||
        status === 403 ||
        status === 404 ||
        errorMsg.includes("Unauthorized") ||
        errorMsg.includes("Forbidden") ||
        errorMsg.includes("Not Found")
      ) {
        throw error; // Re-throw for caller to handle silently
      }
      
      // Log error - UI components can show AlertDialog if needed
      console.error("Failed to submit feedback:", errorMsg);
      throw error;
    }
  },

  getFeedback: async (caseId: number) => {
    try {
      const res = await api.get<FeedbackEvent[]>(`/ml/cases/${caseId}/feedback`);
      return res.data || [];
    } catch (error: any) {
      const status = error?.response?.status;
      const errorMsg = error?.message || "";
      
      // Silent handling for expected errors
      if (
        status === 401 ||
        status === 403 ||
        status === 404 ||
        errorMsg.includes("Unauthorized") ||
        errorMsg.includes("Forbidden") ||
        errorMsg.includes("Not Found")
      ) {
        return []; // Return empty array on expected errors
      }
      
      // Log error - UI components can show AlertDialog if needed
      console.error("Failed to load feedback:", errorMsg);
      return [];
    }
  },
}));


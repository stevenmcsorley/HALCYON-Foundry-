# ML Feedback & Continuous Learning

## Overview

Phase 4C adds feedback capture and online learning to the ML scoring system. Analysts can provide feedback on ML suggestions (priority/owner), and the system learns from these actions to improve future suggestions.

## How It Works

### Feedback Capture

When an analyst interacts with an ML suggestion:
- **Accepted**: The suggestion matches the analyst's expectation
- **Rejected**: The suggestion was incorrect
- **Overridden**: The analyst chose a different value

Feedback is recorded in `ml_feedback_log` with:
- Case ID
- Suggestion type (priority/owner)
- Suggested value
- Final value (if adopted/overridden)
- Action taken
- Confidence score (if available)
- User ID

### Online Learning

The system uses a simple SGD-like update:
- **Reward**: +1.0 (accepted), -1.0 (rejected), +0.5/-0.5 (overridden)
- **Update**: `weight += learning_rate * reward`
- **Clipping**: Weights are bounded between -3.0 and 3.0

Features updated:
- Keyword features: `kw_critical`, `kw_high`, `kw_breach`, `kw_failure`
- Owner history features: `owner_{email}_history`, `owner_history_base`

### Confidence Calibration

The system tracks calibration metrics:
- Histogram: `ml_suggestion_calibration` (score vs accepted)
- Used to monitor if high-confidence suggestions are actually accepted

## Privacy & Security

- Feedback is linked to user ID (from JWT token)
- Only analyst/admin roles can provide feedback
- Viewers can see feedback history (read-only)
- Feature flag: `ML_ENABLE_FEEDBACK` (default: true)

## Feature Flags

- **Backend**: `ML_ENABLE_FEEDBACK=true` (env var)
- **Frontend**: `VITE_ENABLE_ML_FEEDBACK=true` (default: true)

If disabled:
- Backend: Feedback endpoints return 503
- Frontend: Feedback UI components are hidden

## Metrics

- `ml_suggestion_feedback_total{type,action}`: Counter of feedback events
- `ml_online_update_total{feature}`: Counter of weight updates per feature
- `ml_suggestion_calibration`: Histogram of (score, accepted) pairs

## API

### REST

- `GET /ml/cases/{id}/feedback` - List feedback for a case
- `POST /ml/cases/{id}/feedback` - Record feedback
- `GET /ml/stats?window=7d` - Aggregate statistics

### GraphQL

- `query { feedbackByCase(caseId: ID!) { ... } }`
- `mutation { provideFeedback(input: ProvideFeedbackInput!) { ... } }`
- `Case.feedback` field resolver

## UI Components

- **ConfidenceBadge**: Shows confidence percentage with color coding
- **InsightsFeedback**: "Was this helpful?" controls (👍/👎)
- **CaseFeedbackList**: Collapsible history of feedback events

## Future Enhancements

- Confidence badges with tooltips showing explanation
- Batch feedback import
- A/B testing framework
- Model version tracking and rollback


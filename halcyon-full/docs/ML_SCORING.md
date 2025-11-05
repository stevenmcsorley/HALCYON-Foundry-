# ML Scoring for Cases

## Overview

HALCYON's ML scoring system provides automated suggestions for case triage, helping analysts prioritize and assign cases more efficiently. The system uses lightweight heuristics to suggest priority, owner, and related cases.

## What It Does

### Priority Suggestion
- Analyzes case title for keywords indicating severity
- Considers keywords: `critical`, `outage`, `breach`, `incident`, `failure`, `failed`, `error`
- Scores based on keyword presence and severity hints
- Returns one of: `low`, `medium`, `high`, `critical`

### Owner Suggestion
- Analyzes historical case resolution data
- Identifies the most frequent resolver for similar cases
- Suggests the owner based on past resolution patterns

### Similar Cases
- Uses Jaccard similarity on tokenized case titles
- Identifies up to 3 similar cases with similarity score ≥ 0.2
- Helps analysts find related incidents and patterns

## How It Works

### Heuristic-Based Scoring

The current implementation uses rule-based heuristics (no heavy ML frameworks):

1. **Priority Scoring**:
   - Base score: 0.2
   - Keyword matches: +0.15 per keyword
   - Severity hint (high/critical): +0.25
   - Thresholds:
     - ≥ 0.85 → `critical`
     - ≥ 0.65 → `high`
     - ≥ 0.4 → `medium`
     - < 0.4 → `low`

2. **Owner Suggestion**:
   - Queries resolved/closed cases
   - Groups by owner and counts
   - Returns owner with highest count

3. **Similarity Matching**:
   - Tokenizes case titles (lowercase, split on whitespace)
   - Computes Jaccard similarity: `intersection / union`
   - Returns top 3 cases with similarity ≥ 0.2

### When Suggestions Are Generated

- **On Case Creation**: Automatic ML suggestions applied after case is created
- **On Case Update**: Re-computed when title, priority, or status changes
- **Model Version**: All suggestions tagged with `ml_version` (currently "1.0.0")

## How Suggestions Apply

### Automatic Application

Suggestions are automatically computed and stored in the database when:
- A case is created
- A case's title, priority, or status is updated

### Manual Adoption

Analysts can manually adopt suggestions via:
- **UI**: "Adopt" buttons in the Insights panel
- **REST API**: `PATCH /cases/{id}/adopt/priority` or `/adopt/owner`
- **GraphQL**: `adoptPrioritySuggestion(caseId)` or `adoptOwnerSuggestion(caseId)`

When adopted:
- Case metadata is updated (priority or owner)
- Metrics are incremented (`ml_suggestion_applied_total`)
- Audit log entry is created

## Metrics & Observability

### Prometheus Metrics

- `ml_inference_total{model, status}` - Count of inference attempts (success/fail)
- `ml_suggestion_applied_total{type}` - Count of adopted suggestions (priority/owner)
- `ml_inference_latency_seconds{model}` - Histogram of inference latency
- `ml_model_version_info{model, version}` - Gauge showing current model version

### Logging

Structured logs include:
- `ml_suggestion_failed` - When suggestion generation fails
- `ml_suggestion_adopted` - When analyst adopts a suggestion

## Future: Model Retraining

The current implementation is designed to be future-proof:

- Model version tracking enables A/B testing
- Metrics allow tracking suggestion quality
- JSONB storage allows adding new suggestion types
- Heuristics can be replaced with trained models without API changes

### Planned Enhancements

1. **Model Retraining**: Periodic retraining based on adoption rates
2. **Feedback Loop**: Track which suggestions are ignored vs. adopted
3. **Advanced Features**: 
   - Entity extraction from case descriptions
   - Time-to-resolution prediction
   - Escalation recommendations

## Configuration

Currently no configuration required. Future options:

- `ML_SIMILARITY_LIMIT` - Number of candidate cases for similarity (default: 200)
- `ML_PRIORITY_THRESHOLD_CRIT` - Critical priority threshold (default: 0.85)
- `ML_OWNER_HISTORY_LIMIT` - Number of historical cases to analyze (default: 500)

## Troubleshooting

### No Suggestions Appearing

1. Check that migration `011_cases_ml.sql` has been applied
2. Verify ML scoring is being called in resolvers
3. Check logs for `ml_suggestion_failed` entries
4. Verify metrics are incrementing: `curl localhost:8088/metrics | grep ml_inference_total`

### Suggestions Seem Incorrect

1. Review keyword matching logic in `ml_scoring.py`
2. Check owner history data (ensure resolved cases have owners)
3. Verify similarity thresholds (may need adjustment)

### Performance Issues

1. Monitor `ml_inference_latency_seconds` histogram
2. Consider reducing `ML_SIMILARITY_LIMIT` or `ML_OWNER_HISTORY_LIMIT`
3. Add caching for owner history if needed

## Rollback Plan

If ML suggestions need to be disabled:

1. **Database**: Columns are nullable, no data loss
2. **UI**: Hide Insights panel via feature flag
3. **Backend**: Skip `_apply_ml_suggestions()` call in resolvers
4. **Migration**: Reversible (columns can be dropped if needed)

No breaking changes to existing case functionality.


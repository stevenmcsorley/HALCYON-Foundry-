# Phase 4B Release: ML Scoring & Case Automation

**Release Tag:** `v4b-ml-case-automation`  
**Date:** 2025-11-05  
**Status:** ✅ Released

## Overview

Phase 4B adds ML-assisted case triage with priority and owner suggestions, plus related case discovery. This release enables analysts to leverage historical patterns for faster, more consistent case handling.

## What's New

### Backend
- **ML Scoring Engine** (`ml_scoring.py`)
  - Heuristic-based priority scoring (keyword analysis, severity mapping)
  - Owner suggestion based on historical resolution patterns
  - Similar case discovery using Jaccard similarity
  - Model versioning (v1.0.0)

- **Database Schema** (Migration `011_cases_ml.sql`)
  - `cases.priority_suggestion` - Suggested priority level
  - `cases.owner_suggestion` - Suggested case owner
  - `cases.similar_case_ids` - Array of related case IDs
  - `cases.ml_version` - ML model version used

- **API Endpoints**
  - `PATCH /cases/{id}/adopt/priority` - Adopt priority suggestion
  - `PATCH /cases/{id}/adopt/owner` - Adopt owner suggestion
  - GraphQL mutations: `adoptPrioritySuggestion`, `adoptOwnerSuggestion`

- **Metrics** (`metrics.py`)
  - `ml_inference_total{model, status}` - Inference attempts
  - `ml_suggestion_applied_total{type}` - Adoption count (priority/owner)
  - `ml_inference_latency_seconds{model}` - Latency histogram
  - `ml_model_version_info{model, version}` - Model version gauge

### Frontend
- **Case Insights Panel** (`CaseInsights.tsx`)
  - Displays ML-generated suggestions (priority, owner, related cases)
  - "Adopt" buttons for analyst/admin roles
  - Related case chips with navigation
  - ML model version display

- **Cases List Enhancement**
  - "AI Priority" badge indicator for suggested priorities
  - Visual distinction between current and suggested priority

- **Store Updates** (`casesStore.ts`)
  - `adoptPriority(id)` - Adopt priority suggestion
  - `adoptOwner(id)` - Adopt owner suggestion
  - Snake_case to camelCase transformation for API responses

## Post-Release Checklist

### Grafana Panels (Quick Add)

Add the following panels to your Grafana dashboard:

1. **ML Inference Status**
   ```promql
   ml_inference_total{status}
   ```
   - Type: Counter
   - Panel: Bar chart or stat
   - Labels: `status` (success/fail)

2. **ML Suggestion Adoption**
   ```promql
   ml_suggestion_applied_total{type}
   ```
   - Type: Counter
   - Panel: Bar chart or stat
   - Labels: `type` (priority/owner)

3. **ML Inference Latency**
   ```promql
   rate(ml_inference_latency_seconds_bucket[5m])
   ```
   - Type: Histogram
   - Panel: Heatmap or histogram
   - Buckets: 0.001, 0.01, 0.1, 1, 10

4. **Cases Created Per Hour**
   ```promql
   rate(cases_created_total[1h])
   ```
   - Type: Counter
   - Panel: Time series
   - Purpose: Track downstream impact of ML suggestions

### RBAC Verification

Confirm the following access levels:

- **Viewer**: 
  - ✅ Can see Insights panel (read-only)
  - ❌ Cannot see "Adopt" buttons
  - ❌ Cannot adopt suggestions

- **Analyst/Admin**:
  - ✅ Can see Insights panel
  - ✅ Can see "Adopt" buttons
  - ✅ Can adopt suggestions
  - ✅ Metrics increment on adoption

### Quick Verification Commands

```bash
# Check ML metrics
curl -sS http://localhost:8088/metrics | grep -E 'ml_(inference|suggestion|version)'

# Verify case with ML suggestions
curl -sS -H "Authorization: Bearer $TOKEN" \
  http://localhost:8088/cases/5 | jq '.prioritySuggestion, .ownerSuggestion, .similarCaseIds'

# Test adoption endpoint
curl -sS -X PATCH -H "Authorization: Bearer $TOKEN" \
  http://localhost:8088/cases/5/adopt/priority | jq '.priority'
```

## Nice-to-Have Follow-Ups (Low Effort, High Value)

### 1. Confidence Badges in UI
- **Priority Score → Badge Tint & Tooltip**
  - Add `priorityScore` field to ML response (0.0-1.0)
  - Color-code badge: High confidence (≥0.8) = green, Medium (0.5-0.8) = yellow, Low (<0.5) = gray
  - Tooltip: "Confidence: 85%" on hover

### 2. Feature Flag
- **UI Feature Flag**: `VITE_ENABLE_ML=false`
  - Add to `.env` or `envfile`
  - Hide Insights panel when disabled
  - Quick disable if ML suggestions cause issues

### 3. Adoption Audit Trail
- **System Note on Adoption**
  - When suggestion is adopted, append a system note:
    ```
    "System: Adopted priority suggestion 'high' (was 'medium') at 2025-11-05T14:20:00Z by analyst@halcyon.dev"
    ```
  - Similar for owner adoption
  - Helps track ML impact and user behavior

### Implementation Notes

**Priority Scoring Logic:**
- Keywords: "critical", "breach", "outage" → high/critical
- Severity mapping: Event severity influences priority
- Thresholds: Configurable via `ml_scoring.py`

**Owner Suggestion Logic:**
- Historical pattern: Most frequent resolver for similar cases
- Fallback: None if no history available
- Limit: Top 500 resolved cases analyzed

**Similar Case Discovery:**
- Jaccard similarity on case titles
- Token-based matching
- Top 3 most similar cases returned

## Rollback Plan

If issues arise:

1. **Disable ML in UI**: Set `VITE_ENABLE_ML=false` (feature flag)
2. **Disable ML in Backend**: Short-circuit `apply_ml_suggestions()` to no-op
3. **Database**: ML fields are nullable; no data loss risk
4. **Migration**: Migration `011` is additive; safe to keep

## Known Limitations

- Heuristic-based (not true ML model)
- Owner suggestion requires historical data
- Similar cases limited to title similarity
- No confidence scores yet (follow-up item)

## Next Steps

- Monitor metrics for adoption rates
- Collect analyst feedback on suggestion quality
- Consider adding confidence scores
- Plan for true ML model integration (Phase 5?)

---

**Release Notes:** This release completes the ML-assisted triage workflow. Analysts can now leverage AI suggestions to speed up case handling while maintaining full control over adoption decisions.


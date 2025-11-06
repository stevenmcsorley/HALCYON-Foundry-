# Phase 7A: Playbook Studio - Complete

## Overview

Phase 7A transforms the Halcyon Console into a visual automation studio, enabling analysts to design, test, and publish playbooks directly in the UI with optional AI assistance.

## Features

### 1. Visual Canvas
- Drag-and-drop node-based playbook design using React Flow
- Node palette with all available action types
- Visual connection between steps
- Zoom/pan, minimap, and grid snapping

### 2. Live JSON Preview & Validation
- Monaco editor showing live JSON representation
- Real-time validation with inline error/warning display
- Preflight checklist showing:
  - ✓ At least one step
  - ✓ Entry step defined
  - ✓ No dangling edges
  - ✓ All steps connected

### 3. Publish Guardrails
Enhanced validation before publishing:
- **No entry step**: Blocks publish with clear error
- **Dangling edges**: Detects references to non-existent steps
- **Unconnected steps**: Warns about orphaned steps (non-blocking)
- **Empty playbooks**: Blocks publish if no steps

### 4. Templates
Three preset templates for quick start:
- **IP Enrichment**: GeoIP → WHOIS → Output
- **Full Enrichment**: GeoIP → WHOIS → VirusTotal → Reverse Geocode → Output
- **Webhook Notify**: GeoIP → HTTP POST → Output

### 5. Import/Export
- **Export**: Download playbook as JSON file
- **Import**: Upload JSON file with validation
- Supports both frontend and backend formats
- Automatic format transformation

### 6. Versioning & Release Notes
- Automatic version tracking on save/publish
- Optional release notes when publishing
- Version history with diff viewer
- Rollback to any previous version

### 7. Test Run Sandbox
- Simulate playbook execution with mock alert data
- Step-by-step logs and outputs
- No external HTTP calls (sandbox mode)

### 8. AI Assist
- Generate playbooks from natural language prompts
- Explain playbook steps
- OpenAI integration

## Quick Start

### Creating a Playbook from Template

1. Click **"New from Template"** button
2. Select a template (IP Enrichment, Full Enrichment, or Webhook Notify)
3. Enter a playbook name
4. Click on the template card to create

### Creating a Playbook from Scratch

1. Click **"New Draft"** button
2. Enter a playbook name
3. Add steps from the node palette
4. Connect steps by dragging from node handles
5. Set entry point by clicking "Set as Entry" on a node
6. Configure step parameters in the Node Editor

### Validating & Publishing

1. Click **"Validate"** to check for errors
2. Review the **Preflight Checklist**:
   - All items should show ✓ (green)
   - Warnings (⚠) are non-blocking
3. Click **"Publish"** to make the playbook available
4. Optionally add **Release Notes** when publishing

### Importing/Exporting

**Export:**
1. Open a playbook
2. Click **"Export"** button
3. JSON file downloads automatically

**Import:**
1. Open a playbook (or create a new one)
2. Click **"Import"** button
3. Select a JSON file
4. Validation runs automatically
5. Playbook updates with imported data

## Examples

### Example 1: IP Enrichment Playbook

```json
{
  "version": "1.0.0",
  "entry": "geoip-1",
  "steps": [
    {
      "id": "geoip-1",
      "type": "geoip",
      "name": "GeoIP Lookup",
      "next": ["whois-1"]
    },
    {
      "id": "whois-1",
      "type": "whois",
      "name": "WHOIS Lookup",
      "next": ["output-1"]
    },
    {
      "id": "output-1",
      "type": "output",
      "name": "Attach Results",
      "params": {
        "text": "IP enrichment completed"
      },
      "next": []
    }
  ]
}
```

### Example 2: Test Run Mock Alert

```json
{
  "id": "test-alert-1",
  "message": "Suspicious IP 8.8.8.8 detected",
  "attrs": {
    "ip": "8.8.8.8",
    "domain": "example.com",
    "hash": "abc123def456"
  }
}
```

## API Endpoints

### Playbooks
- `GET /playbooks` - List playbooks
- `POST /playbooks` - Create playbook
- `GET /playbooks/{id}` - Get playbook
- `PUT /playbooks/{id}` - Update playbook
- `DELETE /playbooks/{id}` - Delete playbook

### Validation & Testing
- `POST /playbooks/validate` - Validate playbook JSON
- `POST /playbooks/test-run` - Test run with mock data

### Versioning
- `GET /playbooks/{id}/versions` - List versions
- `GET /playbooks/{id}/versions/{version}` - Get specific version
- `POST /playbooks/{id}/rollback/{version}` - Rollback to version

### AI Assist
- `POST /playbooks/ai/generate` - Generate playbook from prompt
- `POST /playbooks/ai/explain` - Explain playbook step

## Metrics

- `playbook_drafts_total{status}` - Draft creation counter
- `playbook_publish_total{user}` - Publish counter
- `playbook_rollback_total{user}` - Rollback counter
- `playbook_test_runs_total{result}` - Test run counter
- `playbook_ai_drafts_total{result}` - AI generation counter

## RBAC

- **Viewer**: View playbooks, preview JSON (read-only)
- **Analyst**: Create/edit drafts, test run, publish
- **Admin**: Full access including rollback and delete

## Troubleshooting

### "Step must have a 'kind' field"
- This error occurs when validation receives frontend format instead of backend format
- The transformation should handle this automatically
- Check that `transformToBackendFormat()` is being called before validation

### "Playbook must have at least one step"
- Empty drafts are allowed
- Publishing requires at least one step
- Add steps before publishing

### "No entry step defined"
- Set an entry point by clicking "Set as Entry" on a node
- The entry step must exist in the steps array

### Dangling edges
- Check that all `next` references point to existing step IDs
- Remove or fix broken connections

## Next Steps

- Auto-binding: Checkbox to run playbook on alert creation
- Template thumbnails: Visual previews on template cards
- Advanced branching: Conditional logic and loops
- Playbook marketplace: Share and import community playbooks

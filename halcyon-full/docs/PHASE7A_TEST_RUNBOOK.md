# Phase 7A – Playbook Studio: Test Runbook

## 0) Pre-flight

### Dependencies
```bash
cd halcyon-full/ui
npm install reactflow monaco-editor @monaco-editor/react zod
```

**Note:** If you encounter permission errors, try:
```bash
sudo npm install reactflow monaco-editor @monaco-editor/react zod
# OR
sudo chown -R $USER:$USER node_modules
```

### Backend Migration
```bash
cd halcyon-full/deploy
docker compose exec postgres psql -U postgres -d halcyon -f /path/to/015_playbook_studio.sql
```

Or manually:
```bash
docker compose exec postgres psql -U postgres -d halcyon
# Then paste the contents of core/enrichment/app/migrations/015_playbook_studio.sql
```

### Environment Variables
```bash
# UI (optional, defaults to http://localhost:8091)
VITE_ENRICHMENT_URL=http://localhost:8091
```

### Services
```bash
cd halcyon-full/deploy
docker compose up -d gateway enrichment postgres
```

Verify services:
```bash
curl http://localhost:8091/health  # Enrichment service
curl http://localhost:8088/health  # Gateway
```

## 1) Happy Path (UI)

### Steps:
1. **Open Console → Playbooks tab**
   - RBAC: viewer=read-only; analyst/admin=edit
   - Tab should be visible for all authenticated users

2. **New Draft**
   - Click "New Draft" button
   - Name: "Geo + WHOIS"
   - Click "Create"

3. **Canvas - Add Nodes**
   - From Node Palette, click: `geoip` → `whois` → `output`
   - Nodes should appear on canvas

4. **Connect Nodes**
   - Drag from `geoip` node bottom handle to `whois` node top handle
   - Drag from `whois` node bottom handle to `output` node top handle
   - Arrows should appear

5. **Set Entry Point**
   - Click on `geoip` node to select it
   - In Node Editor panel (top-right), click "Set as Entry"
   - Entry point should be marked

6. **Set onFail (Optional)**
   - Click on `whois` node
   - In Node Editor, set "On Fail" to "Continue"

7. **Validate**
   - Switch to "JSON" tab
   - Click "Validate" button
   - Should show: ✓ Valid (green)

8. **Publish**
   - Click "Publish" button
   - Confirm in dialog
   - Status pill should flip to "published"

### Acceptance:
- ✅ Nodes render on canvas
- ✅ Links persist on refresh
- ✅ Status updates correctly
- ✅ No console errors

## 2) JSON Preview + Live Validation

### Steps:
1. **Open JSON Preview**
   - Should show pretty JSON with:
     ```json
     {
       "version": "1.0.0",
       "entry": "<geoip-node-id>",
       "steps": [
         { "id": "...", "type": "geoip", "next": ["..."] },
         { "id": "...", "type": "whois", "next": ["..."] },
         { "id": "...", "type": "output" }
       ]
     }
     ```

2. **Break JSON**
   - In JSON preview (read-only, but test via API or edit in code)
   - Or use Validate API directly:
     ```bash
     curl -X POST http://localhost:8091/playbooks/validate \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer $TOKEN" \
       -d '{"jsonBody":{"version":"1.0.0","steps":[]}}'
     ```
   - Should show errors

3. **Restore**
   - Fix the JSON
   - Validate again → Should show ✓ Valid

### Acceptance:
- ✅ JSON preview reflects canvas state
- ✅ Validation errors surface clearly
- ✅ Warnings shown when applicable

## 3) Test Run (Sandbox)

### Steps:
1. **Open Test Run tab**
   - Click "Test Run" tab

2. **Use default mock alert** (or paste):
   ```json
   {
     "id": "test-alert-1",
     "message": "Suspicious IP 8.8.8.8 detected",
     "attrs": {
       "ip": "8.8.8.8",
       "domain": "google.com"
     }
   }
   ```

3. **Run Test**
   - Click "Run Test" button
   - Should show step logs:
     - geoip → success
     - whois → success
     - output → success
   - Should show `success: true`

### Acceptance:
- ✅ Step logs visible
- ✅ Success indicator shown
- ✅ No external HTTP calls made (sandbox mode)
- ✅ UI mentions sandbox mode

## 4) AI Assist

### Steps:
1. **Open AI Assist tab**
   - Click "AI Assist" tab

2. **Generate Draft**
   - Prompt: "Create a playbook: GeoIP → WHOIS → Output formatted summary"
   - Click "Generate Draft"
   - Wait for generation (may take a few seconds)

3. **Confirm Replace**
   - Dialog should appear: "Replace Current Playbook?"
   - Click "Replace"

4. **Validate**
   - Switch to "JSON" tab
   - Click "Validate"
   - Should show ✓ Valid

5. **Publish**
   - Click "Publish"
   - Should succeed

### Acceptance:
- ✅ Generated graph appears on canvas
- ✅ Validation passes
- ✅ Publish works

## 5) Versioning + Rollback

### Steps:
1. **Make a change**
   - Add `keyword_match` node before `output`
   - Connect: `whois` → `keyword_match` → `output`
   - Click "Save Draft"

2. **Open Versions drawer**
   - Click "Versions" tab
   - Should list at least 2 versions

3. **View version**
   - Click on a version
   - Should show JSON diff (side-by-side)

4. **Rollback**
   - Click "Rollback to Version X" (admin/analyst only)
   - Confirm
   - Canvas + JSON should revert
   - Validate → Should show ✓ Valid

### Acceptance:
- ✅ Version history lists versions
- ✅ Rollback works
- ✅ Canvas updates after rollback

## 6) RBAC Sanity

### Steps:
1. **Viewer Role**
   - Login as viewer
   - Can open Playbooks tab
   - Can see canvas/JSON
   - Cannot:
     - Edit nodes
     - Publish
     - Test Run
     - AI Assist
     - Rollback

2. **Analyst/Admin Role**
   - Login as analyst/admin
   - Full control:
     - Edit nodes
     - Publish
     - Test Run
     - AI Assist
     - Rollback

### Acceptance:
- ✅ Viewer: Read-only access
- ✅ Analyst/Admin: Full control

## 7) API Spot Checks

### List Playbooks
```bash
TOKEN="your-jwt-token"
curl -sS -H "Authorization: Bearer $TOKEN" \
  http://localhost:8091/playbooks | jq
```

### Validate Playbook
```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonBody": {
      "version": "1.0.0",
      "entry": "geo1",
      "steps": [
        {"id": "geo1", "type": "geoip", "next": ["who1"]},
        {"id": "who1", "type": "whois", "next": ["out1"]},
        {"id": "out1", "type": "output"}
      ]
    }
  }' \
  http://localhost:8091/playbooks/validate | jq
```

### Get Versions
```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  http://localhost:8091/playbooks/{playbook-id}/versions | jq
```

## Troubleshooting

### Monaco not rendering
- Ensure `@monaco-editor/react` is installed
- Check browser console for CSP blocks
- Verify Monaco CSS is imported

### React Flow edges not saving
- Confirm `onConnect` writes target id into source step's `next[]`
- Check store marks `isDirty` when changes made
- Verify `setCurrentJson` is called on connect

### Publish disabled
- Check for missing/invalid `entry` field
- Verify no dangling `next` references to non-existent steps
- Check validation errors

### 401/403 errors
- Verify JWT token is valid
- Check user has correct role (analyst/admin for edit)
- Verify enrichment service is accessible

### Sandbox run fails
- Check enrichment service is reachable
- Verify test-run endpoint is working
- Check backend logs for errors

## Acceptance Checklist

- [ ] Create draft → 3 nodes → connect → Validate OK → Publish OK
- [ ] JSON preview reflects canvas; validation errors surface clearly
- [ ] Test Run shows logs + success: true
- [ ] AI Generate produces usable draft and replaces current
- [ ] Version history lists versions; Rollback works
- [ ] RBAC enforces viewer read-only

## Notes

- **Format Transformation**: Store handles conversion between frontend format (`{id, type}`) and backend format (`{stepId, kind, actionId}`)
- **Entry Point**: Must be set explicitly via Node Editor or automatically set to first step
- **Node IDs**: Auto-generated as `step-{timestamp}-{random}` to ensure uniqueness
- **API Endpoints**: All endpoints are on enrichment service (port 8091), not gateway


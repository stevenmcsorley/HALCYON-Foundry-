# Phase 7 Roadmap — Next Milestone Options

**Status:** Planning  
**Date:** November 6, 2025  
**Context:** Phase 6C complete — Enrichment & Playbooks production-ready

---

## 🎯 Strategic Overview

With Phase 6C complete, HALCYON has a solid foundation:
- ✅ 7 built-in enrichment actions
- ✅ Multi-step playbook engine
- ✅ UI integration (Alerts + Cases)
- ✅ Observability (metrics, tracing, dashboards)
- ✅ Production-ready deployment

The next phase determines the primary direction: **user empowerment** (7A), **analytical depth** (7B), or **intelligent automation** (7C).

---

## Option A — Phase 7A: Playbook Studio

**Vision:** Transform HALCYON from a triage console into a security-automation studio.

### Core Features

#### 1. Visual Workflow Builder
- **Drag-drop step canvas**
  - Action nodes (GeoIP, WHOIS, VirusTotal, etc.)
  - Control flow nodes (conditionals, loops, waits)
  - Integration nodes (webhooks, API calls)
- **JSON schema validation** with live preview
- **Step-by-step wizard** for non-technical users

#### 2. AI-Assisted Playbook Creation
- **Natural language → Playbook**
  - "Enrich IP addresses, check VirusTotal, then notify if malicious"
  - AI generates JSON structure with appropriate actions
- **Smart suggestions**
  - Recommend actions based on alert/case content
  - Suggest playbook improvements based on historical success rates
- **Context-aware hints**
  - "This playbook typically runs on IP alerts" → auto-tagging

#### 3. Sandbox & Testing
- **"Test Run" mode**
  - Execute playbook against sample data without affecting production
  - Preview outputs at each step
  - Step-by-step debugging
- **Dry-run validation**
  - Check for missing API keys, invalid configs, etc.
  - Validate JSON schema before saving

#### 4. Versioning & Lifecycle
- **Playbook revisions**
  - Git-like versioning (v1.0.0, v1.1.0, etc.)
  - Rollback to previous versions
  - Diff view between versions
- **Publishing workflow**
  - Draft → Review → Published
  - RBAC: viewer (read-only) / analyst (edit) / admin (publish)

#### 5. UI Components
- **Playbook Studio** (`/playbooks/studio`)
  - Visual canvas (React Flow or similar)
  - Sidebar with action library
  - Properties panel for step configuration
- **Playbook Gallery** (`/playbooks`)
  - Browse published playbooks
  - Filter by tags, author, last run
  - Clone/import from community

### Technical Requirements

**Frontend:**
- React Flow or React DnD for visual builder
- Monaco Editor for JSON preview
- AI integration (OpenAI API or local LLM)
- Zustand store for playbook state

**Backend:**
- New `playbooks` table columns: `version`, `draft`, `published_at`
- Playbook validation endpoint (`POST /playbooks/validate`)
- Sandbox execution endpoint (`POST /playbooks/{id}/test`)
- AI prompt endpoint (`POST /playbooks/ai/generate`)

**AI Integration:**
- Prompt engineering for playbook generation
- Context injection (available actions, alert/case schema)
- Fine-tuning on historical playbook data (optional)

### Success Metrics
- **Adoption**: % of analysts creating custom playbooks
- **Efficiency**: Time to create playbook (before: manual JSON, after: visual builder)
- **Quality**: Playbook success rate improvement
- **Usage**: Number of unique playbooks in production

### Estimated Effort
- **Phase 7A.1**: Visual builder (2-3 weeks)
- **Phase 7A.2**: AI assistant (1-2 weeks)
- **Phase 7A.3**: Sandbox & testing (1 week)
- **Phase 7A.4**: Versioning & publishing (1 week)
- **Total**: ~5-7 weeks

### Dependencies
- Phase 6C (playbook engine) ✅
- React Flow or similar library (new)
- OpenAI API key or local LLM setup (new)

---

## Option B — Phase 7B: Knowledge Graph & Correlations

**Vision:** Surface relationships and patterns across alerts, cases, entities, and playbooks.

### Core Features

#### 1. Entity Graph Foundation
- **GraphQL + Neo4j integration**
  - Expand existing Neo4j usage for entity relationships
  - GraphQL queries for traversals (e.g., `alert → relatedAlerts → cases`)
- **NetworkX backend** (alternative/complement)
  - In-memory graph for fast queries
  - Export to Neo4j for persistence

#### 2. Relationship Detection
- **Shared attributes**
  - Same IP address → link alerts
  - Same domain → link alerts/cases
  - Same hash → link alerts
  - Same user → link cases
- **Temporal patterns**
  - Alerts within 5 minutes → potential correlation
  - Cases with overlapping time windows
- **Playbook relationships**
  - Playbooks that ran on similar alerts
  - Successful playbook chains

#### 3. Embedding Similarity Search
- **Vector embeddings** (OpenAI or Sentence Transformers)
  - Alert message embeddings
  - Case description embeddings
  - Playbook output embeddings
- **Similarity search**
  - "Find alerts similar to this one"
  - "Find cases with similar patterns"
  - "Recommend playbooks based on case content"

#### 4. Graph Visualization Panel
- **Interactive graph view** (`/graph`)
  - Nodes: alerts, cases, entities, playbooks
  - Edges: relationships (shared IP, similar content, etc.)
  - Cytoscape.js or D3.js
- **Filtering & search**
  - Filter by entity type, time range, relationship type
  - Search for specific IPs/domains/hashes
- **Contextual actions**
  - Click node → open alert/case
  - Click edge → show relationship details

#### 5. "Related Alerts" Sidebar
- **In Alert Details drawer**
  - "Related Alerts" section
  - Grouped by relationship type (IP, domain, hash, similarity)
  - Link to graph view for full context
- **In Case View**
  - "Related Cases" section
  - "Alerts in this case" section
  - "Suggested playbooks" based on case content

### Technical Requirements

**Backend:**
- Neo4j graph queries (expand existing usage)
- Embedding generation service (Python/FastAPI)
- Vector database (optional: Pinecone, Weaviate, or pgvector)
- GraphQL schema extensions for graph queries

**Frontend:**
- Graph visualization component (Cytoscape.js or D3.js)
- "Related Alerts" sidebar component
- Similarity search UI
- Embedding status indicator

**AI/ML:**
- Embedding model (OpenAI `text-embedding-ada-002` or Sentence Transformers)
- Batch embedding generation for existing alerts/cases
- Real-time embedding for new alerts/cases

### Success Metrics
- **Insights**: % of alerts with discovered relationships
- **Efficiency**: Time to find related incidents
- **Accuracy**: Correlation precision (manual review)
- **Usage**: Graph view engagement rate

### Estimated Effort
- **Phase 7B.1**: Entity graph foundation (2 weeks)
- **Phase 7B.2**: Relationship detection (1-2 weeks)
- **Phase 7B.3**: Embedding similarity search (2 weeks)
- **Phase 7B.4**: Graph visualization UI (2 weeks)
- **Phase 7B.5**: "Related Alerts" sidebar (1 week)
- **Total**: ~8-9 weeks

### Dependencies
- Phase 6C (enrichment data) ✅
- Neo4j (already in stack) ✅
- Embedding service (new)
- Vector database (optional, new)

---

## Option C — Phase 7C: Adaptive Automation

**Vision:** ML feedback loops that auto-tune playbooks and recommend optimal actions.

### Core Features

#### 1. Playbook Effectiveness Measurement
- **Success rate tracking**
  - Playbook success/failure per alert/case type
  - Step-level success rates
  - Outcome tracking (alert resolved, case closed, etc.)
- **Latency metrics**
  - Average execution time per playbook
  - Step duration analysis
- **Resource usage**
  - API calls per playbook (cost tracking)
  - External service rate limits

#### 2. ML-Driven Playbook Recommendation
- **Context-aware suggestions**
  - "For IP alerts, these playbooks have 90% success rate"
  - "This playbook typically resolves similar cases"
- **Action recommendation**
  - "Add VirusTotal check" → suggests based on historical success
  - "Skip GeoIP" → suggests if it rarely adds value
- **A/B testing framework**
  - Compare playbook variants
  - Measure effectiveness differences

#### 3. Automatic Playbook Optimization
- **Step reordering**
  - Suggest optimal step order based on latency/success
  - "Run fast checks first, expensive checks only if needed"
- **Conditional logic enhancement**
  - Suggest `continue_on_error` settings
  - Suggest `if` conditions based on historical data
- **Action parameter tuning**
  - Suggest API key configurations
  - Suggest timeout values

#### 4. Feedback Loop
- **Analyst feedback**
  - "This playbook helped" / "This playbook didn't help"
  - Explicit rating system
- **Automated learning**
  - Monitor playbook outcomes (alert resolved, case closed)
  - Retrain recommendation models
  - Update playbook rankings

### Technical Requirements

**Backend:**
- ML model training pipeline (Python/scikit-learn or TensorFlow)
- Playbook effectiveness database (metrics aggregation)
- Recommendation API endpoint (`GET /playbooks/recommend`)
- A/B testing framework

**Frontend:**
- Playbook recommendation UI
- Effectiveness dashboard
- Analyst feedback buttons
- A/B test comparison view

**ML/Data Science:**
- Feature engineering (alert type, case type, historical success)
- Model training (collaborative filtering or reinforcement learning)
- Model evaluation and deployment
- Continuous learning pipeline

### Success Metrics
- **Effectiveness**: Playbook success rate improvement (%)
- **Efficiency**: Average time to resolution (before/after)
- **Adoption**: % of recommended playbooks used
- **Accuracy**: Recommendation precision (manual review)

### Estimated Effort
- **Phase 7C.1**: Effectiveness measurement (1-2 weeks)
- **Phase 7C.2**: ML recommendation system (3-4 weeks)
- **Phase 7C.3**: Automatic optimization (2-3 weeks)
- **Phase 7C.4**: Feedback loop (1-2 weeks)
- **Total**: ~7-11 weeks

### Dependencies
- Phase 6C (playbook engine + metrics) ✅
- Historical playbook data (collecting now)
- ML infrastructure (new)
- A/B testing framework (new)

---

## 📊 Comparison Matrix

| Criteria | Phase 7A (Studio) | Phase 7B (Graph) | Phase 7C (Adaptive) |
|----------|-------------------|------------------|---------------------|
| **User Impact** | High (empowers analysts) | Medium (insights) | High (automation) |
| **Technical Complexity** | Medium | High | High |
| **Time to Value** | Fast (2-3 weeks for MVP) | Medium (4-5 weeks) | Slow (6-8 weeks) |
| **Dependencies** | Low (Phase 6C only) | Medium (Neo4j + embeddings) | Medium (ML infrastructure) |
| **Risk** | Low | Medium | High (ML complexity) |
| **ROI** | High (immediate productivity) | Medium (analytical depth) | High (long-term efficiency) |

---

## 🎯 Recommendation

### **Option A (Playbook Studio) — Recommended First**

**Rationale:**
1. **Lowest risk, highest immediate value**
   - Builds directly on Phase 6C
   - Empowers users to create playbooks themselves
   - Reduces dependency on developers for playbook creation

2. **Foundation for future phases**
   - 7B (Graph) can use playbook relationships from Studio
   - 7C (Adaptive) can learn from user-created playbooks

3. **Clear user story**
   - "I want to create a playbook without writing JSON"
   - "I want to test my playbook before publishing"
   - "I want AI to help me write playbooks"

4. **Incremental delivery**
   - Can ship visual builder first (MVP in 2-3 weeks)
   - Add AI assistant later
   - Add versioning later

### **Option B (Knowledge Graph) — Recommended Second**

**Rationale:**
1. **Complements Studio**
   - Users create playbooks in Studio → Graph shows relationships
   - Graph reveals patterns → Users create better playbooks

2. **Analytical depth**
   - Provides insights that manual triage can't surface
   - Enables proactive threat detection

3. **Leverages existing infrastructure**
   - Neo4j already in stack
   - Can reuse Cytoscape.js from existing graph panel

### **Option C (Adaptive Automation) — Recommended Third**

**Rationale:**
1. **Requires data**
   - Needs historical playbook execution data
   - Benefits from user-created playbooks (Phase 7A)

2. **Highest complexity**
   - ML model training and evaluation
   - Continuous learning pipeline
   - A/B testing framework

3. **Long-term value**
   - Maximum efficiency gains
   - Self-optimizing system

---

## 🚀 Next Steps

### If choosing **Phase 7A (Playbook Studio)**:
1. Set up React Flow or React DnD
2. Design playbook JSON schema
3. Create visual builder component
4. Implement AI assistant (OpenAI API)
5. Add sandbox testing mode

### If choosing **Phase 7B (Knowledge Graph)**:
1. Expand Neo4j graph queries
2. Implement relationship detection logic
3. Set up embedding service
4. Create graph visualization UI
5. Add "Related Alerts" sidebar

### If choosing **Phase 7C (Adaptive Automation)**:
1. Design effectiveness metrics schema
2. Implement ML recommendation model
3. Create feedback loop infrastructure
4. Build recommendation UI
5. Set up A/B testing framework

---

## 📝 Decision Log

**Decision Date:** TBD  
**Chosen Option:** TBD  
**Rationale:** TBD  
**Expected Start:** TBD  
**Expected Completion:** TBD

---

**Document Version:** 1.0  
**Last Updated:** November 6, 2025


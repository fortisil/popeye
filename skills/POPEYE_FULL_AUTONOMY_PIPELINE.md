# Popeye Full Autonomy Pipeline Spec
Version: 1.1 (Autonomy Hardening Gap Fixes)
Goal: 1 idea -> 1 prompt -> Popeye -> production-ready system (PASS Production Gate)

This spec defines the end-to-end autonomous workflow Popeye must execute, including:
- Phase sequencing (no skipping)
- Required artifacts per phase
- Consensus mechanics
- Hard gates and pass/fail criteria
- Recovery loop (Debugger-driven RCA → targeted fixes)
- Immutable documentation (Journalist)
- Release packaging (Release Manager)

---

## 0) Roles and Ownership Map

### Orchestration & Governance
- **Popeye (Dispatcher/Manager)**: phase control, routing, dependency enforcement, gate decisions
- **Reviewer(s)**: independent plan audits + structured votes
- **Arbitrator**: convergence mediator + binding decision + merged plan patch when needed
- **Journalist**: immutable recording of all approved artifacts under `/docs/`

### Build Roles
- **Architect**: system topology, contracts, repo structure blueprint, env vars, integration contracts
- **DB Expert**: schema, migrations, indexes, rollback strategy
- **Backend Programmer**: services/endpoints/business logic + tests
- **Frontend Programmer**: UI + typed client + auth flow + error/empty/loading states
- **Website Programmer**: marketing/docs website (if part of Master Plan)
- **QA / Tester**: test plan first-class + validation after implementation

### Post-Build Intelligence
- **Debugger**: RCA root cause analysis + ownership + corrective recommendation
- **Auditor**: holistic final system audit
- **Release Manager**: production packaging + deployment steps + rollback plan + release notes

---

## 1) Artifact System (Mandatory)

All key workflow decisions are materialized into artifacts.

### Artifact locations (canonical)
- `/docs/master-plan/`
- `/docs/architecture/`
- `/docs/role-plans/`
- `/docs/consensus/`
- `/docs/arbitration/`
- `/docs/audit/`
- `/docs/incidents/`
- `/docs/production/`
- `/docs/release/`
- `/docs/INDEX.md` (Journalist-maintained)

### Artifact types (minimum)
- Master Plan (md + optional json)
- Architecture (md + optional json)
- Role Plans (md + optional json per role)
- Plan Packet (md/json structure per schema)
- Consensus Packet (md/json structure per schema)
- Audit Report (md/json)
- RCA Report (md/json)
- Production Readiness Report (md/json)
- Release Notes (md)

### Immutability rule
Artifacts are never overwritten. New versions create new files.

---

## 2) Gate Engine: State Machine (No Skipping)

### States
1. INTAKE
2. CONSENSUS_MASTER_PLAN
3. ARCHITECTURE
4. CONSENSUS_ARCHITECTURE
5. ROLE_PLANNING
6. CONSENSUS_ROLE_PLANS
7. IMPLEMENTATION
8. QA_VALIDATION
9. REVIEW
10. AUDIT
11. PRODUCTION_GATE
12. RECOVERY_LOOP (conditional)
13. DONE (PASS)
14. STUCK (safety valve)

### Allowed transitions
- Each phase may only transition to the next if all required artifacts exist and the gate passes.
- Any failure routes to RECOVERY_LOOP, except missing inputs which route back to the phase that needs them.

### v1.1 Gate Behaviors (Autonomy Hardening)

Between phase execution and transition, the orchestrator now applies three additional checks:

1. **Constitution Verification**: Before every `evaluateGate()` call, verifies that `skills/POPEYE_CONSTITUTION.md` has not been modified since pipeline start (SHA-256 hash comparison). If the constitution is invalid, the gate is blocked.

2. **Gate Result Merge**: After gate evaluation, preserves `score`/`consensusScore` values stored by consensus phase handlers while updating `pass`/`blockers` from the gate engine. Prevents overwriting of consensus scores.

3. **Change Request (CR) Routing**: After REVIEW and AUDIT phases pass their gates, checks `pipeline.pendingChangeRequests` for any `proposed` CRs. If found, deterministically routes to the appropriate consensus phase (based on change type) rather than continuing normal progression. CR lifecycle: `proposed` -> `approved` (when routed) or `rejected`.

### v1.1 Pipeline State Additions

```
pendingChangeRequests?: Array<{
  cr_id: string;
  change_type: 'scope' | 'architecture' | 'dependency' | 'config' | 'requirement';
  target_phase: PipelinePhase;
  status: 'proposed' | 'approved' | 'rejected';
}>;
```

---

## 3) Phase-by-Phase Specification

### Phase 1 — INTAKE
**Purpose**: Normalize a single user prompt into a structured Master Plan v1 (deterministic scope).

**Inputs**
- User prompt (idea/spec)
- Any repo context (if project already exists)

**Actions**
- Extract:
  - Product goal
  - Users & primary workflows
  - Must-have features
  - Nice-to-have features
  - Out-of-scope items
  - Non-functional requirements (security, performance, compliance)
  - Constraints (stack, hosting, DB, auth, integrations)
  - Success criteria / Definition of Done

**Outputs (required)**
- `Master Plan v1` → `/docs/master-plan/master_plan_<id>_v1_<date>.md`
- `Plan Packet` for Master Plan review (per schema)

**Gate conditions**
- Master Plan is deterministic (no vague “add features”).
- Assumptions are explicit.
- Out-of-scope is explicit.

**Failure modes**
- Missing critical requirements → add explicit assumptions + flagged “Open Questions” section (still proceeds to consensus).

---

### Phase 2 — CONSENSUS on Master Plan
**Purpose**: Multi-LLM validation that the Master Plan is coherent, complete, and non-hallucinatory.

**Inputs**
- Master Plan Plan Packet

**Actions**
- Reviewer(s) produce structured votes
- Arbitrator converges if needed

**Outputs (required)**
- `Consensus Packet` → `/docs/consensus/consensus_<packet-id>_v1_<date>.md`
- If patched: `Master Plan v2` + updated packet version

**Gate conditions (PASS)**
- Consensus threshold met (e.g., ≥95% approvals)
- No unresolved blocking issues
- No Constitution violations
- Plan is complete enough to design architecture

**If FAIL**
- Return to INTAKE with explicit revision instructions (Dispatcher-owned)
- Re-run consensus

---

### Phase 3 — ARCHITECTURE
**Purpose**: Create system architecture + explicit contracts so BE/FE/DB can plan without inventing.

**Inputs**
- Approved Master Plan
- Repo snapshot (what exists)

**Actions (Architect)**
- Define:
  - System topology & boundaries
  - Module/service boundaries
  - API contracts (OpenAPI-like)
  - Auth model and security assumptions
  - Data ownership boundaries
  - Env var list
  - Repo layout blueprint
  - Error handling strategy
  - Scaling assumptions & risks

**Outputs (required)**
- Architecture doc → `/docs/architecture/architecture_<id>_v1_<date>.md`
- Contract section(s) included (API, data, env, auth)
- Plan Packet for Architecture review

**Gate conditions**
- Contracts explicit enough for FE/BE to build without guessing
- Env vars enumerated
- Integration points enumerated

---

### Phase 4 — CONSENSUS on Architecture
**Purpose**: Ensure architecture is feasible, consistent, and complete.

**Inputs**
- Architecture Plan Packet

**Outputs**
- Consensus Packet
- If patched: Architecture v2

**Gate conditions (PASS)**
- Consensus threshold met
- No unresolved integration gaps
- No contradictory contracts

**If FAIL**
- Return to ARCHITECTURE with targeted patch instructions

---

### Phase 5 — ROLE PLANNING
**Purpose**: Produce deterministic implementation plans by role, based on approved architecture.

**Inputs**
- Approved Master Plan
- Approved Architecture
- Repo snapshot

**Actions**
- DB Expert plan (schema + migrations + rollback + indexes)
- BE plan (endpoints + services + validation + tests)
- FE plan (screens + typed client + auth + error/empty/loading + tests as relevant)
- Website plan (pages + SEO + analytics + brand alignment) if in scope
- QA plan (critical paths + integration tests + regression suite + commands)

**Outputs (required)**
- Role plans under `/docs/role-plans/`
  - `db_plan_<id>_v1_<date>.md`
  - `backend_plan_<id>_v1_<date>.md`
  - `frontend_plan_<id>_v1_<date>.md`
  - `website_plan_<id>_v1_<date>.md` (if relevant)
  - `qa_plan_<id>_v1_<date>.md`
- Either:
  - One combined Plan Packet referencing all role plans, OR
  - One Plan Packet per role plan

**Gate conditions**
- Ownership respected (schema only by DB Expert, contracts only by Architect)
- Each plan includes deterministic file-level outputs
- QA plan lists executable tests (not “write tests”)

---

### Phase 6 — CONSENSUS on Role Plans
**Purpose**: Prevent downstream gaps and shortcuts by validating each role plan.

**Inputs**
- Role Plan Packet(s)

**Outputs**
- Consensus Packet(s) for role plans
- Patched role plans if needed

**Gate conditions (PASS)**
- All required plans are approved
- Dependencies satisfied:
  - FE depends on API contracts
  - BE depends on DB plan if DB exists
  - QA depends on feature list + contracts

**If FAIL**
- Return only the failing plan to ROLE PLANNING (targeted iteration)

---

### Phase 7 — IMPLEMENTATION
**Purpose**: Build the system according to the approved plans (no drift).

**Inputs**
- Approved Architecture
- Approved Role Plans
- Approved QA plan

**Actions**
- BE implements endpoints/services/auth/validation
- DB implements migrations/models
- FE implements UI and wires to real endpoints
- Website implements site pages if in scope
- Unit tests added as defined in QA/role plans

**Outputs**
- Code changes in repo
- Build/test command logs captured (for later gates)
- Updated repo snapshot

**Gate conditions**
- Implementation matches plan (no unapproved changes)
- No placeholders/mocks unless explicitly approved

---

### Phase 8 — QA VALIDATION
**Purpose**: Execute QA plan and validate critical paths.

**Inputs**
- QA plan
- Repo state
- Build/test outputs

**Actions**
- Run specified tests
- Validate critical workflows end-to-end
- Produce QA report

**Outputs (required)**
- QA validation report → `/docs/role-plans/qa_validation_<id>_<date>.md`
- Any failures captured as incidents (optional early RCA trigger)

**Gate conditions (PASS)**
- All critical path tests pass
- Any known gaps are explicitly listed (should route to recovery if blocking)

---

### Phase 9 — REVIEW
**Purpose**: Verify the implementation matches approved plans with evidence.

**Inputs**
- Repo snapshot
- Approved plans + contracts
- QA report

**Actions**
- Reviewer checks:
  - plan alignment
  - evidence references
  - no shortcuts
  - integration wiring
- Generate fresh repo snapshot and diff against baseline (role-plan-approval snapshot)
- Detect implementation drift (config changes, significant line deltas)

**Outputs**
- Review decision doc -> `/docs/consensus/review_<id>_<date>.md`
- If rejected: structured blocking list
- v1.1: Change Request artifacts for detected drift (stored as `change_request` artifacts)
- v1.1: Pending CRs registered in `pipeline.pendingChangeRequests` for orchestrator routing

**Gate conditions (PASS)**
- Reviewer approves with evidence
- No Constitution violations

**v1.1 Post-Gate Behavior**
- After REVIEW gate passes, orchestrator checks `pendingChangeRequests` for proposed CRs
- If CRs exist, routes to the appropriate consensus phase (e.g., CONSENSUS_MASTER_PLAN for scope drift)
- If no CRs, continues to AUDIT normally

---

### Phase 10 — AUDIT
**Purpose**: Holistic verification before Production Gate.

**Inputs**
- Everything above + repo snapshot + logs

**Actions (Auditor)**
- Integration audit (FE<->BE, BE<->DB)
- Config/env audit
- Tests/coverage audit
- Migration audit
- Basic security audit
- Deployment readiness audit

**Outputs (required)**
- Audit Report -> `/docs/audit/audit_<id>_<date>.md`
- Audit Report schema (JSON)
- v1.1: Change Request artifacts for blocking architectural/security findings
- v1.1: Pending CRs registered in `pipeline.pendingChangeRequests` for orchestrator routing

**Gate conditions (PASS)**
- No P0/P1 findings open
- Deployment path exists
- No hardcoded secrets
- End-to-end wiring verified

**v1.1 Post-Gate Behavior**
- After AUDIT gate passes, orchestrator checks `pendingChangeRequests` for proposed CRs
- Architectural findings (integration/schema blocking issues) create CRs targeting CONSENSUS_ARCHITECTURE
- Security findings create CRs targeting CONSENSUS_MASTER_PLAN
- If CRs exist, routes to the appropriate consensus phase before PRODUCTION_GATE
- If no CRs, continues to PRODUCTION_GATE normally

**If FAIL**
- Enter RECOVERY_LOOP

---

### Phase 11 — PRODUCTION GATE
**Purpose**: Binary pass/fail “production-ready” decision.

**Inputs**
- Audit PASS
- Build/test/lint/typecheck results
- Deployment instructions present

**Required checks (minimum)**
- Build passes
- Tests pass (unit + integration as required)
- Lint/typecheck pass (as applicable)
- Migrations apply cleanly (if DB)
- Audit PASS
- No unresolved incidents

**Outputs (required)**
- Production Readiness Report → `/docs/production/production_readiness_<id>_<date>.md`
- Final verdict: PASS/FAIL

**If PASS**
- Transition to DONE (with logging + release)

**If FAIL**
- Enter RECOVERY_LOOP

---

## 4) Recovery Loop (FAIL -> Debugger -> Plan -> Fix -> Retest)

### Phase 12 — RECOVERY_LOOP (conditional)
**Purpose**: Self-heal deterministically using RCA, not guesswork.

**Inputs**
- Failure evidence (logs, stack traces, failing tests, audit findings)
- All `/docs/` artifacts (Journalist record)
- Repo snapshot

**Steps**
1) **Debugger produces RCA**
   - root cause (precise)
   - origin phase (architecture / role planning / implementation / config / QA)
   - ownership (which role must fix)
   - recommended corrective actions
   - prevention suggestion
   - v1.1: `requires_phase_rewind_to` field specifying which phase to rewind to

2) **Dispatcher generates Recovery Plan**
   - targeted tasks mapped to responsible role(s)
   - artifacts to update (if needed)
   - whether consensus required (schema/contract changes must re-consensus)

3) **Consensus on Recovery Plan** (recommended; mandatory for architecture/schema changes)

4) **Implement fixes** (by responsible role)

5) **Post-recovery routing** (v1.1 — RCA-driven rewind):
   - Orchestrator reads latest RCA JSON artifact from disk
   - If RCA specifies `requires_phase_rewind_to`, pipeline rewinds to that phase
   - Otherwise, retests the originally failed phase, then proceeds forward:
     - If failed at Audit -> rerun Audit
     - If failed at Production Gate -> rerun Production checks
     - If failed tests -> rerun tests + QA validation
   - If no failed phase is tracked, defaults to QA_VALIDATION

**Outputs (required)**
- RCA report -> `/docs/incidents/rca_<id>_<date>.md` (both markdown and JSON, JSON includes `requires_phase_rewind_to`)
- Recovery plan packet + consensus packet
- Updated artifacts if scope/contracts changed

**Stop conditions**
- Max recovery iterations (default: 5)
- If exceeded -> STUCK state with “Stuck Report”

---

## 5) PASS Path: Journalist + Release Notes

### Phase 13 — DONE (PASS)
**Purpose**: Finalize immutable documentation + release packaging.

**Actions**
- Journalist:
  - logs all final Plan/Consensus/Audit/Production artifacts under `/docs/`
  - updates `/docs/INDEX.md`
- Release Manager:
  - produces release notes
  - produces deployment instructions
  - produces rollback plan
  - stores under `/docs/release/`

**Outputs (required)**
- `/docs/release/release_notes_<id>_<date>.md`
- `/docs/release/deployment_<id>_<date>.md`
- `/docs/release/rollback_<id>_<date>.md`
- `/docs/INDEX.md` updated

---

## 6) STUCK State (Safety Valve)

If recovery iterations exceed max, Popeye must stop and output:

**Stuck Report** → `/docs/incidents/stuck_<id>_<date>.md` including:
- current failing gate
- last RCA summary
- top 3 suspected resolution paths
- what missing human input is required (if any)
- which artifacts must be updated

---

## 7) Non-Negotiable Rules (Autonomy Hardening)

- No skipping phases
- No “mock until later” unless explicitly approved by consensus
- Any schema/contract change requires:
  - updated artifact(s)
  - re-consensus
  - Journalist record
- Every plan claim must be evidenced against repo snapshot
- Production readiness is binary, not “looks good”

### v1.1 Additions

- Constitution integrity is verified at every gate (SHA-256 hash comparison). A modified constitution blocks all gate progression until resolved.
- Consensus scores from phase handlers are never overwritten by gate engine evaluation (gate result merge rule).
- REVIEW and AUDIT phases must register detected issues as Change Requests in `pipeline.pendingChangeRequests`.
- CRs are routed deterministically by the orchestrator (not advisory). The routing is a deterministic transition, not a suggestion.
- RCA packets must include a `requires_phase_rewind_to` field when the root cause originates in a phase earlier than the one that failed. The orchestrator reads this from the JSON artifact on disk.
- CRs are processed one at a time (first `proposed` CR is routed and marked `approved` before the next is considered).

---

End of Spec.
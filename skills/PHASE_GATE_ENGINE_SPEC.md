# PHASE GATE ENGINE SPEC

Defines the deterministic workflow engine of Popeye.

Version: 1.1 (Autonomy Hardening Gap Fixes)

---

## States

INTAKE
CONSENSUS_MASTER_PLAN
ARCHITECTURE
CONSENSUS_ARCHITECTURE
ROLE_PLANNING
CONSENSUS_ROLE_PLANS
IMPLEMENTATION
QA_VALIDATION
REVIEW
AUDIT
PRODUCTION_GATE
RECOVERY_LOOP (conditional)
DONE
STUCK (safety valve)

---

## Gate Rules

Each state defines:

- Required Artifacts
- Required Build/Test Commands
- Required Consensus Status (threshold for consensus phases)
- Allowed Transitions
- Fail Transition (always RECOVERY_LOOP, except terminal phases)

No state skipping allowed.

---

## Gate Evaluation (v1.1)

Before evaluating any gate, the orchestrator performs:

1. **Constitution Verification** - verifies `skills/POPEYE_CONSTITUTION.md` hash matches the stored hash from pipeline start. If the constitution has been modified, the gate is blocked.

2. **Gate Evaluation** - checks required artifacts, check results, and consensus thresholds. The `evaluateGate()` function accepts optional `constitutionValid` and `constitutionReason` options.

3. **Gate Result Merge** - preserves `score`/`consensusScore` values from consensus phase handlers while updating `pass`/`blockers` from the gate engine. This prevents consensus scores from being overwritten.

## GateResult Interface

```typescript
interface GateResult {
  phase: PipelinePhase;
  pass: boolean;
  score?: number;           // Consensus score from phase handler (preserved by merge)
  blockers: string[];
  missingArtifacts: ArtifactType[];
  failedChecks: GateCheckType[];
  consensusScore?: number;  // Alternative consensus score field (preserved by merge)
  timestamp: string;
}
```

---

## Change Request Routing (v1.1)

After REVIEW and AUDIT phases pass their gates, the orchestrator checks `pipeline.pendingChangeRequests` for any CRs with `status: 'proposed'`. If found, the pipeline routes to the CR's `target_phase` instead of continuing normal progression.

### CR Routing Map

| Change Type   | Target Phase             |
|---------------|--------------------------|
| scope         | CONSENSUS_MASTER_PLAN    |
| architecture  | CONSENSUS_ARCHITECTURE   |
| dependency    | CONSENSUS_ROLE_PLANS     |
| config        | QA_VALIDATION            |
| requirement   | CONSENSUS_MASTER_PLAN    |

### CR Lifecycle

```
proposed  ->  approved (routed by orchestrator)
          ->  rejected
```

### CR Sources

- **REVIEW phase**: Creates CRs when implementation drift is detected (config changes, large line deltas)
- **AUDIT phase**: Creates CRs for blocking architectural findings and security issues

---

## Recovery Loop

If any gate FAILS:

1. Enter RECOVERY_LOOP
2. Trigger Debugger for RCA
3. Produce RCA Packet (JSON artifact with `requires_phase_rewind_to` field)
4. Dispatcher generates Recovery Plan
5. Consensus on Recovery Plan
6. Implement fixes
7. On RECOVERY_LOOP success:
   - If RCA specifies `requires_phase_rewind_to`, rewind to that phase
   - Otherwise, re-run the originally failed phase
8. Max 5 iterations before STUCK

### RCA Rewind (v1.1)

After RECOVERY_LOOP succeeds, the orchestrator reads the latest RCA JSON artifact from disk and parses `requires_phase_rewind_to`. This enables root-cause-aware recovery:

- Implementation failure caused by architecture gap: rewind to ARCHITECTURE
- QA failure caused by missing role plan: rewind to ROLE_PLANNING
- If no rewind target or no RCA found: return to the originally failed phase

---

## Termination Conditions

- Production Gate PASS -> DONE
- Max Recovery Reached -> STUCK REPORT

---

## Stuck Report Must Include

- Current failure
- Root cause summary
- Failed iterations count
- Required human input

---

## State Transition Example

ARCHITECTURE -> allowed only if:
- Architecture Plan exists
- Repo snapshot exists
- Constitution integrity verified (v1.1)
- No blocking issues

IMPLEMENTATION -> allowed only if:
- Role Plans approved (consensus threshold met)
- Constitution integrity verified (v1.1)
- No pending change requests (v1.1)

REVIEW -> AUDIT (or CR target) after:
- Review decision artifact exists
- Repo snapshot exists
- Constitution integrity verified (v1.1)
- If pending CRs exist -> route to CR target phase (v1.1)
- If no pending CRs -> normal progression to AUDIT

---

## Pipeline State Schema (v1.1 additions)

```typescript
pendingChangeRequests?: Array<{
  cr_id: string;
  change_type: 'scope' | 'architecture' | 'dependency' | 'config' | 'requirement';
  target_phase: PipelinePhase;
  status: 'proposed' | 'approved' | 'rejected';
}>;

failedPhase?: PipelinePhase;  // Tracks which phase failed for recovery routing
```
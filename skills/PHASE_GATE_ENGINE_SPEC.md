# PHASE GATE ENGINE SPEC

Defines the deterministic workflow engine of Popeye.

---

## States

INTAKE
MASTER_PLAN
ARCHITECTURE
ROLE_PLANNING
CONSENSUS
IMPLEMENTATION
QA_VALIDATION
REVIEW
ARBITRATION (conditional)
AUDIT
PRODUCTION_GATE
RECOVERY (conditional)
DONE

---

## Gate Rules

Each state defines:

- Required Artifacts
- Required Build/Test Commands
- Required Consensus Status
- Allowed Transitions

No state skipping allowed.

---

## Recovery Loop

If any gate FAILS:

1. Trigger Debugger
2. Produce RCA Packet
3. Dispatcher generates Recovery Plan
4. Consensus on Recovery Plan
5. Implement
6. Re-run failed gate
7. Max 5 iterations

---

## Termination Conditions

- Production Gate PASS → DONE
- Max Recovery Reached → STUCK REPORT

---

## Stuck Report Must Include

- Current failure
- Root cause summary
- Failed iterations count
- Required human input

---

## State Transition Example

ARCHITECTURE → allowed only if:
- Architecture Plan exists
- Consensus ≥ threshold
- No blocking issues

IMPLEMENTATION → allowed only if:
- Role Plans approved
- DB Plan approved
- QA Plan approved
# CONSENSUS PACKET SCHEMA
Version: 1.0
Purpose: Structured record of Reviewer votes and Arbitrator decisions.

Consensus is computed from this packet.

---

# 1. Required Top-Level Fields

1. metadata
2. plan_packet_reference
3. reviewer_votes
4. consensus_rules
5. consensus_result
6. arbitrator_result (if applicable)
7. final_status

---

# 2. Field Definitions

## 2.1 metadata

- consensus_id (UUID)
- timestamp
- phase
- target_artifact

---

## 2.2 plan_packet_reference

- packet_id
- version
- hash (optional but recommended)

Must match Plan Packet exactly.
No voting on outdated packets allowed.

---

## 2.3 reviewer_votes

Array of structured votes:

Each vote MUST contain:

- reviewer_id
- verdict (APPROVE / APPROVE_WITH_MINOR_CHANGES / REJECT / BLOCKED)
- score (0–100)
- blocking_issues[]
- non_blocking_issues[]
- hallucination_flags[]
- constitution_violations[]
- confidence_level (Low / Medium / High)

---

## 2.4 consensus_rules

Example:

- required_threshold: 95%
- minimum_reviewers: 2
- reject_if_any_hallucination: true
- reject_if_blocking_issue: true

Rules must be explicit.
No implicit assumptions.

---

## 2.5 consensus_result

Computed fields:

- total_reviewers
- approvals
- rejections
- approval_percentage
- blocking_issue_count
- hallucination_count
- constitution_violation_count

Must be mechanically computable.

---

## 2.6 arbitrator_result (if triggered)

Required if:

- Approval percentage < threshold
- Reviewers conflict
- Hallucination flags present
- Blocking issues exist

Must include:

- final_verdict
- convergence_summary
- merged_patch (if any)
- rejected_items
- required_revisions
- dispatcher_next_action

---

## 2.7 final_status

One of:

- APPROVED
- APPROVED_WITH_PATCH
- REJECTED
- BLOCKED
- REVISION_REQUIRED

No ambiguous states allowed.

---

# 3. Automatic Consensus Failure Conditions

Consensus fails automatically if:

- Any reviewer flags hallucination AND evidence confirms it
- Any blocking issue remains unresolved
- Approval percentage < required threshold
- Constitution violation exists

---

# 4. Consensus Success Conditions

Consensus succeeds if:

- Approval percentage ≥ threshold
- No unresolved blocking issues
- No confirmed hallucinations
- Constitution compliance confirmed

---

# 5. Revision Flow

If final_status = REVISION_REQUIRED:

Dispatcher must:
1. Update Plan Packet
2. Increment version
3. Re-run full review cycle

Partial voting not allowed.

---

# 6. Immutable Record Rule

Consensus Packet must be stored and never mutated.
New version requires new packet_id.

---

End of Schema.
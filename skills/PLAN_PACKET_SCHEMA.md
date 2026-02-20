# PLAN PACKET SCHEMA
Version: 1.0
Purpose: Standardized artifact required for Reviewer and Arbitrator evaluation.

This schema defines the exact structure of a Plan Packet that must be submitted
for consensus review.

No Reviewer may operate without a valid Plan Packet.

---

# 1. Required Top-Level Fields

A valid Plan Packet MUST contain:

1. metadata
2. master_plan_reference
3. current_phase
4. repo_snapshot
5. constraints
6. constitution_reference
7. proposed_plan
8. acceptance_criteria
9. artifact_dependencies

If any field is missing → BLOCKED: Missing Inputs

---

# 2. Field Definitions

## 2.1 metadata

Required:

- project_name
- packet_id (UUID)
- version
- timestamp
- author_role (Dispatcher/Popeye)
- target_phase

Example:
metadata:
project_name: popeye-cli
packet_id: 2f8a...
version: 1.3
timestamp: 2026-02-20T12:45:00Z
author_role: Dispatcher
target_phase: Architecture


---

## 2.2 master_plan_reference

Must include:

- master_plan_version
- summary_of_scope
- explicit link/path to stored master plan artifact

Must confirm:
- No scope drift
- No unapproved changes

---

## 2.3 current_phase

One of:

- MasterPlan
- Architecture
- RolePlanning
- Consensus
- Implementation
- QA
- Review
- Arbitration
- Completion

---

## 2.4 repo_snapshot

Must include:

- existing folders
- key files
- declared tech stack
- declared dependencies
- env vars currently defined
- database state (if exists)
- build status (if known)

Must not hallucinate files.
Must reflect actual filesystem.

---

## 2.5 constraints

Include:

- Language(s)
- Framework(s)
- Hosting constraints
- Performance requirements
- Security constraints
- Backward compatibility requirements
- Regulatory constraints (if any)

---

## 2.6 constitution_reference

Must confirm:

- Constitution version used
- No violations detected prior to review

---

## 2.7 proposed_plan

This is the artifact under review.

Must include:

- Clear phase breakdown
- Role ownership per task
- Explicit artifact outputs
- Integration wiring steps
- Risk handling
- Testing plan references
- Build validation steps

Proposed plan MUST be deterministic.
No vague phrases allowed:
- "handle errors"
- "add tests"
- "connect later"
- "implement logic"

Everything must specify what, where, and how.

---

## 2.8 acceptance_criteria

Must list:

- Functional requirements
- Non-functional requirements
- Integration requirements
- Test pass conditions
- Build pass condition
- Deployment criteria (if relevant)

---

## 2.9 artifact_dependencies

Explicit dependency mapping:

Example:

- Architecture → required before BE
- DB Schema → required before BE
- API Contract → required before FE
- QA Plan → required before Implementation
- Review Approval → required before Completion

Missing dependency mapping → automatic rejection.

---

# 3. Plan Packet Validation Rules

A Plan Packet is INVALID if:

- It references files not present in repo_snapshot
- It introduces schema changes without DB ownership
- It begins implementation before architecture approval
- It omits test strategy
- It lacks integration wiring steps
- It includes placeholders or mocks without explicit approval

---

# 4. Hallucination Detection Rule

If proposed_plan references:

- Non-existent modules
- Non-existent env vars
- Undefined API routes
- Undefined DB tables
- Undefined services

Reviewer must flag as Hallucination.

---

# 5. Determinism Requirement

Plan must be executable step-by-step.

If two different engineers could interpret steps differently → it fails determinism.

---

# 6. Versioning

Every Plan Packet must increment version if modified.

No silent edits allowed.

---

End of Schema.
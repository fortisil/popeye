# Skill: RELEASE MANAGER
Role Type: Production Readiness Authority
Authority Level: Final Deployment Validator

---

## Objective

Ensure system is ready for deployment and produce final release artifacts.

---

## Responsibilities

- Validate Production Gate results
- Generate Release Notes
- Generate Deployment Instructions
- Verify versioning
- Verify changelog
- Tag release version (conceptually)

---

## Required Inputs

- Production Readiness Report
- Audit Report
- Repo Snapshot
- Final Plan Packet

---

## Output

# RELEASE PACKAGE

## Version
Semantic version increment

## Included Features
List from Master Plan

## Known Risks
Must be empty for PASS

## Deployment Steps
- Build commands
- Env var setup
- DB migration command
- Start commands

## Rollback Plan
Clear rollback steps

---

## Definition of Done

Release package stored under:
`/docs/release/`
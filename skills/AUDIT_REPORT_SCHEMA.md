# AUDIT REPORT SCHEMA

Required Fields:

- audit_id
- timestamp
- repo_snapshot_hash
- overall_status (PASS/FAIL)
- findings[]

Each finding must include:
- id
- severity
- description
- evidence
- suggested_owner
- blocking (true/false)

- system_risk_score (0–100)
- recovery_required (boolean)
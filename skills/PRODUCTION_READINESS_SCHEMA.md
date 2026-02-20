# PRODUCTION READINESS SCHEMA

Required Fields:

- production_id
- timestamp
- build_status
- test_status
- lint_status
- migration_status
- audit_status
- security_status
- unresolved_blockers[]
- final_verdict (PASS/FAIL)

PASS allowed only if:
- All statuses green
- No unresolved blockers
- Audit PASS
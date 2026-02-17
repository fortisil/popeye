/**
 * Admin Wizard Python backend templates
 * Generates FastAPI middleware and admin DB routes for the setup wizard
 */

/**
 * Generate admin auth middleware that validates X-Admin-Token header
 *
 * @returns Python source for admin_auth.py
 */
export function generateAdminAuthMiddleware(): string {
  return `"""
Admin authentication middleware.

Validates the X-Admin-Token header against the ADMIN_SETUP_TOKEN
environment variable. Used to protect admin setup endpoints.
"""

import logging
import os

from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)


async def require_admin_token(
    x_admin_token: str = Header(..., alias="X-Admin-Token"),
) -> str:
    """
    FastAPI dependency that validates the admin setup token.

    Args:
        x_admin_token (str): Token from X-Admin-Token header.

    Returns:
        str: The validated token.

    Raises:
        HTTPException: 403 if token is missing, invalid, or not configured.
    """
    expected = os.getenv("ADMIN_SETUP_TOKEN", "")
    if not expected:
        logger.warning("ADMIN_SETUP_TOKEN is not configured")
        raise HTTPException(
            status_code=403,
            detail="Admin setup token is not configured on the server.",
        )
    if x_admin_token != expected:
        logger.warning("Invalid admin token attempt")
        raise HTTPException(
            status_code=403,
            detail="Invalid admin token.",
        )
    return x_admin_token
`;
}

/**
 * Generate middleware package __init__.py
 *
 * @returns Python source for middleware/__init__.py
 */
export function generateMiddlewareInit(): string {
  return `"""
Middleware package.

Re-exports authentication dependencies.
"""

from .admin_auth import require_admin_token

__all__ = ["require_admin_token"]
`;
}

/**
 * Generate admin DB routes with 4 endpoints for the setup wizard
 *
 * @param packageName - Python package name (snake_case)
 * @returns Python source for routes/admin_db.py
 */
export function generateAdminDbRoutes(packageName: string): string {
  return `"""
Admin database setup routes.

Provides endpoints for the admin wizard to configure and
initialize the database without using the CLI.
"""

import logging
import os
import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ${packageName}.middleware.admin_auth import require_admin_token

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/admin/db",
    tags=["admin"],
    dependencies=[Depends(require_admin_token)],
)


class TestRequest(BaseModel):
    """Request body for connection test."""

    database_url: str


class ApplyRequest(BaseModel):
    """Request body for applying database setup."""

    database_url: str
    mode: str = "default"


class StepResult(BaseModel):
    """Result of a single setup step."""

    step: str
    success: bool
    message: str


def _read_env_file() -> dict[str, str]:
    """
    Read key=value pairs from the backend .env file.

    Returns:
        dict[str, str]: Parsed environment variables.
    """
    env_path = Path(__file__).resolve().parents[3] / ".env"
    pairs: dict[str, str] = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                pairs[key.strip()] = value.strip()
    return pairs


def _write_env_var(key: str, value: str) -> None:
    """
    Write or update a key in the backend .env file.

    Args:
        key (str): Environment variable name.
        value (str): Environment variable value.
    """
    env_path = Path(__file__).resolve().parents[3] / ".env"
    lines: list[str] = []
    found = False
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            stripped = line.strip()
            if stripped.startswith(f"{key}="):
                lines.append(f"{key}={value}")
                found = True
            else:
                lines.append(line)
    if not found:
        lines.append(f"{key}={value}")
    env_path.write_text("\\n".join(lines) + "\\n")


def _run_alembic_upgrade() -> StepResult:
    """
    Run alembic upgrade head as a subprocess.

    Returns:
        StepResult: Result of the migration step.
    """
    backend_dir = Path(__file__).resolve().parents[3]
    try:
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode == 0:
            return StepResult(
                step="migrate",
                success=True,
                message="Migrations applied successfully.",
            )
        logger.error(f"Alembic failed: {result.stderr}")
        return StepResult(
            step="migrate",
            success=False,
            message=f"Migration failed: {result.stderr[:500]}",
        )
    except subprocess.TimeoutExpired:
        return StepResult(
            step="migrate",
            success=False,
            message="Migration timed out after 60 seconds.",
        )
    except FileNotFoundError:
        return StepResult(
            step="migrate",
            success=False,
            message="Alembic not found. Install with: pip install alembic",
        )


@router.get("/status")
async def db_status():
    """
    Get current database setup status.

    Returns:
        dict: Status information including connectivity and migration state.
    """
    import asyncpg

    db_url = os.getenv("DATABASE_URL", "")
    db_configured = bool(db_url)
    status = "unconfigured"
    last_error = None
    migrations_applied = 0

    if db_configured:
        # Convert SQLAlchemy URL to asyncpg format if needed
        connect_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
        try:
            conn = await asyncpg.connect(connect_url)
            try:
                # Check alembic_version table
                row = await conn.fetchval(
                    "SELECT COUNT(*) FROM alembic_version"
                )
                migrations_applied = row or 0
                status = "ready"
            except asyncpg.UndefinedTableError:
                status = "configured"
            finally:
                await conn.close()
        except Exception as exc:
            logger.error(f"DB status check failed: {exc}")
            status = "error"
            last_error = str(exc)

    return {
        "status": status,
        "mode": "default",
        "lastError": last_error,
        "migrationsApplied": migrations_applied,
        "dbUrlConfigured": db_configured,
    }


@router.post("/test")
async def test_connection(body: TestRequest):
    """
    Test database connectivity without saving the URL.

    Args:
        body (TestRequest): Contains the database_url to test.

    Returns:
        dict: Success flag and message.
    """
    import asyncpg

    connect_url = body.database_url.replace(
        "postgresql+asyncpg://", "postgresql://"
    )
    try:
        conn = await asyncpg.connect(connect_url)
        await conn.execute("SELECT 1")
        await conn.close()
        return {"success": True, "message": "Connection successful."}
    except Exception as exc:
        logger.error(f"Connection test failed: {exc}")
        return {"success": False, "message": str(exc)}


@router.post("/apply")
async def apply_setup(body: ApplyRequest):
    """
    Save DATABASE_URL to .env and run migrations.

    Args:
        body (ApplyRequest): Contains database_url and optional mode.

    Returns:
        dict: List of step results and final status.
    """
    steps: list[dict] = []

    # Step 1: Write DATABASE_URL to .env
    try:
        _write_env_var("DATABASE_URL", body.database_url)
        os.environ["DATABASE_URL"] = body.database_url
        steps.append({"step": "save_url", "success": True, "message": "DATABASE_URL saved."})
    except Exception as exc:
        steps.append({"step": "save_url", "success": False, "message": str(exc)})
        return {"steps": steps, "status": "error"}

    # Step 2: Run migrations
    migrate_result = _run_alembic_upgrade()
    steps.append(migrate_result.model_dump())

    final_status = "ready" if migrate_result.success else "error"
    return {"steps": steps, "status": final_status}


@router.post("/retry")
async def retry_setup():
    """
    Re-run migrations using the existing DATABASE_URL from .env.

    Returns:
        dict: List of step results and final status.
    """
    steps: list[dict] = []

    # Read DATABASE_URL from .env
    env_vars = _read_env_file()
    db_url = env_vars.get("DATABASE_URL", "")
    if not db_url:
        return {
            "steps": [
                {"step": "read_env", "success": False, "message": "DATABASE_URL not found in .env"}
            ],
            "status": "error",
        }

    os.environ["DATABASE_URL"] = db_url
    steps.append({"step": "read_env", "success": True, "message": "DATABASE_URL loaded from .env."})

    # Run migrations
    migrate_result = _run_alembic_upgrade()
    steps.append(migrate_result.model_dump())

    final_status = "ready" if migrate_result.success else "error"
    return {"steps": steps, "status": final_status}
`;
}

/**
 * Generate extended FastAPI main.py that includes admin and health DB routers
 *
 * @param projectName - Human-readable project name
 * @param packageName - Python package name (snake_case)
 * @returns Python source for main.py
 */
export function generateFastAPIMainWithAdmin(
  projectName: string,
  packageName: string
): string {
  return `"""
${projectName} Backend API

FastAPI application entry point with admin wizard and database health routes.
"""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ${packageName}.routes.admin_db import router as admin_db_router
from ${packageName}.routes.health_db import router as health_db_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="${projectName} API",
    description="Backend API for ${projectName}",
    version="1.0.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(admin_db_router)
app.include_router(health_db_router)


@app.get("/health")
async def health_check():
    """
    Health check endpoint.

    Returns:
        dict: Health status.
    """
    return {
        "status": "healthy",
        "message": "Backend is running",
    }


@app.get("/")
async def root():
    """
    Root endpoint.

    Returns:
        dict: Welcome message.
    """
    return {
        "message": "Welcome to ${projectName} API",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
`;
}

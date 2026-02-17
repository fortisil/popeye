/**
 * Python backend database template functions
 * Generates SQLAlchemy + Alembic + asyncpg + pgvector files
 * Each function returns a string of the generated file content
 */

/**
 * Generate database connection module with AsyncEngine and session management
 */
export function generateDbConnection(_packageName: string): string {
  return `"""
Database connection management.

Provides async engine, session factory, and FastAPI dependency.
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "")

# Create async engine (lazy - only connects when DATABASE_URL is set)
engine = (
    create_async_engine(
        DATABASE_URL,
        echo=False,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
    )
    if DATABASE_URL
    else None
)

# Session factory
async_session_factory = (
    async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    if engine
    else None
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides an async database session.

    Yields:
        AsyncSession: Database session (auto-committed on success, rolled back on error).

    Raises:
        RuntimeError: If DATABASE_URL is not configured.
    """
    if async_session_factory is None:
        raise RuntimeError(
            "Database not configured. Set DATABASE_URL environment variable."
        )
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def check_db_connection() -> dict:
    """
    Health check helper - tests database connectivity.

    Returns:
        dict: Connection status with details.
    """
    if engine is None:
        return {"connected": False, "error": "DATABASE_URL not configured"}
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                __import__("sqlalchemy").text("SELECT 1")
            )
            result.scalar()
        return {"connected": True}
    except Exception as e:
        logger.error(f"Database connection check failed: {e}")
        return {"connected": False, "error": str(e)}
`;
}

/**
 * Generate database models with Base, TimestampMixin, and AppSettings
 */
export function generateDbModels(_packageName: string): string {
  return `"""
Database models.

Provides SQLAlchemy declarative base, mixins, and core models.
"""

import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for all models."""
    pass


class TimestampMixin:
    """
    Mixin that adds created_at and updated_at columns.

    Usage:
        class MyModel(Base, TimestampMixin):
            __tablename__ = "my_table"
            ...
    """
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class AppSettings(Base, TimestampMixin):
    """
    Key-value configuration storage.

    Used for runtime settings that persist across restarts.
    """
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)

    def __repr__(self) -> str:
        return f"<AppSettings(key={self.key!r})>"
`;
}

/**
 * Generate database package __init__.py with re-exports
 */
export function generateDbInit(_packageName: string): string {
  return `"""
Database package.

Re-exports core database components for convenient access.
"""

from .connection import engine, get_session, check_db_connection
from .models import Base, TimestampMixin, AppSettings

__all__ = [
    "engine",
    "get_session",
    "check_db_connection",
    "Base",
    "TimestampMixin",
    "AppSettings",
]
`;
}

/**
 * Generate database settings module using pydantic-settings
 */
export function generateDbSettings(_packageName: string): string {
  return `"""
Database settings.

Reads DATABASE_URL from environment with mode detection.
"""

import os
from pydantic_settings import BaseSettings


class DatabaseSettings(BaseSettings):
    """
    Database configuration loaded from environment.

    Attributes:
        database_url: PostgreSQL connection string.
        db_vector_required: Whether pgvector extension is needed.
    """
    database_url: str = ""
    db_vector_required: bool = True

    @property
    def is_configured(self) -> bool:
        """Check if a database URL has been provided."""
        return bool(self.database_url)

    @property
    def is_local_docker(self) -> bool:
        """Detect if using local Docker PostgreSQL."""
        return "localhost" in self.database_url or "postgres:" in self.database_url

    class Config:
        env_file = ".env"
        extra = "ignore"


db_settings = DatabaseSettings()
`;
}

/**
 * Generate alembic.ini configuration
 */
export function generateAlembicIni(_packageName: string): string {
  return `[alembic]
script_location = migrations
prepend_sys_path = .

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
`;
}

/**
 * Generate Alembic async env.py
 */
export function generateAlembicEnvPy(packageName: string): string {
  return `"""
Alembic environment configuration.

Supports async migrations with SQLAlchemy.
"""

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

# Import models to register metadata
from src.${packageName}.database.models import Base

# Alembic Config object
config = context.config

# Set sqlalchemy.url from environment
database_url = os.getenv("DATABASE_URL", "")
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

# Setup logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata for autogenerate
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.

    Generates SQL script without connecting to the database.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    """Run migrations with the given connection."""
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode.

    Creates an async engine and runs migrations.
    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
`;
}

/**
 * Generate Alembic script.py.mako template
 */
export function generateAlembicScriptMako(): string {
  return `"""$\{message}

Revision ID: $\{up_revision}
Revises: $\{down_revision | comma,n}
Create Date: $\{create_date}
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
$\{imports if imports else ""}

# revision identifiers
revision: str = $\{repr(up_revision)}
down_revision: Union[str, None] = $\{repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = $\{repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = $\{repr(depends_on)}


def upgrade() -> None:
    $\{upgrades if upgrades else "pass"}


def downgrade() -> None:
    $\{downgrades if downgrades else "pass"}
`;
}

/**
 * Generate initial migration: pgvector extension + app_settings table
 */
export function generateInitialMigration(_packageName: string): string {
  return `"""Initial migration: pgvector extension and app_settings table.

Revision ID: 001
Revises: None
Create Date: 2024-01-01 00:00:00.000000

# popeye:requires_extension=vector
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension (requires superuser or rds_superuser on managed DBs)
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )
    op.create_index("ix_app_settings_key", "app_settings", ["key"])


def downgrade() -> None:
    op.drop_index("ix_app_settings_key", table_name="app_settings")
    op.drop_table("app_settings")
    op.execute("DROP EXTENSION IF EXISTS vector")
`;
}

/**
 * Generate pgvector helper utilities
 */
export function generateDbVectorHelpers(_packageName: string): string {
  return `"""
pgvector helper utilities.

Provides vector column type, similarity search, and sanity checks.
"""

import logging
from sqlalchemy import Column, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Reason: pgvector types are registered at import time by the pgvector package
try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    Vector = None
    logger.warning("pgvector package not installed - vector features unavailable")


def vector_column(dimensions: int = 1536, nullable: bool = True) -> Column:
    """
    Create a pgvector column with the specified dimensions.

    Args:
        dimensions: Vector dimensionality (default: 1536 for OpenAI embeddings).
        nullable: Whether the column allows NULL values.

    Returns:
        Column: SQLAlchemy column with Vector type.

    Raises:
        ImportError: If pgvector package is not installed.
    """
    if Vector is None:
        raise ImportError("pgvector package is required for vector columns")
    return Column(Vector(dimensions), nullable=nullable)


async def cosine_similarity_search(
    session: AsyncSession,
    table_name: str,
    column_name: str,
    query_vector: list[float],
    limit: int = 10,
) -> list[dict]:
    """
    Perform cosine similarity search against a vector column.

    Args:
        session: Async database session.
        table_name: Name of the table to search.
        column_name: Name of the vector column.
        query_vector: Query embedding vector.
        limit: Maximum number of results.

    Returns:
        list[dict]: Results with id and similarity score.
    """
    vector_str = "[" + ",".join(str(v) for v in query_vector) + "]"
    sql = text(
        f"SELECT id, 1 - ({column_name} <=> :vec::vector) AS similarity "
        f"FROM {table_name} "
        f"ORDER BY {column_name} <=> :vec::vector "
        f"LIMIT :lim"
    )
    result = await session.execute(sql, {"vec": vector_str, "lim": limit})
    return [{"id": row[0], "similarity": row[1]} for row in result.fetchall()]


async def check_vector_extension(session: AsyncSession) -> bool:
    """
    Verify that the pgvector extension is installed and functional.

    Args:
        session: Async database session.

    Returns:
        bool: True if pgvector is available.
    """
    try:
        result = await session.execute(
            text("SELECT extname FROM pg_extension WHERE extname = 'vector'")
        )
        return result.scalar() is not None
    except Exception as e:
        logger.error(f"Vector extension check failed: {e}")
        return False
`;
}

/**
 * Generate graceful startup hook
 */
export function generateDbStartupHook(_packageName: string): string {
  return `"""
Application startup hook.

Handles graceful startup when DATABASE_URL is not configured.
The app runs in limited mode without a database connection.
"""

import logging
import os

logger = logging.getLogger(__name__)


async def on_startup() -> None:
    """
    Run startup checks for database connectivity.

    If DATABASE_URL is not set, logs a warning and skips DB initialization.
    The application continues to run in limited mode.
    """
    database_url = os.getenv("DATABASE_URL", "")

    if not database_url:
        logger.warning(
            "DATABASE_URL is not set. "
            "Application running in limited mode without database. "
            "Set DATABASE_URL in .env or environment to enable full functionality."
        )
        return

    logger.info("DATABASE_URL detected - initializing database connection")

    try:
        from .database.connection import check_db_connection

        status = await check_db_connection()
        if status.get("connected"):
            logger.info("Database connection verified successfully")
        else:
            logger.error(
                f"Database connection failed: {status.get('error', 'unknown')}"
            )
    except Exception as e:
        logger.error(f"Database initialization error: {e}")
`;
}

/**
 * Generate database health check route
 */
export function generateDbHealthRoute(_packageName: string): string {
  return `"""
Database health check endpoint.

Returns database connectivity and migration status.
"""

import logging
import os

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health/db")
async def health_db():
    """
    Database health check endpoint.

    Returns:
        JSONResponse: 200 with DB details if healthy, 503 if not ready.
    """
    database_url = os.getenv("DATABASE_URL", "")

    if not database_url:
        return JSONResponse(
            status_code=503,
            content={
                "status": "DB_NOT_READY",
                "message": "DATABASE_URL not configured",
                "setup_hint": "Set DATABASE_URL in .env or run the setup wizard",
            },
        )

    try:
        from .database.connection import engine

        if engine is None:
            return JSONResponse(
                status_code=503,
                content={
                    "status": "DB_NOT_READY",
                    "message": "Database engine not initialized",
                },
            )

        async with engine.connect() as conn:
            # Check basic connectivity
            await conn.execute(text("SELECT 1"))

            # Check migration status via alembic_version table
            migration_info = {"current_revision": None}
            try:
                result = await conn.execute(
                    text("SELECT version_num FROM alembic_version LIMIT 1")
                )
                row = result.first()
                if row:
                    migration_info["current_revision"] = row[0]
            except Exception:
                migration_info["current_revision"] = "alembic_version table not found"

        return JSONResponse(
            status_code=200,
            content={
                "status": "healthy",
                "database": "connected",
                "migrations": migration_info,
            },
        )
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "DB_NOT_READY",
                "message": f"Database connection failed: {str(e)}",
            },
        )
`;
}

/**
 * Generate test DB fixtures (conftest_db.py)
 */
export function generateDbConftest(packageName: string): string {
  return `"""
Database test fixtures.

Provides test database URL override and async session fixture.
"""

import os
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from src.${packageName}.database.models import Base


# Override DATABASE_URL for tests
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/test_db",
)


@pytest.fixture(scope="session")
def test_engine():
    """Create a test database engine."""
    return create_async_engine(TEST_DATABASE_URL, echo=True)


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncSession:
    """
    Provide an async database session for tests.

    Creates tables before tests and drops them after.
    Each test gets a fresh transaction that is rolled back.
    """
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )

    async with session_factory() as session:
        yield session

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
`;
}

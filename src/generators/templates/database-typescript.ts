/**
 * TypeScript backend database template functions
 * Generates Prisma + pgvector files for future TS backend projects
 * NOT wired into any generator in Phase 1 - templates exist for future use
 */

/**
 * Generate Prisma schema with PostgreSQL datasource and pgvector
 */
export function generatePrismaSchema(projectName: string): string {
  return `// Prisma schema for ${projectName}
// Learn more: https://pris.ly/d/prisma-schema

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector", schema: "public")]
}

model AppSettings {
  id        Int      @id @default(autoincrement())
  key       String   @unique
  value     String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("app_settings")
}
`;
}

/**
 * Generate PrismaClient singleton with connection handling
 */
export function generatePrismaClient(projectName: string): string {
  return `/**
 * Prisma client singleton for ${projectName}.
 *
 * Ensures a single PrismaClient instance is reused across the application.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
`;
}

/**
 * Generate .env.example additions for Prisma
 */
export function generatePrismaEnv(): string {
  return `# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mydb?schema=public"
`;
}

/**
 * Generate Prisma seed script
 */
export function generatePrismaSeed(): string {
  return `/**
 * Prisma seed script.
 *
 * Seeds the database with initial data using upsert pattern.
 * Run with: npx prisma db seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Upsert default app settings
  await prisma.appSettings.upsert({
    where: { key: "app_version" },
    update: { value: "1.0.0" },
    create: { key: "app_version", value: "1.0.0" },
  });

  console.log("Seeding complete.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
`;
}

/**
 * Generate database health check for Prisma
 */
export function generatePrismaDbHealth(): string {
  return `/**
 * Database health check utilities.
 *
 * Tests connection and checks migration status.
 */

import prisma from "./client";

export interface DbHealthResult {
  connected: boolean;
  migrations?: { current: string | null };
  error?: string;
}

/**
 * Check database connectivity and migration status.
 */
export async function checkDbHealth(): Promise<DbHealthResult> {
  try {
    // Test basic connectivity
    await prisma.$queryRaw\`SELECT 1\`;

    // Check migration status
    let currentMigration: string | null = null;
    try {
      const result = await prisma.$queryRaw<
        Array<{ migration_name: string }>
      >\`SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1\`;
      currentMigration = result[0]?.migration_name ?? null;
    } catch {
      // _prisma_migrations table may not exist yet
    }

    return {
      connected: true,
      migrations: { current: currentMigration },
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
`;
}

/**
 * Generate pgvector raw query helpers for Prisma
 */
export function generatePrismaVectorHelpers(): string {
  return `/**
 * pgvector helpers using Prisma raw queries.
 *
 * Provides cosine similarity search and vector extension checks.
 */

import prisma from "./client";

/**
 * Perform cosine similarity search against a vector column.
 */
export async function cosineSimilaritySearch(
  tableName: string,
  columnName: string,
  queryVector: number[],
  limit: number = 10
): Promise<Array<{ id: number; similarity: number }>> {
  const vectorStr = \`[\${queryVector.join(",")}]\`;

  const results = await prisma.$queryRawUnsafe<
    Array<{ id: number; similarity: number }>
  >(
    \`SELECT id, 1 - (\${columnName} <=> $1::vector) AS similarity \` +
      \`FROM \${tableName} \` +
      \`ORDER BY \${columnName} <=> $1::vector \` +
      \`LIMIT $2\`,
    vectorStr,
    limit
  );

  return results;
}

/**
 * Check if the pgvector extension is installed.
 */
export async function checkVectorExtension(): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<Array<{ extname: string }>>\`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    \`;
    return result.length > 0;
  } catch {
    return false;
  }
}
`;
}

/**
 * Generate Prisma DB index.ts with re-exports
 */
export function generatePrismaDbInit(): string {
  return `/**
 * Database package re-exports.
 */

export { prisma, default as PrismaClient } from "./client";
export { checkDbHealth, type DbHealthResult } from "./health";
export {
  cosineSimilaritySearch,
  checkVectorExtension,
} from "./vector";
`;
}

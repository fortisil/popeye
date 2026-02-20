/**
 * Docker-related database template functions
 * Generates PostgreSQL service configs and docker-compose files
 */

/**
 * Generate PostgreSQL service YAML block for docker-compose
 */
export function generatePostgresServiceYaml(projectName: string): string {
  return `  postgres:
    image: postgres:16-alpine
    container_name: ${projectName}-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=${projectName.replace(/-/g, '_')}_db
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5`;
}

/**
 * Generate full docker-compose.yml for fullstack projects with PostgreSQL
 * Preserves all 4 existing services (frontend, backend, frontend-dev, backend-dev)
 * and adds postgres service with proper depends_on
 */
export function generateDockerComposeWithDb(projectName: string, packageName?: string): string {
  const pyPkg = packageName || projectName.replace(/-/g, '_');
  const dbName = projectName.replace(/-/g, '_') + '_db';

  return `version: "3.8"

services:
  frontend:
    build:
      context: ./apps/frontend
      target: production
    container_name: ${projectName}-frontend
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      - backend
    environment:
      - VITE_API_URL=http://backend:8000

  backend:
    build:
      context: ./apps/backend
    container_name: ${projectName}-backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    env_file:
      - ./apps/backend/.env
    environment:
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/${dbName}
    volumes:
      - backend-data:/app/data
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    container_name: ${projectName}-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=${dbName}
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  frontend-dev:
    build:
      context: ./apps/frontend
      target: development
    container_name: ${projectName}-frontend-dev
    ports:
      - "5173:5173"
    volumes:
      - ./apps/frontend/src:/app/src
    environment:
      - VITE_API_URL=http://backend:8000
    depends_on:
      - backend

  backend-dev:
    build:
      context: ./apps/backend
    container_name: ${projectName}-backend-dev
    ports:
      - "8000:8000"
    volumes:
      - ./apps/backend/src:/app/src
      - ./apps/backend/tests:/app/tests
    environment:
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/${dbName}
    command: ["uvicorn", "src.${pyPkg}.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  backend-data:
  postgres-data:
`;
}

/**
 * Generate full docker-compose.yml for "all" projects (FE + BE + Postgres)
 * Website runs via `npm run dev` / `npm run build && npm start` outside Docker.
 */
export function generateAllDockerComposeWithDb(projectName: string): string {
  const dbName = projectName.replace(/-/g, '_') + '_db';

  return `services:
  frontend:
    build:
      context: apps/frontend
      dockerfile: Dockerfile
      target: production
    ports:
      - "3000:80"
    depends_on:
      - backend
    environment:
      - VITE_API_URL=http://backend:8000
    networks:
      - ${projectName}-network

  backend:
    build:
      context: apps/backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    env_file:
      - ./apps/backend/.env
    environment:
      - DEBUG=false
      - FRONTEND_URL=http://frontend:80
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/${dbName}
    volumes:
      - backend-data:/app/data
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - ${projectName}-network

  postgres:
    image: postgres:16-alpine
    container_name: ${projectName}-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=${dbName}
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - ${projectName}-network

networks:
  ${projectName}-network:
    driver: bridge

volumes:
  backend-data:
  postgres-data:
`;
}

/**
 * Generate .env.example content with database variables
 */
export function generateDbEnvExample(projectName: string): string {
  const dbName = projectName.replace(/-/g, '_') + '_db';

  return `DEBUG=true

# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/${dbName}
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=${dbName}

# Vector support
DB_VECTOR_REQUIRED=true

# Admin Wizard
ADMIN_SETUP_TOKEN=change-me-to-a-random-string

# JWT Configuration
SECRET_KEY=change-me-in-production

# Google OAuth2 (optional - uncomment to enable)
# GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=your-client-secret
# GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback
`;
}

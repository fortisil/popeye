/**
 * Fullstack project templates
 * Provides template files for fullstack monorepo project generation
 */

import type { WorkspaceConfig } from '../../types/project.js';

/**
 * Generate workspace.json content
 *
 * @param projectName - The project name
 * @returns Workspace configuration object
 */
export function generateWorkspaceConfig(projectName: string): WorkspaceConfig {
  return {
    version: '1.0',
    apps: {
      frontend: {
        name: 'frontend',
        path: 'apps/frontend',
        language: 'typescript',
        commands: {
          test: 'npm test',
          lint: 'npm run lint',
          build: 'npm run build',
          dev: 'npm run dev',
          typecheck: 'npm run typecheck',
        },
        docker: {
          dockerfile: 'apps/frontend/Dockerfile',
          imageName: `${projectName}-frontend`,
          context: 'apps/frontend',
        },
        uiSpec: '.popeye/ui-spec.json',
      },
      backend: {
        name: 'backend',
        path: 'apps/backend',
        language: 'python',
        commands: {
          test: 'python -m pytest tests/ -v',
          lint: 'ruff check src/ tests/',
          build: 'pip install -e .',
          dev: 'uvicorn src.backend.main:app --reload --port 8000',
        },
        docker: {
          dockerfile: 'apps/backend/Dockerfile',
          imageName: `${projectName}-backend`,
          context: 'apps/backend',
        },
        contextRoots: ['src/backend', 'tests'],
      },
    },
    commands: {
      testAll: 'cd apps/backend && pytest && cd ../frontend && npm test',
      lintAll: 'cd apps/backend && ruff check . && cd ../frontend && npm run lint',
      buildAll: 'cd apps/backend && pip install -e . && cd ../frontend && npm run build',
      devAll: 'docker-compose up',
    },
    docker: {
      composePath: 'infra/docker/docker-compose.yml',
      rootComposeSymlink: true,
    },
  };
}

/**
 * Generate workspace.json file content as string
 */
export function generateWorkspaceJson(projectName: string): string {
  const config = generateWorkspaceConfig(projectName);
  return JSON.stringify(config, null, 2);
}

/**
 * Generate root docker-compose.yml for fullstack project
 */
export function generateRootDockerCompose(projectName: string): string {
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
    volumes:
      - backend-data:/app/data

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
    command: ["uvicorn", "src.backend.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]

volumes:
  backend-data:
`;
}

/**
 * Generate root README.md for fullstack project
 */
export function generateRootReadme(projectName: string, description?: string): string {
  return `# ${projectName}

${description || 'A fullstack application with React frontend and FastAPI backend.'}

## Project Structure

\`\`\`
${projectName}/
  apps/
    frontend/     # React + Vite + Tailwind CSS
    backend/      # FastAPI (Python)
  packages/
    contracts/    # OpenAPI spec (future)
  infra/
    docker/       # Docker configuration
  docs/           # Documentation
  .popeye/        # Popeye CLI configuration
\`\`\`

## Quick Start

### Development Mode

Run both frontend and backend in development mode:

\`\`\`bash
# Option 1: Using Docker Compose (recommended)
docker-compose up frontend-dev backend-dev

# Option 2: Run separately
# Terminal 1 - Backend
cd apps/backend
pip install -e .
uvicorn src.backend.main:app --reload --port 8000

# Terminal 2 - Frontend
cd apps/frontend
npm install
npm run dev
\`\`\`

### Production Build

\`\`\`bash
# Build and run with Docker Compose
docker-compose up --build frontend backend
\`\`\`

## Running Tests

\`\`\`bash
# Run all tests
cd apps/backend && pytest && cd ../frontend && npm test

# Frontend tests only
cd apps/frontend && npm test

# Backend tests only
cd apps/backend && pytest
\`\`\`

## Linting

\`\`\`bash
# Lint all
cd apps/backend && ruff check . && cd ../frontend && npm run lint

# Frontend only
cd apps/frontend && npm run lint

# Backend only
cd apps/backend && ruff check .
\`\`\`

## Apps

### Frontend (apps/frontend)

React application built with:
- **Vite** - Fast build tool
- **Tailwind CSS** - Utility-first CSS
- **TypeScript** - Type safety
- **Vitest** - Unit testing

See [apps/frontend/README.md](apps/frontend/README.md) for frontend-specific documentation.

### Backend (apps/backend)

Python API built with:
- **FastAPI** - Modern async API framework
- **Pydantic** - Data validation
- **pytest** - Testing framework

See [apps/backend/README.md](apps/backend/README.md) for backend-specific documentation.

## API Communication

Frontend connects to backend at:
- Development: \`http://localhost:8000\`
- Docker: \`http://backend:8000\`

The API URL is configured via \`VITE_API_URL\` environment variable.

## Docker

### Services

| Service | Port | Description |
|---------|------|-------------|
| frontend | 3000 | Production frontend (nginx) |
| backend | 8000 | Production API |
| frontend-dev | 5173 | Development frontend (HMR) |
| backend-dev | 8000 | Development API (auto-reload) |

### Commands

\`\`\`bash
# Build all
docker-compose build

# Run production
docker-compose up frontend backend

# Run development
docker-compose up frontend-dev backend-dev

# Stop all
docker-compose down
\`\`\`

## Configuration

- Backend environment: \`apps/backend/.env\`
- Frontend environment: \`apps/frontend/.env\`
- Workspace config: \`.popeye/workspace.json\`

## License

MIT
`;
}

/**
 * Generate root .gitignore for fullstack project
 */
export function generateRootGitignore(): string {
  return `# Dependencies
node_modules/
__pycache__/
*.py[cod]
*$py.class
.Python
venv/
.venv/
env/

# Build outputs
dist/
build/
*.egg-info/
.eggs/

# IDE
.idea/
.vscode/
*.swp
*.swo

# Environment files
.env
.env.local
.env.*.local
!.env.example

# Logs
*.log
npm-debug.log*
pip-log.txt

# Testing
coverage/
.coverage
htmlcov/
.pytest_cache/
.nyc_output/

# OS files
.DS_Store
Thumbs.db

# Project specific
.popeye/state.json
data/

# Docker
*.pid
`;
}

/**
 * Generate frontend-specific README for fullstack project
 */
export function generateFrontendReadme(projectName: string): string {
  return `# ${projectName} - Frontend

React frontend application built with Vite, Tailwind CSS, and TypeScript.

## Development

\`\`\`bash
npm install
npm run dev
\`\`\`

## Scripts

| Script | Description |
|--------|-------------|
| \`npm run dev\` | Start development server |
| \`npm run build\` | Build for production |
| \`npm run preview\` | Preview production build |
| \`npm test\` | Run tests |
| \`npm run lint\` | Lint code |
| \`npm run typecheck\` | Type check |

## Structure

\`\`\`
src/
  components/    # Reusable components
  pages/         # Page components
  hooks/         # Custom hooks
  utils/         # Utility functions
  api/           # API client
  App.tsx        # Root component
  main.tsx       # Entry point
\`\`\`

## API Integration

The API URL is configured via environment variable:

\`\`\`env
VITE_API_URL=http://localhost:8000
\`\`\`

## Testing

\`\`\`bash
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
\`\`\`
`;
}

/**
 * Generate backend-specific README for fullstack project
 */
export function generateBackendReadme(projectName: string): string {
  return `# ${projectName} - Backend

FastAPI backend application.

## Development

\`\`\`bash
# Install dependencies
pip install -e .

# Run development server
uvicorn src.backend.main:app --reload --port 8000
\`\`\`

## Scripts (Makefile)

| Command | Description |
|---------|-------------|
| \`make dev\` | Run development server |
| \`make test\` | Run tests |
| \`make lint\` | Lint code |
| \`make format\` | Format code |

## Structure

\`\`\`
src/backend/
  main.py        # FastAPI app entry point
  routes/        # API routes
  models/        # Pydantic models
  services/      # Business logic
  utils/         # Utility functions
tests/
  test_main.py   # Main tests
  conftest.py    # Test fixtures
\`\`\`

## API Documentation

Once running, API docs are available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Testing

\`\`\`bash
pytest                    # Run all tests
pytest -v                 # Verbose
pytest --cov=src/backend  # With coverage
\`\`\`

## Environment Variables

Copy \`.env.example\` to \`.env\` and configure:

\`\`\`env
DEBUG=true
DATABASE_URL=sqlite:///./data/app.db
\`\`\`
`;
}

/**
 * Generate UI spec placeholder for fullstack project
 */
export function generateUiSpec(projectName: string): string {
  return JSON.stringify(
    {
      name: projectName,
      version: '1.0',
      theme: {
        colors: {
          primary: '#3B82F6',
          secondary: '#6B7280',
          accent: '#10B981',
        },
        fonts: {
          heading: 'Inter',
          body: 'Inter',
        },
      },
      components: [],
      pages: [
        {
          name: 'Home',
          path: '/',
          layout: 'default',
        },
      ],
    },
    null,
    2
  );
}

/**
 * Generate Vite config for React frontend
 */
export function generateViteConfigReact(): string {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
`;
}

/**
 * Generate Tailwind config for frontend
 */
export function generateTailwindConfig(): string {
  return `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
    },
  },
  plugins: [],
};
`;
}

/**
 * Generate PostCSS config for frontend
 */
export function generatePostcssConfig(): string {
  return `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;
}

/**
 * Generate main CSS with Tailwind directives
 */
export function generateMainCss(): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom styles */
body {
  @apply bg-gray-50 text-gray-900;
}
`;
}

/**
 * Generate React App.tsx
 */
export function generateAppTsx(projectName: string): string {
  return `import { useState, useEffect } from 'react';

interface HealthStatus {
  status: string;
  message: string;
}

function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const response = await fetch(\`\${apiUrl}/health\`);
        if (response.ok) {
          const data = await response.json();
          setHealth(data);
        } else {
          setError('Backend not responding');
        }
      } catch (err) {
        setError('Failed to connect to backend');
      } finally {
        setLoading(false);
      }
    };

    checkHealth();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center p-8">
        <h1 className="text-4xl font-bold text-primary-600 mb-4">
          ${projectName}
        </h1>
        <p className="text-gray-600 mb-8">
          Fullstack application with React + FastAPI
        </p>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-2">Backend Status</h2>
          {loading && (
            <p className="text-gray-500">Checking...</p>
          )}
          {error && (
            <p className="text-red-500">{error}</p>
          )}
          {health && (
            <div className="text-green-500">
              <p>Status: {health.status}</p>
              <p className="text-sm text-gray-500">{health.message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
`;
}

/**
 * Generate React main.tsx entry point
 */
export function generateMainTsx(): string {
  return `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`;
}

/**
 * Generate index.html for React app
 */
export function generateIndexHtml(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

/**
 * Generate frontend package.json for React + Vite
 */
export function generateFrontendPackageJson(projectName: string): string {
  return JSON.stringify(
    {
      name: `${projectName}-frontend`,
      private: true,
      version: '1.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc && vite build',
        preview: 'vite preview',
        test: 'vitest run',
        'test:watch': 'vitest',
        'test:coverage': 'vitest run --coverage',
        lint: 'eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0',
        typecheck: 'tsc --noEmit',
      },
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0',
      },
      devDependencies: {
        '@types/react': '^18.2.0',
        '@types/react-dom': '^18.2.0',
        '@typescript-eslint/eslint-plugin': '^8.0.0',
        '@typescript-eslint/parser': '^8.0.0',
        '@vitejs/plugin-react': '^4.2.0',
        '@vitest/coverage-v8': '^2.0.0',
        autoprefixer: '^10.4.0',
        eslint: '^9.0.0',
        'eslint-plugin-react-hooks': '^4.6.0',
        'eslint-plugin-react-refresh': '^0.4.0',
        postcss: '^8.4.0',
        tailwindcss: '^3.4.0',
        typescript: '^5.4.0',
        vite: '^5.2.0',
        vitest: '^2.0.0',
      },
    },
    null,
    2
  );
}

/**
 * Generate frontend tsconfig.json for React
 */
export function generateFrontendTsconfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        skipLibCheck: true,
        moduleResolution: 'bundler',
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
        paths: {
          '@/*': ['./src/*'],
        },
      },
      include: ['src'],
      references: [{ path: './tsconfig.node.json' }],
    },
    null,
    2
  );
}

/**
 * Generate frontend tsconfig.node.json
 */
export function generateFrontendTsconfigNode(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        composite: true,
        skipLibCheck: true,
        module: 'ESNext',
        moduleResolution: 'bundler',
        allowSyntheticDefaultImports: true,
        strict: true,
      },
      include: ['vite.config.ts'],
    },
    null,
    2
  );
}

/**
 * Generate frontend Dockerfile for React + nginx
 */
export function generateFrontendDockerfile(): string {
  return `# Build stage
FROM node:20-slim as build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine as production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# Development stage
FROM node:20-slim as development

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
`;
}

/**
 * Generate nginx config for frontend
 */
export function generateNginxConfig(): string {
  return `server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Handle SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Cache static assets
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
`;
}

/**
 * Generate frontend test file
 */
export function generateFrontendTest(projectName: string): string {
  return `import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App';

describe('App', () => {
  it('renders the project name', () => {
    render(<App />);
    expect(screen.getByText('${projectName}')).toBeDefined();
  });

  it('shows loading state initially', () => {
    render(<App />);
    expect(screen.getByText('Checking...')).toBeDefined();
  });
});
`;
}

/**
 * Generate vitest setup for React
 */
export function generateVitestSetup(): string {
  return `import '@testing-library/jest-dom';
`;
}

/**
 * Generate vitest config for React
 */
export function generateFrontendVitestConfig(): string {
  return `import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/'],
    },
  },
});
`;
}

/**
 * Generate backend FastAPI main.py
 */
export function generateFastAPIMain(projectName: string): string {
  return `"""
${projectName} Backend API

FastAPI application entry point.
"""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

/**
 * Generate backend Dockerfile for FastAPI
 */
export function generateBackendDockerfile(_projectName: string): string {
  return `# Python base image
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    build-essential \\
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt pyproject.toml ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/
COPY tests/ ./tests/

# Install the package
RUN pip install -e .

# Create non-root user
RUN adduser --disabled-password --gecos '' appuser
RUN mkdir -p /app/data && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "src.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
`;
}

/**
 * Generate backend requirements.txt for FastAPI
 */
export function generateFastAPIRequirements(): string {
  return `# FastAPI and dependencies
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
pydantic>=2.5.0
pydantic-settings>=2.1.0

# Development
ruff>=0.1.0
pytest>=7.4.0
pytest-asyncio>=0.23.0
httpx>=0.26.0
`;
}

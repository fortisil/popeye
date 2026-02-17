/**
 * Admin Wizard React frontend templates
 * Generates React components for the database setup wizard UI
 */

/**
 * Generate useAdminApi custom hook for authenticated API calls
 *
 * @returns TypeScript source for useAdminApi.ts
 */
export function generateUseAdminApiHook(): string {
  return `/**
 * Custom hook for admin API calls with token authentication.
 */

interface ApiOptions {
  method?: string;
  body?: unknown;
}

interface ApiResult<T = unknown> {
  data: T | null;
  error: string | null;
}

export function useAdminApi() {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const adminToken = import.meta.env.VITE_ADMIN_TOKEN || '';

  async function callApi<T = unknown>(
    path: string,
    options: ApiOptions = {}
  ): Promise<ApiResult<T>> {
    const { method = 'GET', body } = options;
    try {
      const response = await fetch(\`\${apiUrl}\${path}\`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const text = await response.text();
        return { data: null, error: text || \`HTTP \${response.status}\` };
      }

      const data = (await response.json()) as T;
      return { data, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { data: null, error: message };
    }
  }

  return { callApi };
}
`;
}

/**
 * Generate DbStatusBanner component that polls DB status and shows setup prompt
 *
 * @returns TypeScript/React source for DbStatusBanner.tsx
 */
export function generateDbStatusBanner(): string {
  return `import { useState, useEffect } from 'react';
import { useAdminApi } from './useAdminApi';

interface DbStatus {
  status: string;
  mode: string;
  lastError: string | null;
  migrationsApplied: number;
  dbUrlConfigured: boolean;
}

interface DbStatusBannerProps {
  onSetupClick: () => void;
}

/**
 * Banner that polls the database status on mount.
 * Hidden when status is "ready". Shows an amber bar when
 * the database is unconfigured or in error state.
 */
export function DbStatusBanner({ onSetupClick }: DbStatusBannerProps) {
  const { callApi } = useAdminApi();
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      const result = await callApi<DbStatus>('/api/admin/db/status');
      if (!cancelled) {
        setStatus(result.data);
        setLoading(false);
      }
    }

    fetchStatus();
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (!status) return null;
  if (status.status === 'ready') return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
        <span className="text-amber-800 text-sm font-medium">
          {status.status === 'error'
            ? \`Database error: \${status.lastError || 'Unknown'}\`
            : 'Database is not configured'}
        </span>
      </div>
      <button
        onClick={onSetupClick}
        className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
      >
        Set up database
      </button>
    </div>
  );
}
`;
}

/**
 * Generate ConnectionForm component for testing DB URLs
 *
 * @returns TypeScript/React source for ConnectionForm.tsx
 */
export function generateConnectionForm(): string {
  return `import { useState } from 'react';
import { useAdminApi } from './useAdminApi';

interface ConnectionFormProps {
  onTestSuccess: (url: string) => void;
  onBack: () => void;
}

/**
 * Form to enter a DATABASE_URL and test the connection.
 * Calls POST /api/admin/db/test and reports success/failure.
 */
export function ConnectionForm({ onTestSuccess, onBack }: ConnectionFormProps) {
  const { callApi } = useAdminApi();
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handleTest() {
    if (!url.trim()) return;
    setTesting(true);
    setResult(null);

    const res = await callApi<{ success: boolean; message: string }>(
      '/api/admin/db/test',
      { method: 'POST', body: { database_url: url } }
    );

    setTesting(false);

    if (res.data) {
      setResult(res.data);
      if (res.data.success) {
        onTestSuccess(url);
      }
    } else {
      setResult({ success: false, message: res.error || 'Connection failed' });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="db-url" className="block text-sm font-medium text-gray-700 mb-1">
          DATABASE_URL
        </label>
        <input
          id="db-url"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="postgresql://user:pass@host:5432/dbname"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
      </div>

      {result && (
        <div className={\`text-sm p-3 rounded \${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}\`}>
          {result.message}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !url.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
      </div>
    </div>
  );
}
`;
}

/**
 * Generate MigrationProgress component that polls status during apply
 *
 * @returns TypeScript/React source for MigrationProgress.tsx
 */
export function generateMigrationProgress(): string {
  return `import { useState, useEffect, useRef } from 'react';
import { useAdminApi } from './useAdminApi';

interface StepResult {
  step: string;
  success: boolean;
  message: string;
}

interface MigrationProgressProps {
  databaseUrl: string;
  onComplete: () => void;
  onError: (msg: string) => void;
}

/**
 * Runs POST /api/admin/db/apply then polls GET /api/admin/db/status
 * every 2 seconds while in "applying" state.
 * Shows a step-by-step progress list.
 */
export function MigrationProgress({ databaseUrl, onComplete, onError }: MigrationProgressProps) {
  const { callApi } = useAdminApi();
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [applying, setApplying] = useState(true);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function runApply() {
      const res = await callApi<{ steps: StepResult[]; status: string }>(
        '/api/admin/db/apply',
        { method: 'POST', body: { database_url: databaseUrl } }
      );

      if (res.data) {
        setSteps(res.data.steps);
        if (res.data.status === 'ready') {
          setApplying(false);
          onComplete();
        } else if (res.data.status === 'error') {
          setApplying(false);
          const failedStep = res.data.steps.find((s) => !s.success);
          onError(failedStep?.message || 'Setup failed');
        }
      } else {
        setApplying(false);
        onError(res.error || 'Failed to apply setup');
      }
    }

    runApply();
  }, [databaseUrl]);

  useEffect(() => {
    if (!applying) return;

    const interval = setInterval(async () => {
      const res = await callApi<{ status: string }>('/api/admin/db/status');
      if (res.data) {
        if (res.data.status === 'ready') {
          setApplying(false);
          onComplete();
        } else if (res.data.status === 'error') {
          setApplying(false);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [applying]);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Applying Setup</h3>
      <ul className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className={\`inline-block w-4 h-4 rounded-full flex items-center justify-center text-xs \${
              step.success ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
            }\`}>
              {step.success ? '\\u2713' : '\\u2717'}
            </span>
            <span className={step.success ? 'text-gray-700' : 'text-red-700'}>
              {step.message}
            </span>
          </li>
        ))}
        {applying && (
          <li className="flex items-center gap-2 text-sm text-gray-500">
            <span className="inline-block w-4 h-4 rounded-full bg-blue-100 animate-pulse" />
            Running...
          </li>
        )}
      </ul>
    </div>
  );
}
`;
}

/**
 * Generate DbSetupStepper component - multi-step wizard overlay
 *
 * @returns TypeScript/React source for DbSetupStepper.tsx
 */
export function generateDbSetupStepper(): string {
  return `import { useState } from 'react';
import { ConnectionForm } from './ConnectionForm';
import { MigrationProgress } from './MigrationProgress';

type WizardStep = 'choose' | 'credentials' | 'apply' | 'ready';

interface DbSetupStepperProps {
  onClose: () => void;
}

const STEP_LABELS: Record<WizardStep, string> = {
  choose: 'Setup Mode',
  credentials: 'Connection',
  apply: 'Applying',
  ready: 'Complete',
};

const STEP_ORDER: WizardStep[] = ['choose', 'credentials', 'apply', 'ready'];

/**
 * Multi-step database setup wizard rendered as a modal overlay.
 * State machine: choose -> credentials -> apply -> ready
 */
export function DbSetupStepper({ onClose }: DbSetupStepperProps) {
  const [step, setStep] = useState<WizardStep>('choose');
  const [dbUrl, setDbUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const currentIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-xl leading-none"
          aria-label="Close"
        >
          \\u00d7
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-4">Database Setup</h2>

        {/* Step indicator */}
        <div className="flex gap-1 mb-6">
          {STEP_ORDER.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={\`h-1.5 rounded-full \${
                i <= currentIndex ? 'bg-blue-500' : 'bg-gray-200'
              }\`} />
              <span className={\`block text-xs mt-1 \${
                i === currentIndex ? 'text-blue-600 font-medium' : 'text-gray-400'
              }\`}>
                {STEP_LABELS[s]}
              </span>
            </div>
          ))}
        </div>

        {/* Step content */}
        {step === 'choose' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Configure your PostgreSQL database to enable data persistence.
            </p>
            <button
              onClick={() => setStep('credentials')}
              className="w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Enter connection details
            </button>
          </div>
        )}

        {step === 'credentials' && (
          <ConnectionForm
            onTestSuccess={(url) => {
              setDbUrl(url);
              setStep('apply');
            }}
            onBack={() => setStep('choose')}
          />
        )}

        {step === 'apply' && (
          <MigrationProgress
            databaseUrl={dbUrl}
            onComplete={() => setStep('ready')}
            onError={(msg) => setErrorMsg(msg)}
          />
        )}

        {step === 'ready' && (
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
              <span className="text-green-600 text-2xl">\\u2713</span>
            </div>
            <p className="text-gray-700 font-medium">Database is ready!</p>
            <button
              onClick={onClose}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        )}

        {errorMsg && step === 'apply' && (
          <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded">
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
}
`;
}

/**
 * Generate admin barrel export index
 *
 * @returns TypeScript source for admin/index.ts
 */
export function generateAdminIndex(): string {
  return `/**
 * Admin wizard components barrel export.
 */

export { DbStatusBanner } from './DbStatusBanner';
export { DbSetupStepper } from './DbSetupStepper';
`;
}

/**
 * Generate App.tsx that includes DbStatusBanner and DbSetupStepper
 *
 * @param projectName - Human-readable project name
 * @returns TypeScript/React source for App.tsx
 */
export function generateAppTsxWithAdmin(projectName: string): string {
  return `import { useState, useEffect } from 'react';
import { DbStatusBanner } from './admin';
import { DbSetupStepper } from './admin';

interface HealthStatus {
  status: string;
  message: string;
}

function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);

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
    <div className="min-h-screen flex flex-col">
      <DbStatusBanner onSetupClick={() => setShowWizard(true)} />

      <div className="flex-1 flex items-center justify-center">
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

      {showWizard && (
        <DbSetupStepper onClose={() => setShowWizard(false)} />
      )}
    </div>
  );
}

export default App;
`;
}

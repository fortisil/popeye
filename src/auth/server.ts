/**
 * Local OAuth callback server for authentication flows
 * Handles browser-based OAuth redirects and token entry
 */

import express, { type Express, type Request, type Response } from 'express';
import { createServer, type Server } from 'http';
import { getOpenAIEntryHTML } from './openai-entry.js';

/**
 * Find an available port in the specified range
 */
export async function findAvailablePort(start: number, end: number): Promise<number> {
  const net = await import('net');

  for (let port = start; port <= end; port++) {
    const isAvailable = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port, '127.0.0.1');
    });

    if (isAvailable) {
      return port;
    }
  }

  throw new Error(`No available ports found in range ${start}-${end}`);
}

/**
 * Result from the auth callback server
 */
export interface AuthCallbackResult {
  success: boolean;
  token?: string;
  error?: string;
}

/**
 * Create and start an OAuth callback server
 *
 * @param options - Server options
 * @returns Promise that resolves when a token is received
 */
export async function startAuthCallbackServer(options: {
  port?: number;
  timeout?: number;
  type: 'claude' | 'openai';
}): Promise<AuthCallbackResult> {
  const { type, timeout = 300000 } = options; // 5 minute default timeout
  const port = options.port || (await findAvailablePort(3000, 3100));

  return new Promise((resolve) => {
    const app: Express = express();
    // eslint-disable-next-line prefer-const
    let server: Server;

    // Parse JSON bodies
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Serve the token entry page for OpenAI
    if (type === 'openai') {
      app.get('/', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'text/html');
        res.send(getOpenAIEntryHTML(port));
      });

      // Handle token submission
      app.get('/submit', (req: Request, res: Response) => {
        const token = req.query.token as string;

        if (!token) {
          res.status(400).send('<html><body><h1>Error: No token provided</h1></body></html>');
          return;
        }

        res.send(`
          <html>
            <head>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                }
                .container {
                  text-align: center;
                  padding: 40px;
                  background: rgba(255, 255, 255, 0.1);
                  border-radius: 16px;
                  backdrop-filter: blur(10px);
                }
                h1 { margin-bottom: 16px; }
                p { opacity: 0.9; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Token Received!</h1>
                <p>You can close this window and return to the terminal.</p>
              </div>
            </body>
          </html>
        `);

        // Close server after sending response
        setTimeout(() => {
          server.close();
          resolve({ success: true, token });
        }, 100);
      });

      // Handle POST submission as well
      app.post('/submit', (req: Request, res: Response) => {
        const token = req.body.token as string;

        if (!token) {
          res.status(400).json({ error: 'No token provided' });
          return;
        }

        res.json({ success: true });

        setTimeout(() => {
          server.close();
          resolve({ success: true, token });
        }, 100);
      });
    }

    // Handle Claude OAuth callback
    if (type === 'claude') {
      app.get('/callback', (req: Request, res: Response) => {
        const code = req.query.code as string;
        const error = req.query.error as string;

        if (error) {
          res.send(`
            <html>
              <body>
                <h1>Authentication Failed</h1>
                <p>Error: ${error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          setTimeout(() => {
            server.close();
            resolve({ success: false, error });
          }, 100);
          return;
        }

        if (!code) {
          res.status(400).send('<html><body><h1>Error: No authorization code</h1></body></html>');
          return;
        }

        res.send(`
          <html>
            <head>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #da7756 0%, #c35f3b 100%);
                  color: white;
                }
                .container {
                  text-align: center;
                  padding: 40px;
                  background: rgba(255, 255, 255, 0.1);
                  border-radius: 16px;
                  backdrop-filter: blur(10px);
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Authentication Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
              </div>
            </body>
          </html>
        `);

        setTimeout(() => {
          server.close();
          resolve({ success: true, token: code });
        }, 100);
      });
    }

    // Handle cancel
    app.get('/cancel', (_req: Request, res: Response) => {
      res.send(`
        <html>
          <body>
            <h1>Authentication Cancelled</h1>
            <p>You can close this window.</p>
          </body>
        </html>
      `);
      setTimeout(() => {
        server.close();
        resolve({ success: false, error: 'User cancelled authentication' });
      }, 100);
    });

    // Start server
    server = createServer(app);
    server.listen(port, '127.0.0.1', () => {
      console.log(`Auth server listening on http://127.0.0.1:${port}`);
    });

    // Set timeout
    const timeoutId = setTimeout(() => {
      server.close();
      resolve({ success: false, error: 'Authentication timed out' });
    }, timeout);

    // Clear timeout when server closes
    server.on('close', () => {
      clearTimeout(timeoutId);
    });
  });
}

/**
 * Get the callback URL for OAuth flows
 */
export function getCallbackUrl(port: number, type: 'claude' | 'openai'): string {
  if (type === 'claude') {
    return `http://127.0.0.1:${port}/callback`;
  }
  return `http://127.0.0.1:${port}`;
}

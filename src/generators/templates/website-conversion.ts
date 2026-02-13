/**
 * Lead capture and conversion templates
 * Generates API route handlers for lead capture and contact form components
 */

import type { WebsiteStrategyDocument } from '../../types/website-strategy.js';

/**
 * Escape a string for safe use inside JSX template literals
 */
function escapeJsx(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}

/**
 * Generate lead capture API route handler
 *
 * @param provider - Lead capture provider type
 * @returns API route source code (src/app/api/lead/route.ts)
 */
export function generateLeadCaptureRoute(
  provider: 'none' | 'webhook' | 'resend' | 'postmark' = 'webhook'
): string {
  if (provider === 'none') {
    return `import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Lead capture not configured' },
    { status: 501 }
  );
}
`;
  }

  if (provider === 'resend') {
    return `import { NextResponse } from 'next/server';

interface LeadPayload {
  name: string;
  email: string;
  message?: string;
}

export async function POST(request: Request) {
  try {
    const body: LeadPayload = await request.json();

    if (!body.name || !body.email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY not configured');
      return NextResponse.json(
        { error: 'Lead capture not configured' },
        { status: 500 }
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${apiKey}\`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: process.env.LEAD_NOTIFICATION_EMAIL || 'team@example.com',
        subject: \`New lead: \${body.name}\`,
        text: \`Name: \${body.name}\\nEmail: \${body.email}\\nMessage: \${body.message || 'N/A'}\`,
      }),
    });

    if (!response.ok) {
      console.error('Resend API error:', await response.text());
      return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Lead capture error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
`;
  }

  if (provider === 'postmark') {
    return `import { NextResponse } from 'next/server';

interface LeadPayload {
  name: string;
  email: string;
  message?: string;
}

export async function POST(request: Request) {
  try {
    const body: LeadPayload = await request.json();

    if (!body.name || !body.email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.POSTMARK_API_KEY;
    if (!apiKey) {
      console.error('POSTMARK_API_KEY not configured');
      return NextResponse.json(
        { error: 'Lead capture not configured' },
        { status: 500 }
      );
    }

    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': apiKey,
      },
      body: JSON.stringify({
        From: process.env.POSTMARK_FROM_EMAIL || 'no-reply@example.com',
        To: process.env.LEAD_NOTIFICATION_EMAIL || 'team@example.com',
        Subject: \`New lead: \${body.name}\`,
        TextBody: \`Name: \${body.name}\\nEmail: \${body.email}\\nMessage: \${body.message || 'N/A'}\`,
      }),
    });

    if (!response.ok) {
      console.error('Postmark API error:', await response.text());
      return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Lead capture error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
`;
  }

  // Default: webhook provider
  return `import { NextResponse } from 'next/server';

interface LeadPayload {
  name: string;
  email: string;
  message?: string;
}

export async function POST(request: Request) {
  try {
    const body: LeadPayload = await request.json();

    if (!body.name || !body.email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    const webhookUrl = process.env.LEAD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.error('LEAD_WEBHOOK_URL not configured');
      return NextResponse.json(
        { error: 'Lead capture not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: body.name,
        email: body.email,
        message: body.message || '',
        timestamp: new Date().toISOString(),
        source: 'website',
      }),
    });

    if (!response.ok) {
      console.error('Webhook error:', response.status);
      return NextResponse.json({ error: 'Failed to submit' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Lead capture error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
`;
}

/**
 * Generate contact form component
 *
 * @param strategy - Optional strategy for CTA text
 * @returns ContactForm component source code
 */
export function generateContactForm(
  strategy?: WebsiteStrategyDocument
): string {
  const ctaText = strategy?.conversionStrategy.primaryCta.text || 'Get Started';

  return `'use client';

import { useState, type FormEvent } from 'react';

/**
 * Lead capture contact form
 * Submits to /api/lead endpoint
 */
export default function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      message: formData.get('message') as string,
    };

    try {
      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        setStatus('success');
        e.currentTarget.reset();
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-lg bg-green-50 p-6 text-center">
        <p className="text-lg font-medium text-green-800">Thank you for reaching out!</p>
        <p className="mt-2 text-sm text-green-700">We will get back to you shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Name
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          type="email"
          id="email"
          name="email"
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-gray-700">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 disabled:opacity-50"
      >
        {status === 'submitting' ? 'Sending...' : '${escapeJsx(ctaText)}'}
      </button>
      {status === 'error' && (
        <p className="text-sm text-red-600">Something went wrong. Please try again.</p>
      )}
    </form>
  );
}
`;
}

/**
 * Generate .env.example entries for lead capture provider
 *
 * @param provider - Lead capture provider type
 * @returns Environment variable example lines
 */
export function generateLeadCaptureEnvExample(
  provider: 'none' | 'webhook' | 'resend' | 'postmark'
): string {
  switch (provider) {
    case 'webhook':
      return 'LEAD_WEBHOOK_URL=https://your-webhook-endpoint.com/leads\n';
    case 'resend':
      return 'RESEND_API_KEY=re_xxxxxxxxxxxx\nRESEND_FROM_EMAIL=onboarding@resend.dev\nLEAD_NOTIFICATION_EMAIL=team@example.com\n';
    case 'postmark':
      return 'POSTMARK_API_KEY=xxxxxxxxxxxx\nPOSTMARK_FROM_EMAIL=no-reply@example.com\nLEAD_NOTIFICATION_EMAIL=team@example.com\n';
    default:
      return '';
  }
}

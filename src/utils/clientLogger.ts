import * as Sentry from '@sentry/react';
import type React from 'react';
import type { ClientLogEntry, ClientLogLevel } from '../../shared/logging';

type ClientLoggerOptions = {
  getUserId?: () => string | null
}

type ConsoleMethod = 'debug' | 'info' | 'log' | 'warn' | 'error'

const CLIENT_LOG_ENDPOINT = '/api/client-logs'
const FLUSH_INTERVAL_MS = 3000
const MAX_BATCH_SIZE = 20
const MAX_MESSAGE_LENGTH = 4000
const queue: ClientLogEntry[] = []
const originalConsole = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

let flushTimer: number | null = null
let initialized = false
let getUserId: (() => string | null) | null = null

const truncate = (value: string) =>
  value.length > MAX_MESSAGE_LENGTH ? `${value.slice(0, MAX_MESSAGE_LENGTH)}[TRUNCATED]` : value

const sanitize = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    if (/^data:[^;]+;base64,/i.test(value)) {
      return '[OMITTED]'
    }
    return truncate(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ? truncate(value.stack) : undefined,
    }
  }

  if (Array.isArray(value)) {
    if (depth > 4) {
      return `[Array(${value.length})]`
    }

    return value.slice(0, 25).map((item) => sanitize(item, depth + 1, seen))
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[Circular]'
    }

    seen.add(value as object)
    if (depth > 4) {
      return '[Object]'
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
        const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
        if (['authorization', 'cookie', 'password', 'token', 'accesstoken', 'refreshtoken', 'secret', 'key'].includes(normalizedKey)) {
          return [key, '[REDACTED]']
        }

        return [key, sanitize(entryValue, depth + 1, seen)]
      }),
    )
  }

  return String(value)
}

const readRequestId = (response: Response) => response.headers.get('x-request-id')

const flush = () => {
  if (queue.length === 0) {
    return
  }

  const payload = JSON.stringify({
    entries: queue.splice(0, MAX_BATCH_SIZE),
  })

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' })
    try {
      if (navigator.sendBeacon(CLIENT_LOG_ENDPOINT, blob)) {
        return
      }
    } catch {
      // fall back to fetch below
    }
  }

  void fetch(CLIENT_LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
    credentials: 'same-origin',
  }).catch(() => undefined)
}

const scheduleFlush = () => {
  if (queue.length >= MAX_BATCH_SIZE) {
    flush()
    return
  }

  if (flushTimer !== null) {
    return
  }

  flushTimer = window.setTimeout(() => {
    flushTimer = null
    flush()
  }, FLUSH_INTERVAL_MS)
}

export const logClientEvent = (level: ClientLogLevel, message: string, extra?: Record<string, unknown>) => {
  const entry: ClientLogEntry = {
    level,
    message: truncate(message),
    request_id: typeof extra?.request_id === 'string' ? extra.request_id : null,
    route: window.location.pathname + window.location.search,
    user_id: getUserId?.() || null,
    extra: sanitize(extra || {}) as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  }

  queue.push(entry)
  scheduleFlush()
}

const normalizeConsoleArgs = (args: unknown[]) => {
  const error = args.find((value) => value instanceof Error)
  const message = args
    .filter((value) => typeof value === 'string')
    .join(' ')
    .trim()
    || (error instanceof Error ? error.message : 'console-log')
  const extra = args.filter((value) => typeof value !== 'string')
  return { message, extra }
}

const installConsoleBridge = () => {
  const levelMap: Record<ConsoleMethod, ClientLogLevel> = {
    debug: 'debug',
    info: 'info',
    log: 'info',
    warn: 'warn',
    error: 'error',
  }

  ;(Object.keys(levelMap) as ConsoleMethod[]).forEach((method) => {
    console[method] = (...args: unknown[]) => {
      originalConsole[method](...args)
      const parsed = normalizeConsoleArgs(args)
      logClientEvent(levelMap[method], parsed.message, {
        console: true,
        args: parsed.extra,
      })
    }
  })
}

const initSentry = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN_FRONTEND
  if (!dsn) {
    return
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    sendDefaultPii: false,
    integrations: [],
    tracesSampleRate: 0,
  })
}

export const initClientLogger = (options: ClientLoggerOptions = {}) => {
  if (initialized) {
    return
  }

  initialized = true
  getUserId = options.getUserId || null
  initSentry()
  installConsoleBridge()

  window.addEventListener('error', (event) => {
    logClientEvent('error', 'window.error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    })

    if (event.error instanceof Error) {
      Sentry.captureException(event.error)
    }
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason))
    logClientEvent('error', 'window.unhandledrejection', {
      error: reason,
    })
    Sentry.captureException(reason)
  })

  window.addEventListener('beforeunload', () => {
    flush()
  })
}

export const logRouteChange = (route: string) => {
  logClientEvent('info', 'route-change', { route })
}

export const logReactError = (error: Error, errorInfo: React.ErrorInfo) => {
  logClientEvent('error', 'react.error-boundary', {
    error,
    componentStack: errorInfo.componentStack,
  })
  Sentry.captureException(error, {
    contexts: {
      react: {
        componentStack: errorInfo.componentStack,
      },
    },
  })
}

export const logApiFailure = async (response: Response, input: RequestInfo | URL, method: string) => {
  let responseBody: unknown = null
  try {
    const cloned = response.clone()
    const contentType = cloned.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      responseBody = await cloned.json()
    } else {
      responseBody = await cloned.text()
    }
  } catch {
    responseBody = '[UNREADABLE]'
  }

  logClientEvent(response.status >= 500 ? 'error' : 'warn', 'api-response-failure', {
    request_id: readRequestId(response),
    method,
    url: typeof input === 'string' ? input : input.toString(),
    status: response.status,
    response: responseBody,
  })
}

export const logApiNetworkError = (error: unknown, input: RequestInfo | URL, method: string) => {
  logClientEvent('error', 'api-network-failure', {
    method,
    url: typeof input === 'string' ? input : input.toString(),
    error,
  })

  if (error instanceof Error) {
    Sentry.captureException(error)
  }
}

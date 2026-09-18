import type { RequestHandler } from 'express';
import type { DataSource } from 'typeorm';

/**
 * Is this application able to serve?
 *
 * Every platform that runs a backend asks the same question the same way: an
 * unauthenticated GET that answers 200 or 503. A load balancer takes an
 * instance out of rotation on 503, a container runtime restarts it, an uptime
 * check pages someone. Without it, the only way to know a process is wedged is
 * that requests start failing.
 *
 * It answers what a probe needs and nothing more. A health endpoint is
 * normally reachable without credentials — a load balancer cannot sign in —
 * so the default body says whether it can serve and stops there. Versions,
 * module names and counts are a map of your installation for whoever finds it.
 */
export interface HealthConfig {
  /** Where it answers. Outside `basePath` on purpose. Defaults to `/health`. */
  path?: string;

  /**
   * Adds the application version and the per-check breakdown even when
   * everything passes. Off by default: useful behind a gate, information
   * disclosure in front of one.
   */
  details?: boolean;
}

/** `pass` while it can serve, `fail` while it cannot. */
export type HealthStatus = 'pass' | 'fail';

export interface HealthReport {
  status: HealthStatus;
  /** Seconds since the process started, rounded. */
  uptime: number;
  version?: string;
  checks?: Record<string, HealthStatus | string>;
}

export interface HealthSources {
  db: () => DataSource;
  /** The APPLICATION's version, not liteb's. */
  version?: string;
  /** True once an ordered shutdown has begun. */
  isShuttingDown: () => boolean;
}

/**
 * The database check is a round TRIP, not a flag.
 *
 * `isInitialized` stays true after the connection drops: the pool remembers it
 * once connected and only finds out otherwise when something asks. A health
 * check that reads the flag reports `pass` through an outage, which is the one
 * moment it exists for.
 */
async function databaseAnswers(db: DataSource): Promise<boolean> {
  try {
    if (!db.isInitialized) return false;
    await db.query('select 1');
    return true;
  } catch {
    return false;
  }
}

export function buildHealth(
  config: HealthConfig,
  sources: HealthSources,
): RequestHandler {
  const startedAt = Date.now();

  return (_request, response, next) => {
    void (async () => {
      try {
        const uptime = Math.round((Date.now() - startedAt) / 1000);
        const checks: Record<string, HealthStatus | string> = {};

        // Reported BEFORE the server stops accepting, which is the whole point:
        // it gives a load balancer the window to stop sending traffic while
        // the in-flight requests finish.
        const draining = sources.isShuttingDown();
        if (draining) checks.server = 'shutting-down';

        const database = await databaseAnswers(sources.db());
        checks.database = database ? 'pass' : 'fail';

        const status: HealthStatus = !draining && database ? 'pass' : 'fail';

        const report: HealthReport = { status, uptime };
        if (config.details) report.version = sources.version;
        if (config.details || status === 'fail') report.checks = checks;

        // 503 and not 500: this is "not able to serve right now", which is
        // what a probe is asking, and what tells a balancer to retry later.
        response.status(status === 'pass' ? 200 : 503).json(report);
      } catch (error) {
        next(error);
      }
    })();
  };
}

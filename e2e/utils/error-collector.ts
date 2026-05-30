/**
 * E2E Test Error Collector
 *
 * Collects and categorizes errors during E2E test execution.
 * Tracks console errors, network failures, and page crashes.
 */

import type { Page, Request, Response, ConsoleMessage } from '@playwright/test';

/**
 * Types of errors collected during tests.
 */
export type ErrorType =
  | 'console_error'
  | 'console_warning'
  | 'page_error'
  | 'network_error'
  | 'network_4xx'
  | 'network_5xx'
  | 'timeout'
  | 'crash';

/**
 * Severity levels for errors.
 */
export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';

/**
 * Collected error structure.
 */
export interface CollectedError {
  type: ErrorType;
  severity: ErrorSeverity;
  page: string;
  message: string;
  timestamp: Date;
  details?: Record<string, unknown>;
  screenshot?: string;
}

/**
 * Error summary for reporting.
 */
export interface ErrorSummary {
  totalPages: number;
  pagesVisited: string[];
  pagesWithErrors: number;
  totalErrors: number;
  errorsByType: Record<ErrorType, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  errors: CollectedError[];
  timestamp: Date;
  duration: number;
}

/**
 * ErrorCollector class for tracking errors across pages.
 */
export class ErrorCollector {
  private errors: CollectedError[] = [];
  private pagesVisited: Set<string> = new Set();
  private startTime: Date;

  constructor() {
    this.startTime = new Date();
  }

  /**
   * Attach error listeners to a page.
   */
  attachToPage(page: Page, currentUrl: string): void {
    this.pagesVisited.add(currentUrl);

    // Console errors and warnings
    page.on('console', (msg: ConsoleMessage) => {
      const type = msg.type();
      if (type === 'error') {
        this.addError({
          type: 'console_error',
          severity: 'error',
          page: currentUrl,
          message: msg.text(),
          timestamp: new Date(),
          details: {
            location: msg.location(),
          },
        });
      } else if (type === 'warning') {
        // Only collect warnings that look like actual issues
        const text = msg.text();
        if (
          text.includes('Error') ||
          text.includes('error') ||
          text.includes('Failed') ||
          text.includes('failed')
        ) {
          this.addError({
            type: 'console_warning',
            severity: 'warning',
            page: currentUrl,
            message: text,
            timestamp: new Date(),
          });
        }
      }
    });

    // Uncaught page errors (JavaScript exceptions)
    page.on('pageerror', (error: Error) => {
      this.addError({
        type: 'page_error',
        severity: 'critical',
        page: currentUrl,
        message: error.message,
        timestamp: new Date(),
        details: {
          stack: error.stack,
        },
      });
    });

    // Network request failures (actual network errors, not HTTP errors)
    page.on('requestfailed', (request: Request) => {
      const failure = request.failure();
      // Skip cancelled requests (e.g., navigation interrupts)
      if (failure?.errorText === 'net::ERR_ABORTED') return;

      this.addError({
        type: 'network_error',
        severity: 'error',
        page: currentUrl,
        message: `${request.method()} ${request.url()} - ${failure?.errorText || 'Unknown error'}`,
        timestamp: new Date(),
        details: {
          method: request.method(),
          url: request.url(),
          resourceType: request.resourceType(),
          errorText: failure?.errorText,
        },
      });
    });

    // HTTP error responses (4xx, 5xx)
    page.on('response', (response: Response) => {
      const status = response.status();
      const url = response.url();

      // Skip external resources and expected 4xx (like 401 for auth checks)
      if (!url.includes('localhost:3000')) return;
      if (url.includes('/api/auth')) return; // Auth endpoints may return 401

      if (status >= 500) {
        this.addError({
          type: 'network_5xx',
          severity: 'critical',
          page: currentUrl,
          message: `${response.request().method()} ${url} returned ${status}`,
          timestamp: new Date(),
          details: {
            status,
            statusText: response.statusText(),
            url,
          },
        });
      } else if (status >= 400 && status !== 401) {
        this.addError({
          type: 'network_4xx',
          severity: 'error',
          page: currentUrl,
          message: `${response.request().method()} ${url} returned ${status}`,
          timestamp: new Date(),
          details: {
            status,
            statusText: response.statusText(),
            url,
          },
        });
      }
    });

    // Page crash
    page.on('crash', () => {
      this.addError({
        type: 'crash',
        severity: 'critical',
        page: currentUrl,
        message: 'Page crashed',
        timestamp: new Date(),
      });
    });
  }

  /**
   * Add an error to the collection.
   */
  addError(error: CollectedError): void {
    this.errors.push(error);
  }

  /**
   * Add a timeout error.
   */
  addTimeoutError(page: string, message: string): void {
    this.addError({
      type: 'timeout',
      severity: 'error',
      page,
      message,
      timestamp: new Date(),
    });
  }

  /**
   * Get all collected errors.
   */
  getErrors(): CollectedError[] {
    return [...this.errors];
  }

  /**
   * Get errors for a specific page.
   */
  getErrorsForPage(page: string): CollectedError[] {
    return this.errors.filter((e) => e.page === page);
  }

  /**
   * Check if there are any critical errors.
   */
  hasCriticalErrors(): boolean {
    return this.errors.some((e) => e.severity === 'critical');
  }

  /**
   * Check if a page has any errors.
   */
  pageHasErrors(page: string): boolean {
    return this.errors.some((e) => e.page === page);
  }

  /**
   * Get summary of all collected errors.
   */
  getSummary(): ErrorSummary {
    const errorsByType: Record<ErrorType, number> = {
      console_error: 0,
      console_warning: 0,
      page_error: 0,
      network_error: 0,
      network_4xx: 0,
      network_5xx: 0,
      timeout: 0,
      crash: 0,
    };

    const errorsBySeverity: Record<ErrorSeverity, number> = {
      critical: 0,
      error: 0,
      warning: 0,
      info: 0,
    };

    const pagesWithErrors = new Set<string>();

    for (const error of this.errors) {
      errorsByType[error.type]++;
      errorsBySeverity[error.severity]++;
      pagesWithErrors.add(error.page);
    }

    return {
      totalPages: this.pagesVisited.size,
      pagesVisited: Array.from(this.pagesVisited),
      pagesWithErrors: pagesWithErrors.size,
      totalErrors: this.errors.length,
      errorsByType,
      errorsBySeverity,
      errors: this.errors,
      timestamp: new Date(),
      duration: Date.now() - this.startTime.getTime(),
    };
  }

  /**
   * Clear all collected errors.
   */
  clear(): void {
    this.errors = [];
    this.pagesVisited.clear();
    this.startTime = new Date();
  }

  /**
   * Generate a human-readable report.
   */
  generateReport(): string {
    const summary = this.getSummary();
    const lines: string[] = [
      '='.repeat(60),
      'E2E CRAWLER ERROR REPORT',
      '='.repeat(60),
      '',
      `Timestamp: ${summary.timestamp.toISOString()}`,
      `Duration: ${Math.round(summary.duration / 1000)}s`,
      '',
      '--- SUMMARY ---',
      `Total Pages Visited: ${summary.totalPages}`,
      `Pages With Errors: ${summary.pagesWithErrors}`,
      `Total Errors: ${summary.totalErrors}`,
      '',
      '--- ERRORS BY SEVERITY ---',
    ];

    for (const [severity, count] of Object.entries(summary.errorsBySeverity)) {
      if (count > 0) {
        lines.push(`  ${severity.toUpperCase()}: ${count}`);
      }
    }

    lines.push('', '--- ERRORS BY TYPE ---');
    for (const [type, count] of Object.entries(summary.errorsByType)) {
      if (count > 0) {
        lines.push(`  ${type}: ${count}`);
      }
    }

    if (summary.errors.length > 0) {
      lines.push('', '--- ERROR DETAILS ---');
      for (const error of summary.errors) {
        lines.push('');
        lines.push(`[${error.severity.toUpperCase()}] ${error.type}`);
        lines.push(`  Page: ${error.page}`);
        lines.push(`  Message: ${error.message}`);
        if (error.details) {
          lines.push(`  Details: ${JSON.stringify(error.details, null, 2)}`);
        }
      }
    }

    lines.push('', '='.repeat(60));

    return lines.join('\n');
  }
}

/**
 * Create a new error collector instance.
 */
export function createErrorCollector(): ErrorCollector {
  return new ErrorCollector();
}

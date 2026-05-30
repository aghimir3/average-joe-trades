/**
 * Position Health Monitor
 * Real-time monitoring and alerting for open positions
 */

import { prisma } from '@/lib/prisma';
import type { AlertType, AlertSeverity, PositionHealthAlert } from './types';

// ============================================================================
// Check Position Health
// ============================================================================

export async function checkPositionHealth(userId: string): Promise<PositionHealthAlert[]> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Get open positions
  const positions = await prisma.derivedPosition.findMany({
    where: { userId },
    include: {
      brokerageAccount: { select: { name: true } },
    },
  });

  // Pre-fetch ALL recent undismissed alerts in ONE query (avoids N+1)
  const existingAlerts = await prisma.positionHealthAlert.findMany({
    where: {
      userId,
      isDismissed: false,
      createdAt: { gte: oneDayAgo },
    },
    select: { positionId: true, alertType: true },
  });

  const existingAlertKeys = new Set(
    existingAlerts.map((a) => `${a.positionId ?? 'null'}|${a.alertType}`)
  );

  const alerts: PositionHealthAlert[] = [];

  for (const pos of positions) {
    const positionAlerts = analyzePosition(pos, now);

    for (const alert of positionAlerts) {
      // O(1) Set lookup instead of per-alert findFirst query
      if (existingAlertKeys.has(`${pos.id}|${alert.alertType}`)) continue;

      const created = await prisma.positionHealthAlert.create({
        data: {
          userId,
          positionId: pos.id,
          alertType: alert.alertType,
          severity: alert.severity,
          symbol: pos.symbol,
          title: alert.title,
          description: alert.description,
          recommendation: alert.recommendation,
          context: JSON.stringify(alert.context),
          expiresAt: alert.expiresAt,
        },
      });

      alerts.push({
        id: created.id,
        alertType: alert.alertType,
        severity: alert.severity,
        symbol: pos.symbol,
        positionId: pos.id,
        title: alert.title,
        description: alert.description,
        recommendation: alert.recommendation,
        context: alert.context,
        createdAt: created.createdAt,
        expiresAt: alert.expiresAt,
      });
    }
  }

  // Check portfolio-level alerts (reuses same pre-fetched Set)
  const portfolioAlerts = await checkPortfolioAlerts(userId, positions);
  for (const alert of portfolioAlerts) {
    if (existingAlertKeys.has(`null|${alert.alertType}`)) continue;

    const created = await prisma.positionHealthAlert.create({
      data: {
        userId,
        alertType: alert.alertType,
        severity: alert.severity,
        symbol: 'PORTFOLIO',
        title: alert.title,
        description: alert.description,
        recommendation: alert.recommendation,
        context: JSON.stringify(alert.context),
      },
    });

    alerts.push({
      id: created.id,
      alertType: alert.alertType,
      severity: alert.severity,
      symbol: 'PORTFOLIO',
      title: alert.title,
      description: alert.description,
      recommendation: alert.recommendation,
      context: alert.context,
      createdAt: created.createdAt,
    });
  }

  return alerts;
}

// ============================================================================
// Get Active Alerts
// ============================================================================

export async function getActiveAlerts(userId: string): Promise<PositionHealthAlert[]> {
  const alerts = await prisma.positionHealthAlert.findMany({
    where: {
      userId,
      isDismissed: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: [
      { severity: 'desc' }, // critical first
      { createdAt: 'desc' },
    ],
  });

  return alerts.map((a) => ({
    id: a.id,
    alertType: a.alertType as AlertType,
    severity: a.severity as AlertSeverity,
    symbol: a.symbol,
    positionId: a.positionId ?? undefined,
    title: a.title,
    description: a.description,
    recommendation: a.recommendation ?? undefined,
    context: a.context ? JSON.parse(a.context) : undefined,
    createdAt: a.createdAt,
    expiresAt: a.expiresAt ?? undefined,
  }));
}

// ============================================================================
// Alert Management
// ============================================================================

export async function dismissAlert(alertId: string, userId: string): Promise<boolean> {
  const result = await prisma.positionHealthAlert.updateMany({
    where: { id: alertId, userId },
    data: { isDismissed: true, dismissedAt: new Date() },
  });

  return result.count > 0;
}

export async function actionAlert(alertId: string, userId: string): Promise<boolean> {
  const result = await prisma.positionHealthAlert.updateMany({
    where: { id: alertId, userId },
    data: { isActioned: true, actionedAt: new Date() },
  });

  return result.count > 0;
}

// ============================================================================
// Position Analysis
// ============================================================================

interface GeneratedAlert {
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  recommendation?: string;
  context?: Record<string, unknown>;
  expiresAt?: Date;
}

function analyzePosition(
  position: {
    id: string;
    symbol: string;
    positionType: string;
    optionType: string | null;
    strategy: string | null;
    expiration: Date | null;
    strike: unknown;
    avgPrice: unknown;
    quantity: unknown;
  },
  now: Date
): GeneratedAlert[] {
  const alerts: GeneratedAlert[] = [];

  // Only check options
  if (position.positionType !== 'option' || !position.expiration) {
    return alerts;
  }

  const daysToExpiry = Math.ceil(
    (position.expiration.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  );
  const strike = Number(position.strike);

  // Approaching expiration alerts
  if (daysToExpiry <= 0) {
    alerts.push({
      alertType: 'APPROACHING_EXPIRATION',
      severity: 'critical',
      title: `${position.symbol} Expired`,
      description: `Your ${position.optionType} option has expired`,
      recommendation: 'Review final settlement and remove from tracking',
      context: { daysToExpiry, strike, optionType: position.optionType },
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });
  } else if (daysToExpiry <= 3) {
    alerts.push({
      alertType: 'APPROACHING_EXPIRATION',
      severity: 'critical',
      title: `${position.symbol} Expiring Soon`,
      description: `Your ${position.symbol} ${position.optionType} $${strike} expires in ${daysToExpiry} day(s)`,
      recommendation:
        position.strategy?.includes('covered') || position.strategy?.includes('secured')
          ? 'Consider rolling to a later expiration'
          : 'Close position or prepare for expiration',
      context: { daysToExpiry, strike, strategy: position.strategy },
      expiresAt: position.expiration,
    });
  } else if (daysToExpiry <= 7) {
    alerts.push({
      alertType: 'APPROACHING_EXPIRATION',
      severity: 'warning',
      title: `${position.symbol} Expiring This Week`,
      description: `${position.symbol} ${position.optionType} $${strike} expires in ${daysToExpiry} days`,
      recommendation: 'Monitor position closely',
      context: { daysToExpiry, strike },
      expiresAt: position.expiration,
    });
  }

  // Theta decay optimal (for short options)
  if (
    (position.strategy === 'covered_call' || position.strategy === 'cash_secured_put') &&
    daysToExpiry > 0 &&
    daysToExpiry <= 14
  ) {
    // Estimate premium captured (simplified)
    const estimatedThetaDecay = daysToExpiry < 7 ? 0.7 : 0.5;

    if (estimatedThetaDecay >= 0.5) {
      alerts.push({
        alertType: 'THETA_DECAY_OPTIMAL',
        severity: 'info',
        title: `${position.symbol} Good Exit Point`,
        description: `Theta decay optimal - consider closing for profit`,
        recommendation: 'Close position to capture gains',
        context: { estimatedPremiumCaptured: estimatedThetaDecay * 100 },
      });
    }
  }

  // Roll opportunity for wheel positions
  if (
    (position.strategy === 'covered_call' || position.strategy === 'cash_secured_put') &&
    daysToExpiry > 0 &&
    daysToExpiry <= 7
  ) {
    alerts.push({
      alertType: 'ROLL_OPPORTUNITY',
      severity: 'info',
      title: `${position.symbol} Roll Opportunity`,
      description: `Consider rolling to collect additional premium`,
      recommendation: 'Evaluate roll credit vs. letting expire',
      context: { daysToExpiry, strategy: position.strategy },
    });
  }

  return alerts;
}

async function checkPortfolioAlerts(
  userId: string,
  positions: { symbol: string; positionType: string; avgPrice: unknown; quantity: unknown }[]
): Promise<GeneratedAlert[]> {
  const alerts: GeneratedAlert[] = [];

  // Check concentration
  const symbolValues = new Map<string, number>();
  let totalValue = 0;

  for (const pos of positions) {
    const value = Math.abs(Number(pos.avgPrice) * Number(pos.quantity)) * (pos.positionType === 'option' ? 100 : 1);
    symbolValues.set(pos.symbol, (symbolValues.get(pos.symbol) || 0) + value);
    totalValue += value;
  }

  if (totalValue > 0) {
    const sortedSymbols = Array.from(symbolValues.entries()).sort((a, b) => b[1] - a[1]);
    const topConcentration = sortedSymbols[0][1] / totalValue;

    if (topConcentration > 0.4) {
      alerts.push({
        alertType: 'CONCENTRATION_WARNING',
        severity: topConcentration > 0.6 ? 'critical' : 'warning',
        title: 'High Concentration Risk',
        description: `${sortedSymbols[0][0]} is ${(topConcentration * 100).toFixed(0)}% of your portfolio`,
        recommendation: 'Consider diversifying to reduce single-stock risk',
        context: {
          topSymbol: sortedSymbols[0][0],
          concentration: topConcentration * 100,
        },
      });
    }
  }

  // Check correlation (same symbols in multiple positions)
  const symbolCounts = new Map<string, number>();
  for (const pos of positions) {
    symbolCounts.set(pos.symbol, (symbolCounts.get(pos.symbol) || 0) + 1);
  }

  const multiPositionSymbols = Array.from(symbolCounts.entries()).filter(([, count]) => count > 2);
  if (multiPositionSymbols.length > 0) {
    alerts.push({
      alertType: 'CORRELATION_ALERT',
      severity: 'info',
      title: 'Multiple Positions Same Symbol',
      description: `You have multiple positions in: ${multiPositionSymbols.map(([s]) => s).join(', ')}`,
      recommendation: 'Ensure this is intentional and risk is managed',
      context: { symbols: multiPositionSymbols.map(([s, c]) => ({ symbol: s, count: c })) },
    });
  }

  return alerts;
}

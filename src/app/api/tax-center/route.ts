import { apiJson } from '@/lib/api/response';
/**
 * Tax Center API
 *
 * Provides comprehensive tax lot insights including:
 * - Realized gains/losses (short-term vs long-term)
 * - Unrealized gains/losses with tax implications
 * - Wash sale detection
 * - Tax-loss harvesting opportunities
 * - Cost basis information
 */


import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import { Prisma } from '@/generated/prisma/client';
import { buildAccountScope } from '@/lib/db/account-scope';

const LONG_TERM_DAYS = 365; // IRS long-term capital gains threshold
const WASH_SALE_DAYS = 30; // IRS wash sale window

interface TaxLot {
  id: string;
  symbol: string;
  quantity: number;
  costBasis: number;
  costPerShare: number;
  acquiredDate: Date;
  soldDate?: Date;
  proceeds?: number;
  gainLoss: number;
  gainLossPct: number;
  holdingPeriod: 'short-term' | 'long-term';
  daysHeld: number;
  isWashSale: boolean;
  washSaleDisallowed?: number;
  type: 'stock' | 'option' | 'future';
  accountName: string;
  accountId: string;
}

interface TaxSummary {
  year: number;
  // Realized gains/losses
  realizedShortTermGains: number;
  realizedShortTermLosses: number;
  realizedLongTermGains: number;
  realizedLongTermLosses: number;
  totalRealizedGains: number;
  totalRealizedLosses: number;
  netRealizedPnL: number;
  // Trade counts
  shortTermTradeCount: number;
  longTermTradeCount: number;
  totalTradeCount: number;
  // Wash sales
  potentialWashSales: number;
  washSaleDisallowed: number;
  // Unrealized
  unrealizedShortTermGains: number;
  unrealizedShortTermLosses: number;
  unrealizedLongTermGains: number;
  unrealizedLongTermLosses: number;
  totalUnrealizedGains: number;
  totalUnrealizedLosses: number;
  netUnrealizedPnL: number;
  // Tax estimates (simplified)
  estimatedShortTermTax: number;
  estimatedLongTermTax: number;
  totalEstimatedTax: number;
}

interface TaxLossHarvestingOpportunity {
  id: string;
  symbol: string;
  quantity: number;
  costBasis: number;
  marketValue: number;
  unrealizedLoss: number;
  unrealizedLossPct: number;
  daysHeld: number;
  holdingPeriod: 'short-term' | 'long-term';
  potentialTaxSavings: number;
  hasWashSaleRisk: boolean;
  accountName: string;
  accountId: string;
}

interface WashSaleAlert {
  id: string;
  symbol: string;
  lossDate: Date;
  lossAmount: number;
  repurchaseDate: Date;
  repurchaseAmount: number;
  disallowedLoss: number;
  accountName: string;
}

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    log.info({ userId }, 'Fetching tax center data');

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const accountId = searchParams.get('accountId');

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);
    const now = new Date();

    // Scope queries to selected account or active accounts only.
    const accountFilter = buildAccountScope(accountId);

    // Fetch accounts for name mapping
    const accounts = await prisma.brokerageAccount.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true },
    });
    const accountMap = new Map(accounts.map(a => [a.id, a.name]));

    // Fetch realized closes for the year
    const realizedCloses = await prisma.realizedClose.findMany({
      where: {
        userId,
        closeDate: { gte: yearStart, lte: yearEnd },
        hasUnknownBasis: false,
        ...accountFilter,
      },
      orderBy: { closeDate: 'desc' },
    });

    // Fetch all ledger events for wash sale detection
    // Look at purchases within wash sale window of any losses
    const washSaleWindowStart = new Date(yearStart);
    washSaleWindowStart.setDate(washSaleWindowStart.getDate() - WASH_SALE_DAYS);
    const washSaleWindowEnd = new Date(yearEnd);
    washSaleWindowEnd.setDate(washSaleWindowEnd.getDate() + WASH_SALE_DAYS);

    const ledgerEvents = await prisma.ledgerEvent.findMany({
      where: {
        userId,
        deletedAt: null,
        activityDate: { gte: washSaleWindowStart, lte: washSaleWindowEnd },
        transCode: { in: ['BUY', 'BTO'] },
        ...accountFilter,
      },
      select: {
        id: true,
        symbol: true,
        activityDate: true,
        quantity: true,
        price: true,
        amount: true,
        isOption: true,
        brokerageAccountId: true,
      },
      orderBy: { activityDate: 'asc' },
    });

    // Build purchase map for wash sale detection
    const purchasesBySymbol = new Map<string, Array<{
      date: Date;
      quantity: number;
      amount: number;
      accountId: string;
    }>>();

    for (const event of ledgerEvents) {
      const symbol = event.symbol;
      if (!purchasesBySymbol.has(symbol)) {
        purchasesBySymbol.set(symbol, []);
      }
      purchasesBySymbol.get(symbol)!.push({
        date: event.activityDate,
        quantity: Number(event.quantity),
        amount: Math.abs(Number(event.amount || 0)),
        accountId: event.brokerageAccountId,
      });
    }

    // Process realized closes into tax lots
    const taxLots: TaxLot[] = [];
    const washSaleAlerts: WashSaleAlert[] = [];
    let potentialWashSales = 0;
    let totalWashSaleDisallowed = 0;

    for (const close of realizedCloses) {
      const daysHeld = Math.floor(
        (close.closeDate.getTime() - close.openDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const holdingPeriod = daysHeld > LONG_TERM_DAYS ? 'long-term' : 'short-term';
      const gainLoss = Number(close.realizedPnL);
      const costBasis = Number(close.openAmount);
      const proceeds = Number(close.closeAmount);
      const quantity = Number(close.quantity);

      // Check for wash sale if this is a loss
      let isWashSale = false;
      let washSaleDisallowed = 0;

      if (gainLoss < 0) {
        const purchases = purchasesBySymbol.get(close.symbol) || [];
        const lossDate = close.closeDate;

        // Check for purchases within 30 days before or after the loss
        for (const purchase of purchases) {
          const daysDiff = Math.abs(
            (purchase.date.getTime() - lossDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysDiff <= WASH_SALE_DAYS && purchase.date.getTime() !== close.openDate.getTime()) {
            isWashSale = true;
            // Simplified: disallow the full loss (actual rules are more complex)
            washSaleDisallowed = Math.abs(gainLoss);
            potentialWashSales++;
            totalWashSaleDisallowed += washSaleDisallowed;

            washSaleAlerts.push({
              id: close.id,
              symbol: close.symbol,
              lossDate: lossDate,
              lossAmount: Math.abs(gainLoss),
              repurchaseDate: purchase.date,
              repurchaseAmount: purchase.amount,
              disallowedLoss: washSaleDisallowed,
              accountName: accountMap.get(close.brokerageAccountId) || 'Unknown',
            });
            break; // One wash sale per loss is enough to flag
          }
        }
      }

      taxLots.push({
        id: close.id,
        symbol: close.symbol,
        quantity,
        costBasis,
        costPerShare: quantity > 0 ? costBasis / quantity : 0,
        acquiredDate: close.openDate,
        soldDate: close.closeDate,
        proceeds,
        gainLoss,
        gainLossPct: costBasis > 0 ? (gainLoss / costBasis) * 100 : 0,
        holdingPeriod,
        daysHeld,
        isWashSale,
        washSaleDisallowed: isWashSale ? washSaleDisallowed : undefined,
        type: close.closeType as 'stock' | 'option' | 'future',
        accountName: accountMap.get(close.brokerageAccountId) || 'Unknown',
        accountId: close.brokerageAccountId,
      });
    }

    // Calculate summary for realized
    const shortTermTrades = taxLots.filter(t => t.holdingPeriod === 'short-term');
    const longTermTrades = taxLots.filter(t => t.holdingPeriod === 'long-term');

    const realizedShortTermGains = shortTermTrades
      .filter(t => t.gainLoss > 0)
      .reduce((sum, t) => sum + t.gainLoss, 0);
    const realizedShortTermLosses = shortTermTrades
      .filter(t => t.gainLoss < 0)
      .reduce((sum, t) => sum + Math.abs(t.gainLoss), 0);
    const realizedLongTermGains = longTermTrades
      .filter(t => t.gainLoss > 0)
      .reduce((sum, t) => sum + t.gainLoss, 0);
    const realizedLongTermLosses = longTermTrades
      .filter(t => t.gainLoss < 0)
      .reduce((sum, t) => sum + Math.abs(t.gainLoss), 0);

    // Fetch current positions for unrealized gains/losses
    const brokerPositions = await prisma.brokerPosition.findMany({
      where: {
        userId,
        isStale: false,
        quantity: { not: new Prisma.Decimal(0) },
        ...accountFilter,
      },
    });

    // Fetch derived positions for acquisition dates
    const derivedPositions = await prisma.derivedPosition.findMany({
      where: {
        userId,
        quantity: { not: new Prisma.Decimal(0) },
        ...accountFilter,
      },
    });

    // Merge positions data for unrealized calculations
    const positionMap = new Map<string, { firstEntryDate: Date }>();
    for (const dp of derivedPositions) {
      const key = `${dp.brokerageAccountId}|${dp.symbol}|${dp.positionType}|${dp.optionType || ''}|${dp.strike || ''}|${dp.expiration?.toISOString() || ''}`;
      positionMap.set(key, { firstEntryDate: dp.firstEntryDate });
    }

    let unrealizedShortTermGains = 0;
    let unrealizedShortTermLosses = 0;
    let unrealizedLongTermGains = 0;
    let unrealizedLongTermLosses = 0;

    const taxLossHarvestingOpportunities: TaxLossHarvestingOpportunity[] = [];

    for (const pos of brokerPositions) {
      if (!pos.marketPrice || !pos.avgCostBasis) continue;

      const key = `${pos.brokerageAccountId}|${pos.symbol}|${pos.positionType}|${pos.optionType || ''}|${pos.strike || ''}|${pos.expiration?.toISOString() || ''}`;
      const derivedData = positionMap.get(key);

      const acquiredDate = derivedData?.firstEntryDate || pos.createdAt;
      const daysHeld = Math.floor(
        (now.getTime() - acquiredDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const holdingPeriod = daysHeld > LONG_TERM_DAYS ? 'long-term' : 'short-term';

      const quantity = Math.abs(Number(pos.quantity));
      const costBasis = Number(pos.avgCostBasis) * quantity;
      const marketValue = Number(pos.marketPrice) * quantity;
      const unrealizedPnL = marketValue - costBasis;

      if (unrealizedPnL > 0) {
        if (holdingPeriod === 'short-term') {
          unrealizedShortTermGains += unrealizedPnL;
        } else {
          unrealizedLongTermGains += unrealizedPnL;
        }
      } else if (unrealizedPnL < 0) {
        if (holdingPeriod === 'short-term') {
          unrealizedShortTermLosses += Math.abs(unrealizedPnL);
        } else {
          unrealizedLongTermLosses += Math.abs(unrealizedPnL);
        }

        // Check for wash sale risk (recent purchases of same symbol)
        const recentPurchases = purchasesBySymbol.get(pos.symbol) || [];
        const hasWashSaleRisk = recentPurchases.some(p => {
          const daysSincePurchase = Math.floor(
            (now.getTime() - p.date.getTime()) / (1000 * 60 * 60 * 24)
          );
          return daysSincePurchase <= WASH_SALE_DAYS;
        });

        // Estimate tax savings (simplified: 24% for short-term, 15% for long-term)
        const taxRate = holdingPeriod === 'short-term' ? 0.24 : 0.15;
        const potentialTaxSavings = Math.abs(unrealizedPnL) * taxRate;

        // Only add significant losses (> $100)
        if (Math.abs(unrealizedPnL) > 100) {
          taxLossHarvestingOpportunities.push({
            id: pos.id,
            symbol: pos.symbol,
            quantity,
            costBasis,
            marketValue,
            unrealizedLoss: Math.abs(unrealizedPnL),
            unrealizedLossPct: costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0,
            daysHeld,
            holdingPeriod,
            potentialTaxSavings,
            hasWashSaleRisk,
            accountName: accountMap.get(pos.brokerageAccountId) || 'Unknown',
            accountId: pos.brokerageAccountId,
          });
        }
      }
    }

    // Sort opportunities by potential savings
    taxLossHarvestingOpportunities.sort((a, b) => b.potentialTaxSavings - a.potentialTaxSavings);

    // Calculate tax estimates (simplified rates)
    // Short-term: ordinary income rate (assume 24%)
    // Long-term: preferential rate (assume 15%)
    const netShortTermRealized = realizedShortTermGains - realizedShortTermLosses;
    const netLongTermRealized = realizedLongTermGains - realizedLongTermLosses;

    const estimatedShortTermTax = Math.max(0, netShortTermRealized * 0.24);
    const estimatedLongTermTax = Math.max(0, netLongTermRealized * 0.15);
    const totalEstimatedTax = estimatedShortTermTax + estimatedLongTermTax;

    const summary: TaxSummary = {
      year,
      realizedShortTermGains,
      realizedShortTermLosses,
      realizedLongTermGains,
      realizedLongTermLosses,
      totalRealizedGains: realizedShortTermGains + realizedLongTermGains,
      totalRealizedLosses: realizedShortTermLosses + realizedLongTermLosses,
      netRealizedPnL: (realizedShortTermGains + realizedLongTermGains) - (realizedShortTermLosses + realizedLongTermLosses),
      shortTermTradeCount: shortTermTrades.length,
      longTermTradeCount: longTermTrades.length,
      totalTradeCount: taxLots.length,
      potentialWashSales,
      washSaleDisallowed: totalWashSaleDisallowed,
      unrealizedShortTermGains,
      unrealizedShortTermLosses,
      unrealizedLongTermGains,
      unrealizedLongTermLosses,
      totalUnrealizedGains: unrealizedShortTermGains + unrealizedLongTermGains,
      totalUnrealizedLosses: unrealizedShortTermLosses + unrealizedLongTermLosses,
      netUnrealizedPnL: (unrealizedShortTermGains + unrealizedLongTermGains) - (unrealizedShortTermLosses + unrealizedLongTermLosses),
      estimatedShortTermTax,
      estimatedLongTermTax,
      totalEstimatedTax,
    };

    // Get available years for year selector
    const yearsResult = await prisma.realizedClose.findMany({
      where: { userId, hasUnknownBasis: false },
      select: { closeDate: true },
      distinct: ['closeDate'],
    });

    const availableYears = [...new Set(
      yearsResult.map(r => r.closeDate.getFullYear())
    )].sort((a, b) => b - a);

    // Ensure current year is included
    if (!availableYears.includes(new Date().getFullYear())) {
      availableYears.unshift(new Date().getFullYear());
    }

    log.info({
      userId,
      year,
      totalTrades: taxLots.length,
      washSales: potentialWashSales,
      harvestingOpportunities: taxLossHarvestingOpportunities.length,
    }, 'Tax center data fetched');

    return apiJson({
      data: {
        summary,
        taxLots,
        taxLossHarvestingOpportunities,
        washSaleAlerts,
        availableYears,
        accounts: accounts.map(a => ({ id: a.id, name: a.name })),
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to fetch tax center data');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch tax center data' },
      { status: 500 }
    );
  }
}


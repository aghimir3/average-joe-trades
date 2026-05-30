export type MetricTooltipKey =
  | 'confidence'
  | 'expected_value'
  | 'cagr'
  | 'sharpe'
  | 'sortino'
  | 'max_drawdown'
  | 'hit_rate'
  | 'drift_score'
  | 'gross_exposure'
  | 'net_exposure'
  | 'cvar95'
  | 'walk_forward'
  | 'reason_codes'
  | 'risk_flags';

export interface MetricTooltipDefinition {
  label: string;
  plainEnglish: string;
  howToUse: string;
}

export const metricTooltips: Record<MetricTooltipKey, MetricTooltipDefinition> = {
  confidence: {
    label: 'Confidence',
    plainEnglish: 'How strongly the model believes this action is better than alternatives.',
    howToUse: 'Use high confidence as stronger evidence, but still check risk flags before acting.',
  },
  expected_value: {
    label: 'Expected Value',
    plainEnglish: 'Estimated average outcome if similar setups are repeated many times.',
    howToUse: 'Positive expected value can be useful, but avoid oversized positions on one signal.',
  },
  cagr: {
    label: 'CAGR',
    plainEnglish: 'Average annual growth rate after compounding over the test period.',
    howToUse: 'Compare strategies by CAGR together with drawdown, not CAGR alone.',
  },
  sharpe: {
    label: 'Sharpe',
    plainEnglish: 'Return earned per unit of total volatility.',
    howToUse: 'Higher is generally better. Negative Sharpe means risk was not compensated by returns.',
  },
  sortino: {
    label: 'Sortino',
    plainEnglish: 'Return earned per unit of downside volatility (harmful swings only).',
    howToUse: 'Use with Sharpe to see if downside risk is acceptable.',
  },
  max_drawdown: {
    label: 'Max Drawdown',
    plainEnglish: 'Largest peak-to-trough loss during the period.',
    howToUse: 'Treat this as a historical pain estimate and size positions to survive it.',
  },
  hit_rate: {
    label: 'Hit Rate',
    plainEnglish: 'Percent of trades that finished as winners.',
    howToUse: 'A high hit rate does not guarantee profit if losers are much larger than winners.',
  },
  drift_score: {
    label: 'Drift Score',
    plainEnglish: 'How much recent behavior diverges from earlier validation behavior.',
    howToUse: 'Higher drift means monitor more closely and consider retraining.',
  },
  gross_exposure: {
    label: 'Gross Exposure',
    plainEnglish: 'Total size of long plus short positions relative to equity.',
    howToUse: 'Higher gross means more market risk and faster P&L swings.',
  },
  net_exposure: {
    label: 'Net Exposure',
    plainEnglish: 'Directional tilt: long exposure minus short exposure.',
    howToUse: 'Large net long can suffer in broad selloffs; large net short can suffer in rallies.',
  },
  cvar95: {
    label: 'CVaR 95',
    plainEnglish: 'Average loss expected in the worst 5% historical-like outcomes.',
    howToUse: 'Use as a stress signal for worst-case planning, not as a guaranteed cap.',
  },
  walk_forward: {
    label: 'Walk-Forward',
    plainEnglish: 'Repeatedly train on earlier data and test on the next unseen period.',
    howToUse: 'Prefer strategies that stay stable across many windows, not just one lucky stretch.',
  },
  reason_codes: {
    label: 'Reason Codes',
    plainEnglish: 'Short tags that explain why the signal was generated.',
    howToUse: 'Use them to confirm the setup matches your thesis before taking action.',
  },
  risk_flags: {
    label: 'Risk Flags',
    plainEnglish: 'Warnings that important guardrails may be breached.',
    howToUse: 'If flags are present, reduce size or wait for cleaner conditions.',
  },
};

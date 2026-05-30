'use client';

/**
 * Wheel Options Scanner
 *
 * Re-export of OptionsChainScanner with a more descriptive name
 * for use in the Strategies page. This scanner helps find optimal
 * options contracts for wheel strategy (covered calls and cash-secured puts).
 */

// Re-export with new name for semantic clarity in Strategies context
export { OptionsChainScanner as WheelOptionsScanner } from './options-chain-scanner';
export { default } from './options-chain-scanner';

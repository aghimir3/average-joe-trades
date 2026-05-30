'use client';

/**
 * Confidence Ring Component
 *
 * Animated SVG ring that fills based on confidence level.
 * Uses CSS animations for smooth fill effect.
 */

import { cn } from '@/lib/utils';
import type { ConfidenceLevel } from './lib/types';

interface ConfidenceRingProps {
  confidence: ConfidenceLevel;
  percentage?: number; // Optional: override with exact percentage
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const SIZE_CONFIG = {
  sm: { width: 40, stroke: 4, textSize: 'text-[10px]' },
  md: { width: 56, stroke: 5, textSize: 'text-xs' },
  lg: { width: 80, stroke: 6, textSize: 'text-sm' },
};

const CONFIDENCE_CONFIG = {
  high: {
    percentage: 85,
    color: 'stroke-emerald-500',
    bgColor: 'stroke-emerald-500/20',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    label: 'HIGH',
  },
  medium: {
    percentage: 65,
    color: 'stroke-amber-500',
    bgColor: 'stroke-amber-500/20',
    textColor: 'text-amber-600 dark:text-amber-400',
    label: 'MED',
  },
  low: {
    percentage: 35,
    color: 'stroke-red-500',
    bgColor: 'stroke-red-500/20',
    textColor: 'text-red-600 dark:text-red-400',
    label: 'LOW',
  },
};

export function ConfidenceRing({
  confidence,
  percentage,
  size = 'md',
  showLabel = true,
  className,
}: ConfidenceRingProps) {
  const sizeConfig = SIZE_CONFIG[size];
  const config = CONFIDENCE_CONFIG[confidence];
  const fillPercentage = percentage ?? config.percentage;

  const radius = (sizeConfig.width - sizeConfig.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (fillPercentage / 100) * circumference;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={sizeConfig.width}
        height={sizeConfig.width}
        className="transform -rotate-90"
      >
        {/* Background ring */}
        <circle
          cx={sizeConfig.width / 2}
          cy={sizeConfig.width / 2}
          r={radius}
          fill="none"
          strokeWidth={sizeConfig.stroke}
          className={config.bgColor}
        />
        {/* Animated fill ring */}
        <circle
          cx={sizeConfig.width / 2}
          cy={sizeConfig.width / 2}
          r={radius}
          fill="none"
          strokeWidth={sizeConfig.stroke}
          strokeLinecap="round"
          className={cn(config.color, 'transition-all duration-700 ease-out')}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset,
          }}
        />
      </svg>
      {showLabel && (
        <span
          className={cn(
            'absolute font-bold',
            sizeConfig.textSize,
            config.textColor
          )}
        >
          {config.label}
        </span>
      )}
    </div>
  );
}

/**
 * Linear confidence bar (alternative display)
 */
interface ConfidenceBarProps {
  confidence: number; // 0-100
  showPercentage?: boolean;
  className?: string;
}

export function ConfidenceBar({
  confidence,
  showPercentage = true,
  className,
}: ConfidenceBarProps) {
  const getColor = () => {
    if (confidence >= 85) return 'bg-emerald-500';
    if (confidence >= 60) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const getBgColor = () => {
    if (confidence >= 85) return 'bg-emerald-500/20';
    if (confidence >= 60) return 'bg-amber-500/20';
    return 'bg-red-500/20';
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex-1 h-2 rounded-full', getBgColor())}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', getColor())}
          style={{ width: `${Math.min(100, Math.max(0, confidence))}%` }}
        />
      </div>
      {showPercentage && (
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 w-10 text-right">
          {confidence.toFixed(0)}%
        </span>
      )}
    </div>
  );
}

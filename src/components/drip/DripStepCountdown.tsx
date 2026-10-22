import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle2, Zap, Hourglass } from 'lucide-react';

interface DripStepCountdownProps {
  nextExecutionAt?: string | null;
  delayValue?: number;
  delayUnit?: string;
  sentCount?: number;
  waitingCount?: number;
  isComplete?: boolean;
  compact?: boolean;
}

export const DripStepCountdown: React.FC<DripStepCountdownProps> = ({
  nextExecutionAt,
  delayValue = 0,
  delayUnit = 'minutes',
  sentCount = 0,
  waitingCount = 0,
  isComplete = false,
  compact = false,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!nextExecutionAt) {
      setSecondsRemaining(null);
      return;
    }

    const calculateRemaining = () => {
      const targetTime = new Date(nextExecutionAt).getTime();
      const now = Date.now();
      const diffSec = Math.floor((targetTime - now) / 1000);
      setSecondsRemaining(diffSec);
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);
    return () => clearInterval(interval);
  }, [nextExecutionAt]);

  const formatCountdown = (totalSec: number) => {
    if (totalSec <= 0) return '00:00';
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    const pad = (n: number) => String(n).padStart(2, '0');

    if (hrs > 0) {
      return `${hrs}h ${pad(mins)}m ${pad(secs)}s`;
    }
    return `${pad(mins)}m ${pad(secs)}s`;
  };

  // State 1: Step has an active countdown timer running right now
  if (secondsRemaining !== null) {
    if (secondsRemaining > 0) {
      return (
        <div
          className={`flex items-center space-x-1 font-mono font-bold px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 ${
            compact ? 'text-[9.5px]' : 'text-[10px]'
          } shadow-2xs animate-pulse`}
          title={`Countdown to next auto-dispatch: ${formatCountdown(secondsRemaining)}`}
        >
          <Hourglass className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>⏳ {formatCountdown(secondsRemaining)} left</span>
        </div>
      );
    } else {
      // Due right now or currently dispatching
      return (
        <div
          className={`flex items-center space-x-1 font-mono font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 ${
            compact ? 'text-[9.5px]' : 'text-[10px]'
          } shadow-2xs`}
        >
          <Zap className="w-3 h-3 text-emerald-600 dark:text-emerald-400 animate-bounce shrink-0" />
          <span>⚡ Dispatching now...</span>
        </div>
      );
    }
  }

  // State 2: All messages sent and completed for this step
  if (isComplete || (sentCount > 0 && waitingCount === 0)) {
    return (
      <div
        className={`flex items-center space-x-1 font-medium px-1.5 py-0.5 rounded-md bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400 ${
          compact ? 'text-[9.5px]' : 'text-[10px]'
        }`}
      >
        <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
        <span>✓ {sentCount > 0 ? `${sentCount} sent` : 'Complete'}</span>
      </div>
    );
  }

  // State 3: Static delay information (waiting for subscribers to reach this step)
  return (
    <div
      className={`flex items-center space-x-1 font-mono text-neutral-500 dark:text-neutral-400 ${
        compact ? 'text-[9.5px]' : 'text-[10px]'
      }`}
    >
      <Clock className="w-2.5 h-2.5 shrink-0 text-neutral-400" />
      <span>
        {delayValue === 0 ? 'Instant' : `+${delayValue} ${delayUnit} wait`}
      </span>
    </div>
  );
};

/**
 * React binding for the TransientRunner. Subscribes to the throttled summary
 * so the control panel shows live surge stats, and exposes start/stop bound to
 * the current Water Hammer Lab inputs in the store.
 */

import { useEffect, useState, useCallback } from 'react';
import { transientRunner, TransientSummary } from './runner';
import { buildWaterHammerConfig } from '../examples/waterHammerLab';
import { useAppStore } from '../ui/store';

export function useTransient() {
  const [summary, setSummary] = useState<TransientSummary | null>(null);
  const labInputs = useAppStore((s) => s.labInputs);
  const closureTime = useAppStore((s) => s.closureTime);
  const stepsPerFrame = useAppStore((s) => s.stepsPerFrame);
  const periods = useAppStore((s) => s.periods);

  useEffect(() => transientRunner.onSummary(setSummary), []);

  const start = useCallback(() => {
    const config = buildWaterHammerConfig(labInputs);
    transientRunner.start(config, closureTime, stepsPerFrame, periods);
  }, [labInputs, closureTime, stepsPerFrame, periods]);

  const stop = useCallback(() => transientRunner.stop(), []);

  return { summary, start, stop };
}

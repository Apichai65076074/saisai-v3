import type { Mode, Run } from '../../api/admin/load/model';
import { runKind } from './kind';

export const scaleNames = ['scale-base', 'scale-x2', 'scale-x4'] as const;
export type ScaleName = typeof scaleNames[number];

// Accept the original T22 labels without relabelling or copying measured results.
export function scaleName(label: string): ScaleName | undefined {
  return scaleNames.find(name => label === name || label.startsWith(`${name}-`) || label.startsWith(`gpu-mix-${name}-`));
}

export function scaleRuns(runs: Run[], mode: Mode = 'mix'): Partial<Record<ScaleName, Run>> {
  const result: Partial<Record<ScaleName, Run>> = {};
  for (const run of [...runs].sort((a, b) => b.id - a.id)) {
    const name = scaleName(run.label) ?? (run.label.startsWith(`gpu-${mode}-nocache`) ? 'scale-base' : undefined);
    if (name && !result[name] && run.config.environment === 'ai' && runKind(run).primary &&
        run.config.repeats === 0 && run.config.think_sec === 30 && run.config.stage_sec === 120 && run.stages.some(s => s.mode === mode)) result[name] = run;
  }
  return result;
}

export function strictMixCapacity(run: Run, mode: Mode = 'mix'): number {
  let n = 0;
  for (const stage of run.stages.filter(s => s.mode === mode).sort((a, b) => a.users - b.users)) {
    if (stage.n < 1 || stage.p95_ms > 12000 || stage.error_rate >= 0.01 || !stage.pass) break;
    n = stage.users;
  }
  return n;
}

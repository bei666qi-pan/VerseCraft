import { detectStateNarrativeContradictions } from './src/lib/evals/playthrough/invariants';
import fs from 'node:fs';

const trace = JSON.parse(fs.readFileSync('.runtime-data/live-full-smoke-live/traces/happy-speedrun-speedrunner-0.json', 'utf8'));
const steps = [
  { stepIndex: -1, narrative: '', stateAfter: trace.initialState, dmJson: {} },
  ...trace.steps.map((s: any) => ({
    stepIndex: s.stepIndex,
    narrative: s.narrative,
    stateAfter: s.stateSnapshot,
    dmJson: s.dmJson,
  })),
];

console.log(detectStateNarrativeContradictions(steps));

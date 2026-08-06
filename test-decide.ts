import { createCodexFileHandoff } from './e2e/support/codexFileHandoff';
import { readFile } from 'node:fs/promises';

(async () => {
  const runId = 'codex-browser-1784530213954';
  const artifactDir = '/Users/qi/Desktop/项目/VerseCraft/.runtime-data/browser-playthrough';
  const handoff = createCodexFileHandoff({ runId, artifactDir, timeoutMs: 20000 });
  const req = JSON.parse(await readFile('/Users/qi/Desktop/项目/VerseCraft/.runtime-data/browser-playthrough/codex-browser-1784530213954.codex-handoff/request.json', 'utf8'));
  const observation = {
    turnIndex: req.turnIndex,
    url: 'http://127.0.0.1:666/play',
    narrative: req.observation.narrative,
    options: req.observation.options,
    inputEnabled: req.observation.inputEnabled,
  };
  const start = Date.now();
  const decision = await handoff.decisionProvider.decide(observation);
  console.log('got', decision, 'elapsed', Date.now() - start);
})();

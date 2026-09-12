/**
 * Groq model configuration — self-test.
 *
 * A decommissioned model name is not a normal misconfiguration: it fails every
 * request, at every one of the ~67 `generateAiText` call sites, silently, and
 * only shows up wherever a caller lacks a fallback. `llama-3.3-70b-versatile`
 * sat in the environment that way and surfaced as a stored ATS score of 0/F.
 *
 * DELIBERATELY OFFLINE. This asserts the configuration and the guard in
 * lib/server/ai.ts; it never calls Groq. The repo's self-tests run without
 * network or secrets, and a test that needs a live third-party API would be
 * skipped in exactly the situation it is meant to catch.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  getAiModelName, isRetiredModel, DEFAULT_GROQ_MODEL, RETIRED_GROQ_MODELS,
} from '@/lib/server/ai';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Restored after each case so the suite cannot leak state into the next one. */
const ORIGINAL = process.env.GROQ_MODEL;
function withModel<T>(value: string | undefined, run: () => T): T {
  if (value === undefined) delete process.env.GROQ_MODEL;
  else process.env.GROQ_MODEL = value;
  try { return run(); } finally {
    if (ORIGINAL === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = ORIGINAL;
  }
}

function main() {
  console.log('\n── 1. The default is a live model ──');

  check('the default is not itself retired', !isRetiredModel(DEFAULT_GROQ_MODEL), DEFAULT_GROQ_MODEL);
  check('the default is set to openai/gpt-oss-120b', DEFAULT_GROQ_MODEL === 'openai/gpt-oss-120b', DEFAULT_GROQ_MODEL);
  check('the retired list names the model that caused the outage',
    RETIRED_GROQ_MODELS.includes('llama-3.3-70b-versatile'));

  console.log('\n── 2. A retired GROQ_MODEL is repaired, never obeyed ──');

  for (const retired of RETIRED_GROQ_MODELS) {
    check(`"${retired}" is never returned to a caller`,
      withModel(retired, getAiModelName) === DEFAULT_GROQ_MODEL);
  }
  check('the check is case-insensitive',
    withModel('LLaMA-3.3-70B-Versatile', getAiModelName) === DEFAULT_GROQ_MODEL);
  check('surrounding whitespace does not defeat the check',
    withModel('  llama-3.3-70b-versatile  ', getAiModelName) === DEFAULT_GROQ_MODEL);

  console.log('\n── 3. A valid override is still honoured ──');

  check('an explicit live model wins', withModel('openai/gpt-oss-20b', getAiModelName) === 'openai/gpt-oss-20b');
  check('an unset variable falls back to the default', withModel(undefined, getAiModelName) === DEFAULT_GROQ_MODEL);
  check('an empty variable falls back to the default', withModel('', getAiModelName) === DEFAULT_GROQ_MODEL);
  check('a whitespace-only variable falls back to the default', withModel('   ', getAiModelName) === DEFAULT_GROQ_MODEL);

  console.log('\n── 4. This repository\'s own configuration is live ──');

  const configured = process.env.GROQ_MODEL?.trim();
  check('the currently configured GROQ_MODEL is not retired',
    !configured || !isRetiredModel(configured), configured ?? '(unset)');

  let envFile = '';
  try { envFile = readFileSync(path.join(process.cwd(), '.env'), 'utf8'); } catch { /* absent in CI */ }
  if (envFile) {
    const line = envFile.split('\n').find((l) => l.trim().startsWith('GROQ_MODEL='));
    const value = line?.split('=').slice(1).join('=').trim();
    check('.env does not pin a retired model', !value || !isRetiredModel(value), value ?? '(unset)');
  } else {
    console.log('  – .env not present, skipping its check');
  }

  console.log('\n── 5. Model selection stays centralized ──');

  const AI = readFileSync(path.join(process.cwd(), 'lib/server/ai.ts'), 'utf8');
  check('generateAiText sends getAiModelName()', /model:\s*getAiModelName\(\)/.test(AI));
  check('the model name is read at call time, not captured at module load',
    /export function getAiModelName\(\)[\s\S]{0,200}process\.env\.GROQ_MODEL/.test(AI));
  check('the retired-model warning is emitted once, not per request', AI.includes('retiredModelWarned'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();

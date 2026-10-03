/**
 * README samples: every ```typescript block in README.md must typecheck
 * against src in strict mode, so the docs can't drift from the API.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(import.meta.dir, '..');
const outDir = path.join(root, 'tests', '.readme');

// Values the README's prose leaves to the reader: the message passed to an
// update loop, a key message, some content, and the textarea from the
// sample just above the selection sample. Each is declared only in samples
// that use it without defining it.
const placeholders: Record<string, string> = {
  msg: 'Msg',
  keyMsg: 'KeyPressMsg',
  longString: 'string',
  ta: 'TextareaModel',
  x: 'number',
  y: 'number',
};
const prelude = [
  "import type { Msg as __Msg, KeyPressMsg as __KeyPressMsg } from '@oakoliver/bubbletea';",
  "import type { TextareaModel as __TextareaModel } from '../../src/index.js';",
].join('\n');

function declarations(code: string): string {
  return Object.entries(placeholders)
    .filter(([name]) => new RegExp(`\\b${name}\\b`).test(code))
    .filter(([name]) => !new RegExp(`\\b(const|let|var|class|function)\\s+${name}\\b|\\(${name}\\s*:`).test(code))
    .map(([name, type]) => `declare const ${name}: ${['Msg', 'KeyPressMsg', 'TextareaModel'].includes(type) ? `__${type}` : type};`)
    .join('\n');
}

const blocks = [...fs.readFileSync(path.join(root, 'README.md'), 'utf8').matchAll(/```typescript\n([\s\S]*?)```/g)]
  .map((m) => m[1].replaceAll("from '@oakoliver/bubbles'", "from '../../src/index.js'"));
const files = blocks.map((_, i) => path.join(outDir, `sample-${i + 1}.ts`));

beforeAll(() => {
  fs.mkdirSync(outDir, { recursive: true });
  // `export {}` makes each sample a module, so names don't clash across files.
  blocks.forEach((code, i) => fs.writeFileSync(files[i], `${prelude}\n${declarations(code)}\n${code}\nexport {};\n`));
});

afterAll(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
});

describe('README samples', () => {
  test('there are samples to check', () => {
    expect(blocks.length).toBeGreaterThan(10);
  });

  test('typecheck under strict mode', () => {
    const tsc = Bun.spawnSync(
      [
        path.join(root, 'node_modules', '.bin', 'tsc'),
        '--noEmit', '--strict', '--skipLibCheck',
        '--target', 'ESNext', '--module', 'ESNext', '--moduleResolution', 'bundler',
        '--types', 'node',
        ...files,
      ],
      { cwd: root },
    );
    expect(tsc.stdout.toString() + tsc.stderr.toString()).toBe('');
    expect(tsc.exitCode).toBe(0);
  }, 60_000);
});

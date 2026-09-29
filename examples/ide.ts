/**
 * IDE — a two-pane terminal "IDE" built from bubbles components: the tree as a
 * file explorer and the textarea as an editor with keyboard text selection.
 *
 * Usage:
 *   bun examples/ide.ts [PATH]
 *
 *   PATH  directory to browse. Defaults to examples/pomo, a small fictional
 *         Python project bundled with these examples.
 *
 * Explorer keys: ↑/↓ move · ←/→ collapse/expand · enter open file or toggle
 *                folder · tab switch to the editor · q quit
 * Editor keys:   shift+arrows select · ctrl+shift+←/→ select by word ·
 *                ctrl+g select all · alt+←/→ (or ctrl+←/→) jump by word ·
 *                tab back to the explorer · ctrl+c quit
 *
 * The editor is a real textarea: typing edits the buffer (nothing is saved).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NewProgram, View, Quit, WindowSizeMsg } from '@oakoliver/bubbletea';
import type { Cmd, Msg } from '@oakoliver/bubbletea';
import {
  newStyle, roundedBorder, joinHorizontal, joinVertical, Top, Left, stringWidth, blend1D, colorToRGB, fgColor,
} from '@oakoliver/lipgloss';
import {
  newTree, treeRoot, treeDefaultDarkStyles, treeRoundedEnumerator, TreeNode,
  newTextarea, textareaDefaultDarkStyles, newHelp, newBinding, withKeys, withHelp,
} from '../src/index.ts';

const EXAMPLES_DIR = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(process.argv[2] ?? join(EXAMPLES_DIR, 'pomo'));
try {
  if (!statSync(ROOT).isDirectory()) throw new Error();
} catch {
  console.error(`ide: ${ROOT} is not a directory`);
  process.exit(1);
}
const BUBBLES_VERSION: string = JSON.parse(readFileSync(join(EXAMPLES_DIR, '..', 'package.json'), 'utf8')).version;
// The status bar shows the branch only when PATH is the top of a git checkout
// (not, say, the bundled sample, which lives inside this repository).
const gitOut = (...a: string[]) => spawnSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).stdout?.trim() ?? '';
const BRANCH = gitOut('rev-parse', '--show-toplevel') === ROOT ? gitOut('branch', '--show-current') : '';

const C = {
  violet: '#7D56F4', pink: '#EE6FF8', cyan: '#3EE6D2', green: '#04D98B', amber: '#FFB454',
  red: '#FF5F87', blue: '#5A8DEE', dim: '#5C5C74', text: '#D6D6E7', faint: '#34344A', bg2: '#24243A',
};
const st = () => newStyle();

// ── file tree ──────────────────────────────────────────────────────────────
const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', 'target', '__pycache__', 'venv']);
const MAX_ENTRIES = 5000; // keeps the tree responsive when pointed at a large directory
const paths = new Map<unknown, string>();
let entries = 0;

/** The file opened at start: the root README if there is one. */
const initialFile = readdirSync(ROOT).find((e) => /^readme(\.md)?$/i.test(e));

function build(dir: string, name: string, depth: number): TreeNode {
  const node = treeRoot(name);
  paths.set(node, dir);
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((e) => !SKIP.has(e) && !e.startsWith('.'));
  } catch { /* unreadable directory: show it empty */ }
  const isDir = (e: string) => { try { return statSync(join(dir, e)).isDirectory(); } catch { return false; } };
  const dirs = names.filter(isDir).sort();
  const files = names.filter((e) => !isDir(e)).sort();
  for (const d of dirs) {
    if (entries++ > MAX_ENTRIES || depth > 8) break;
    node.child(build(join(dir, d), d, depth + 1));
  }
  const leaves = files.slice(0, Math.max(0, MAX_ENTRIES - entries));
  entries += leaves.length;
  if (leaves.length) node.child(...leaves);
  // leaves are created by child(); record their paths
  for (const c of node.childNodes()) if (!paths.has(c)) paths.set(c, join(dir, String(c.givenValue())));
  if (depth > 0) node.close(); // only the root starts expanded
  return node;
}
const root = build(ROOT, basename(ROOT), 0);

const EXT_COLOR: Record<string, string> = {
  '.ts': C.blue, '.tsx': C.blue, '.js': C.blue, '.py': C.blue, '.go': C.blue, '.rs': C.blue,
  '.json': C.amber, '.toml': C.amber, '.yaml': C.amber, '.yml': C.amber, '.md': C.cyan,
};
const colorFor = (name: string): string =>
  /(^test_|[._]test\.|_test\.|\.spec\.)/.test(name) ? C.green : EXT_COLOR[extname(name)] ?? C.text;

const LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.py': 'Python', '.go': 'Go', '.rs': 'Rust',
  '.json': 'JSON', '.toml': 'TOML', '.yaml': 'YAML', '.yml': 'YAML', '.md': 'Markdown',
};

const tree = newTree(root, 36, 20);
tree.setStyles({
  ...treeDefaultDarkStyles(),
  rootNodeStyle: st().bold(true).foreground(C.pink),
  parentNodeStyle: st().bold(true).foreground(C.violet),
  nodeStyle: st().foreground(C.text),
  nodeStyleFunc: (nodes, i) => st().foreground(colorFor(String(nodes.at(i).givenValue()))),
  selectedNodeStyle: st().bold(true).foreground('#FFFFFF').background('#4B2FA8'),
  cursorStyle: st().bold(true).foreground(C.pink).paddingRight(1),
  enumeratorStyle: st().foreground('#4A4A66'),
  selectedEnumeratorStyle: st().foreground(C.pink),
  indenterStyle: st().foreground('#4A4A66'),
  openIndicatorStyle: st().foreground(C.dim),
});
tree.enumerator(treeRoundedEnumerator);
tree.setOpenCharacter('▾');
tree.setClosedCharacter('▸');
tree.setCursorCharacter('▍');
tree.setShowHelp(false);
tree.setScrollOff(3);
// The characters above only take effect on the next render of the tree's
// viewport; re-setting the nodes renders it once with them.
tree.setNodes(root);

// ── editor ─────────────────────────────────────────────────────────────────
const ta = newTextarea();
const tst = textareaDefaultDarkStyles();
const edFocused = {
  ...tst.focused,
  base: st(),
  text: st().foreground(C.text),
  lineNumber: st().foreground('#46465E'),
  cursorLineNumber: st().foreground(C.pink).bold(true),
  cursorLine: st().background(C.bg2),
  prompt: st().foreground(C.faint),
  selection: st().background('#5B3FC4').foreground('#FFFFFF'),
  endOfBuffer: st().foreground(C.faint),
};
ta.setStyles({
  focused: edFocused,
  blurred: { ...edFocused, cursorLine: st(), cursorLineNumber: st().foreground('#46465E'), text: st().foreground('#9A9AB0') },
  cursor: { ...tst.cursor, color: C.pink, blink: false },
});
ta.prompt = ' ';
ta.showLineNumbers = true;
ta.charLimit = 0;
// Performance: maxHeight sets both the line-number gutter width (its digit
// count) and the capacity of the textarea's soft-wrap cache, as upstream does.
// With the default (99) a file longer than 99 lines evicts on every render; a
// large value keeps whole files cached.
ta.maxHeight = 5000;

// Performance: textarea.view() re-renders the whole buffer on every call, which
// costs roughly 50µs per line. The editor pane is therefore rendered once and
// cached, and the cache is cleared only when the textarea itself changes (a key
// or message routed to it, focus changes, a new file, or a resize), so moving
// around the explorer doesn't pay for re-rendering the editor.
let edCache = '';
const edView = () => (edCache ||= ta.view());

let openFile = '';
function load(path: string): void {
  openFile = path;
  edCache = '';
  let text: string;
  try {
    const buf = readFileSync(path);
    text = buf.includes(0) ? '(binary file)' : buf.toString('utf8');
  } catch (e) {
    text = `(cannot read: ${(e as Error).message})`;
  }
  ta.setValue(text.replace(/\t/g, '  '));
  ta.moveToBegin();
}
if (initialFile) load(join(ROOT, initialFile));

let focus: 'tree' | 'editor' = 'tree';
ta.blur();

// ── chrome ─────────────────────────────────────────────────────────────────
function gradientText(s: string, ...stops: string[]): string {
  const chars = [...s];
  const cols = blend1D(Math.max(2, chars.length), ...stops);
  return chars.map((ch, i) => {
    const c = colorToRGB(cols[i]!)!;
    return ch === ' ' ? ' ' : fgColor(c.r, c.g, c.b) + '\x1b[1m' + ch + '\x1b[0m';
  }).join('');
}
const padRight = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - stringWidth(s)));

/** A rounded panel with the title set into the top border. */
function panel(title: string, body: string, w: number, h: number, active: boolean, right = ''): string {
  const color = active ? C.pink : C.faint;
  const raw = body.split('\n');
  while (raw.length < h - 2) raw.push('');
  const lines = raw.slice(0, h - 2).map((l) => padRight(l, w - 4));
  const b = st().foreground(color);
  const t = ' ' + st().bold(true).foreground(active ? C.pink : C.dim).render(title) + ' ';
  const r = right ? ' ' + right + ' ' : '';
  const fill = w - 3 - stringWidth(t) - stringWidth(r) - 1;
  const top = b.render('╭─') + t + b.render('─'.repeat(Math.max(0, fill))) + r + b.render('─╮');
  return top + '\n' + st().border(roundedBorder()).borderTop(false).borderForeground(color).padding(0, 1).render(lines.join('\n'));
}

const help = newHelp();
const k = (keys: string[], key: string, desc: string) => newBinding(withKeys(...keys), withHelp(key, desc));
const treeHelp = [k(['up'], '↑/↓', 'move'), k(['left'], '←/→', 'collapse/expand'), k(['enter'], 'enter', 'open file'),
  k(['tab'], 'tab', 'editor'), k(['q'], 'q', 'quit')];
const edHelp = [k(['shift+up'], 'shift+↑↓←→', 'select'), k(['ctrl+shift+right'], 'ctrl+shift+←→', 'select word'),
  k(['ctrl+g'], 'ctrl+g', 'select all'), k(['alt+right'], 'alt+←→', 'word jump'), k(['tab'], 'tab', 'explorer')];

// ── model ──────────────────────────────────────────────────────────────────
class App {
  width = 132;
  height = 35;
  treeW = 40;

  constructor() { this.layout(); }

  get bodyH(): number { return Math.max(8, this.height - 3); } // title, status and help lines
  get edW(): number { return this.width - this.treeW - 1; }

  layout(): void {
    this.treeW = Math.max(28, Math.min(48, Math.round(this.width * 0.3)));
    tree.setSize(this.treeW - 4, this.bodyH - 2);
    ta.setWidth(this.edW - 4);
    ta.setHeight(this.bodyH - 2);
    help.setWidth(this.width - 2);
    edCache = '';
  }

  init(): Cmd { return null; }

  update(msg: Msg): [App, Cmd] {
    if (msg instanceof WindowSizeMsg) {
      this.width = msg.width;
      this.height = msg.height;
      this.layout();
      return [this, null];
    }
    if (msg?._tag === 'KeyPressMsg') {
      const key = msg.toString();
      if (key === 'ctrl+c' || (key === 'q' && focus === 'tree')) return [this, Quit];
      if (key === 'tab') {
        focus = focus === 'tree' ? 'editor' : 'tree';
        edCache = '';
        if (focus === 'editor') return [this, ta.focus()];
        ta.blur();
        return [this, null];
      }
      if (focus === 'tree') {
        const cur = tree.nodeAtCurrentOffset();
        const path = cur ? paths.get(cur) : undefined;
        if (key === 'enter' && path && !statSync(path).isDirectory()) {
          load(path);
          return [this, null];
        }
        tree.update(msg);
        return [this, null];
      }
    }
    if (focus !== 'editor') return [this, null];
    edCache = '';
    const [, c] = ta.update(msg);
    return [this, c];
  }

  view(): View {
    const W = this.width;
    const title = gradientText(' ide ', C.violet, C.pink) + st().foreground(C.dim).render('│ ') +
      st().foreground(C.text).render(basename(ROOT)) + st().foreground(C.dim).render('  ·  bubbles ') +
      st().foreground(C.cyan).render('tree') + st().foreground(C.dim).render(' + ') + st().foreground(C.cyan).render('textarea');
    const pill = st().bold(true).foreground('#0B0B14').background(focus === 'tree' ? C.cyan : C.pink).padding(0, 1)
      .render(focus === 'tree' ? 'EXPLORER' : ta.hasSelection() ? 'SELECT' : 'INSERT');
    const top = title + ' '.repeat(Math.max(1, W - stringWidth(title) - stringWidth(pill))) + pill;

    const cur = tree.nodeAtCurrentOffset();
    const left = panel('EXPLORER', tree.view(), this.treeW, this.bodyH, focus === 'tree',
      st().foreground(C.dim).render(`${tree.yOffset() + 1}/${tree.root()!.size()}`));
    const rel = openFile ? relative(ROOT, openFile) : '';
    const right = panel(openFile ? basename(openFile) : 'no file', edView(), this.edW, this.bodyH, focus === 'editor',
      openFile ? st().foreground(C.dim).render(`${rel}  ${ta.lineCount()} lines`) : '');

    // status bar
    const seg = (s: string, fg: string, bg: string) => st().foreground(fg).background(bg).padding(0, 1).render(s);
    let selTxt = '';
    if (ta.hasSelection()) {
      const txt = ta.selectedText();
      const n = txt.split('\n').length;
      selTxt = `${n} line${n === 1 ? '' : 's'}, ${[...txt].length} chars selected`;
    }
    const where = focus === 'tree' ? `selected: ${cur ? String(cur.givenValue()) : ''}`
      : `Ln ${ta.line() + 1}, Col ${ta.lineInfo().charOffset + 1}`;
    const lhs = (BRANCH ? seg(' ' + BRANCH, '#FFFFFF', '#4B2FA8') : '') + seg(where, C.text, '#2A2A40') +
      (selTxt ? seg(selTxt, '#0B0B14', C.pink) : '');
    const lang = LANGUAGE[extname(openFile)] ?? 'Plain Text';
    const rhs = seg(lang, C.text, '#2A2A40') + seg('UTF-8', C.text, '#2A2A40') + seg(`bubbles ${BUBBLES_VERSION}`, '#0B0B14', C.cyan);
    const status = lhs + st().background('#1F1F30').render(' '.repeat(Math.max(0, W - stringWidth(lhs) - stringWidth(rhs)))) + rhs;

    const helpLine = ' ' + help.shortHelpView(focus === 'tree' ? treeHelp : edHelp);
    const v = new View(joinVertical(Left, top, joinHorizontal(Top, left, ' ', right), status, helpLine));
    v.altScreen = true;
    return v;
  }
}

await NewProgram(new App()).run();

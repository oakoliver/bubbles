/**
 * Tests for the tree component — ported from charmbracelet/bubbles v2.2.1
 * tree/tree_test.go (golden files copied verbatim from upstream testdata),
 * plus behavioural coverage of navigation, toggling and styling.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KeyCode, KeyMod, KeyPressMsg } from '@oakoliver/bubbletea';
import { newStyle, stripAnsi } from '@oakoliver/lipgloss';
import { newBinding, withHelp, withKeys } from '../src/key/key.js';
import { Model, defaultKeyMap, newTree } from '../src/tree/tree.js';
import { Node, newNode, root } from '../src/tree/node.js';
import { defaultStyles } from '../src/tree/styles.js';
import {
  defaultEnumerator,
  defaultIndenter,
  roundedEnumerator,
  treeRoot,
} from '../src/internal/ltree.js';

const golden = (name: string) => readFileSync(join(import.meta.dir, 'testdata', 'tree', name), 'utf8');

function charmTree(): Node {
  return root('~/charm').child(
    'ayman',
    root('bash').child(root('tools').child('zsh', 'doom-emacs')),
    root('carlos').child(root('emotes').child('chefkiss.png', 'kekw.png')),
    'maas',
  );
}

function press(m: Model, code: number, text: string = '', mod: number = KeyMod.None): Model {
  [m] = m.update(new KeyPressMsg({ code, text, mod }));
  return m;
}

const rune = (m: Model, ch: string) => press(m, ch.codePointAt(0)!, ch);

function cursorLine(m: Model): number {
  const lines = stripAnsi((m as any)._viewport.view()).split('\n');
  return lines.findIndex((l: string) => l.includes('→'));
}

// ── Upstream tests ──────────────────────────────────────────────────────────

describe('tree (upstream tree_test.go)', () => {
  test('default tree golden', () => {
    const m = newTree(charmTree(), 70, 13);
    expect(stripAnsi(m.view())).toBe(golden('default_tree.golden'));
  });

  test('multi-line nodes keep the cursor on the selected node', () => {
    const m = newTree(root('~/charm').child(
      'ayman',
      'two\nlines',
      root('bash').child('zsh', 'doom\nemacs'),
      'maas',
    ), 70, 20);

    const steps = m.root()!.size() - 1;
    expect(steps).toBe(6);
    for (let i = 0; i < steps; i++) {
      m.down();
      const node = m.nodeAtCurrentOffset();
      expect(node).not.toBeNull();
      const want = node!.lineOffset() - m.viewportYOffset();
      expect(cursorLine(m)).toBe(want);
    }
    // "maas" sits below two 2-line nodes: root(1) + ayman(1) + two/lines(2)
    // + bash(1) + zsh(1) + doom/emacs(2) = line offset 8.
    expect(m.nodeAtCurrentOffset()!.givenValue()).toBe('maas');
    expect(m.nodeAtCurrentOffset()!.lineOffset()).toBe(8);
    expect(m.nodeAtCurrentOffset()!.yOffset()).toBe(6);
  });

  test('additional short help golden', () => {
    const m = newTree(charmTree(), 70, 13);
    m.setAdditionalShortHelpKeys(() => [newBinding(withKeys('v'), withHelp('v', 'select'))]);
    expect(stripAnsi(m.view())).toBe(golden('additional_help.golden'));
  });
});

// ── Behaviour ───────────────────────────────────────────────────────────────

describe('tree navigation', () => {
  test('down/up move the selection and clamp at the ends', () => {
    let m = newTree(charmTree(), 70, 13);
    expect(m.yOffset()).toBe(0);
    m = rune(m, 'j');
    expect(m.nodeAtCurrentOffset()!.givenValue()).toBe('ayman');
    m = press(m, KeyCode.Down);
    expect(m.nodeAtCurrentOffset()!.givenValue()).toBe('bash');
    m = rune(m, 'k');
    m = press(m, KeyCode.Up);
    m = press(m, KeyCode.Up);
    expect(m.yOffset()).toBe(0);
    m = rune(m, 'G');
    expect(m.yOffset()).toBe(10);
    expect(m.nodeAtCurrentOffset()!.givenValue()).toBe('maas');
    m = press(m, KeyCode.Down);
    expect(m.yOffset()).toBe(10);
    m = rune(m, 'g');
    expect(m.yOffset()).toBe(0);
  });

  test('page and half-page movements use the viewport height', () => {
    const m = newTree(charmTree(), 70, 13); // viewport height 11
    m.halfPageDown();
    expect(m.yOffset()).toBe(5);
    m.halfPageUp();
    expect(m.yOffset()).toBe(0);
    m.pageDown();
    expect(m.yOffset()).toBe(10);
    m.pageUp();
    expect(m.yOffset()).toBe(0);
  });

  test('cursor renders next to the selected node', () => {
    const m = newTree(charmTree(), 70, 13);
    m.setYOffset(3);
    const lines = stripAnsi(m.view()).split('\n');
    expect(lines[3].startsWith('→ ')).toBe(true);
    expect(lines[3]).toContain('tools');
    expect(lines[0].startsWith('  ')).toBe(true);
    expect(m.node(3)!.isSelected()).toBe(true);
    expect(m.node(0)!.isSelected()).toBe(false);
  });

  test('scroll-off keeps context visible below the selection', () => {
    const items = Array.from({ length: 30 }, (_, i) => `item-${i}`);
    const m = newTree(root('root').child(...items), 30, 12); // viewport 10 rows
    m.setScrollOff(2);
    for (let i = 0; i < 12; i++) m.down();
    const node = m.nodeAtCurrentOffset()!;
    expect(node.givenValue()).toBe('item-11');
    // Selected line 12 + scroll-off 2 must be the last visible line (9).
    expect(m.viewportYOffset()).toBe(12 + 2 - 10 + 1);
    expect(cursorLine(m)).toBe(12 - m.viewportYOffset());
    m.goToTop();
    expect(m.viewportYOffset()).toBe(0);
  });
});

describe('tree open/close', () => {
  test('enter toggles, left closes, right opens', () => {
    let m = newTree(charmTree(), 70, 13);
    m.setYOffset(2); // bash
    expect(m.nodeAtCurrentOffset()!.givenValue()).toBe('bash');
    expect(m.root()!.size()).toBe(11);

    m = press(m, KeyCode.Enter);
    expect(m.nodeAtCurrentOffset()!.isOpen()).toBe(false);
    expect(m.root()!.size()).toBe(8);
    let view = stripAnsi(m.view());
    expect(view).toContain('▶ bash');
    expect(view).not.toContain('doom-emacs');
    // Offsets of later nodes shift up.
    expect(m.node(3)!.givenValue()).toBe('carlos');

    m = rune(m, 'l');
    expect(m.nodeAtCurrentOffset()!.isOpen()).toBe(true);
    expect(stripAnsi(m.view())).toContain('doom-emacs');

    m = press(m, KeyCode.Left);
    expect(m.nodeAtCurrentOffset()!.isOpen()).toBe(false);
    m = rune(m, 'h');
    expect(m.nodeAtCurrentOffset()!.isOpen()).toBe(false);
    view = stripAnsi(m.view());
    expect(view).toContain('▶ bash');
  });

  test('closing the root collapses the whole tree', () => {
    const m = newTree(charmTree(), 70, 13);
    m.closeCurrentNode();
    expect(m.root()!.size()).toBe(1);
    const lines = stripAnsi(m.view()).split('\n');
    expect(lines[0]).toContain('→ ▶ ~/charm');
    expect(lines[1].trim()).toBe('');
  });

  test('nodes closed before construction stay closed when children are added', () => {
    const n = root('dir').close().child('a', 'b');
    expect(n.isOpen()).toBe(false);
    expect(n.children().length()).toBe(0);
    expect(n.size()).toBe(1);
    n.open();
    expect(n.children().length()).toBe(2);
    expect(n.childNodes().map((c) => c.givenValue())).toEqual(['a', 'b']);
  });

  test('hidden nodes are skipped by the renderer', () => {
    const hidden = root('secret').child('x');
    hidden.setHidden(true);
    const m = newTree(root('r').child('a', hidden, 'b'), 40, 10);
    const view = stripAnsi(m.view());
    expect(view).not.toContain('secret');
    expect(view).toContain('├──a');
    expect(view).toContain('└──b');
    expect(hidden.hidden()).toBe(true);
  });
});

describe('tree help', () => {
  test('? toggles full help', () => {
    let m = newTree(charmTree(), 70, 20);
    expect(m.help.showAll).toBe(false);
    m = rune(m, '?');
    expect(m.help.showAll).toBe(true);
    const view = stripAnsi(m.view());
    expect(view).toContain('page down');
    expect(view).toContain('close help');
    m = rune(m, '?');
    expect(m.help.showAll).toBe(false);
  });

  test('full help includes additional keys', () => {
    const m = newTree(charmTree(), 70, 20);
    const extra = newBinding(withKeys('x'), withHelp('x', 'extra'));
    m.setAdditionalFullHelpKeys(() => [extra]);
    const groups = m.fullHelp();
    expect(groups.length).toBe(5);
    expect(groups[3]).toEqual([extra]);
    expect(groups[4]).toEqual([m.keyMap.closeFullHelp]);
    expect(m.shortHelp()).toEqual([m.keyMap.down, m.keyMap.up, m.keyMap.toggle, m.keyMap.showFullHelp]);
  });

  test('setShowHelp(false) gives the height back to the viewport', () => {
    const m = newTree(charmTree(), 70, 13);
    m.setShowHelp(false);
    const lines = stripAnsi(m.view()).split('\n');
    expect(lines.length).toBe(13);
    expect(stripAnsi(m.view())).not.toContain('more');
  });

  test('default key map matches upstream', () => {
    const km = defaultKeyMap();
    expect(km.down.keys()).toEqual(['down', 'j', 'ctrl+n']);
    expect(km.pageDown.keys()).toEqual(['pgdown', ' ', 'f']);
    expect(km.goToBottom.keys()).toEqual(['G', 'shift+g', 'end']);
    expect(km.toggle.help()).toEqual({ key: '⏎', desc: 'toggle' });
    expect(km.halfPageDown.help()).toEqual({ key: 'd', desc: '½ page down' });
  });
});

describe('tree customisation', () => {
  test('custom characters', () => {
    const m = newTree(charmTree(), 70, 13);
    m.setOpenCharacter('-');
    m.setClosedCharacter('+');
    m.setCursorCharacter('>');
    m.setYOffset(2);
    m.toggleCurrentNode();
    const lines = stripAnsi(m.view()).split('\n');
    expect(lines[0]).toContain('- ~/charm');
    expect(lines[2].startsWith('> ')).toBe(true);
    expect(lines[2]).toContain('+ bash');
  });

  test('rounded enumerator and custom indenter', () => {
    const m = newTree(charmTree(), 70, 13);
    m.enumerator(roundedEnumerator).indenter(() => '→ ');
    m.setCursorCharacter('');
    m.setYOffset(0);
    const view = stripAnsi(m.view());
    expect(view).toContain('╰──maas');
    expect(view).toContain('→ ╰──▼ tools');
  });

  test('setNodes replaces the tree and re-applies enumerator', () => {
    const m = newTree(charmTree(), 40, 10);
    m.enumerator(roundedEnumerator);
    m.setNodes(root('new').child('one', 'two'));
    const view = stripAnsi(m.view());
    expect(view).toContain('▼ new');
    expect(view).toContain('├──one');
    expect(view).toContain('╰──two');
    expect(m.allNodes().map((n) => n.givenValue())).toEqual(['new', 'one', 'two']);
  });

  test('selected node uses the selected style', () => {
    const styles = defaultStyles(true);
    styles.selectedNodeStyle = newStyle().foreground('#ff0000');
    styles.nodeStyle = newStyle().foreground('#00ff00');
    const m = newTree(charmTree(), 70, 13);
    m.setStyles(styles);
    m.setYOffset(1);
    const raw = m.view();
    expect(raw).toContain(newStyle().foreground('#ff0000').render('ayman'));
    expect(raw).toContain(newStyle().foreground('#00ff00').render('maas'));
  });

  test('style funcs take precedence over static styles', () => {
    const styles = defaultStyles(true);
    styles.nodeStyleFunc = (nodes, i) =>
      newStyle().foreground(nodes.at(i).givenValue() === 'maas' ? '#123456' : '#654321');
    const m = newTree(charmTree(), 70, 13);
    m.setStyles(styles);
    const raw = m.view();
    expect(raw).toContain(newStyle().foreground('#123456').render('maas'));
    expect(raw).toContain(newStyle().foreground('#654321').render('ayman'));
  });

  test('non-string values render via their string representation', () => {
    class Named { constructor(private n: string) {} toString() { return `<${this.n}>`; } }
    const m = newTree(root(new Named('top')).child(42, new Named('leaf')), 40, 10);
    const view = stripAnsi(m.view());
    expect(view).toContain('▼ <top>');
    expect(view).toContain('├──42');
    expect(view).toContain('└──<leaf>');
    expect(m.node(1)!.givenValue()).toBe(42);
  });

  test('null root falls back to an empty node', () => {
    const m = newTree(null, 20, 5);
    expect(m.root()).not.toBeNull();
    expect(m.root()!.size()).toBe(1);
    expect(m.allNodes().length).toBe(1);
    m.down();
    expect(m.yOffset()).toBe(0);
  });

  test('setSize updates width, height and viewport', () => {
    const m = newTree(charmTree(), 70, 13);
    m.setWidth(30);
    m.setHeight(8);
    expect(m.width()).toBe(30);
    expect(m.height()).toBe(8);
    m.setYOffset(0);
    const lines = stripAnsi(m.view()).split('\n');
    expect(lines.length).toBe(8);
    // The viewport (6 rows = 8 - 2 help rows) is cut to the new width; the
    // joined block is as wide as the (untruncatable) short help line.
    expect(lines[0].trimEnd()).toBe('→ ▼ ~/charm');
    expect(lines[5].trimEnd()).toBe('  │     └──doom-emacs');
    expect(lines[7]).toBe('↓/j down • ↑/k up • ⏎ toggle • ? more');
    expect(stripAnsi((m as any)._viewport.view()).split('\n').every((l: string) => l.length === 30)).toBe(true);
  });

  test('newNode starts open and empty', () => {
    const n = newNode();
    expect(n.isOpen()).toBe(true);
    expect(n.size()).toBe(1);
    expect(n.children().length()).toBe(0);
  });
});

describe('internal lipgloss tree renderer', () => {
  test('renders nested trees with the default enumerator and indenter', () => {
    const t = treeRoot('.').child('a', treeRoot('b').child('c', 'd'), 'e');
    expect(t.toString()).toBe([
      '.',
      '├── a',
      '├── b',
      '│   ├── c',
      '│   └── d',
      '└── e',
    ].join('\n'));
  });

  test('auto-nests a root-less tree under the previous sibling', () => {
    const t = treeRoot('.').child('foo', treeRoot('').child('bar'));
    expect(t.toString()).toBe(['.', '└── foo', '    └── bar'].join('\n'));
  });

  test('offset hides children', () => {
    const t = treeRoot('.').child('a', 'b', 'c').offset(1, 1);
    expect(t.children().length()).toBe(1);
    expect(t.toString()).toBe(['.', '└── b'].join('\n'));
  });

  test('enumerator helpers', () => {
    const t = treeRoot('.').child('a', 'b');
    const children = t.children();
    expect(defaultEnumerator(children, 0)).toBe('├──');
    expect(defaultEnumerator(children, 1)).toBe('└──');
    expect(roundedEnumerator(children, 1)).toBe('╰──');
    expect(defaultIndenter(children, 0)).toBe('│  ');
    expect(defaultIndenter(children, 1)).toBe('   ');
  });
});

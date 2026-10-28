# @oakoliver/bubbles

Pre-built TUI components for TypeScript. A pure TypeScript port of [charmbracelet/bubbles](https://github.com/charmbracelet/bubbles) with zero dependencies.

Built on top of [@oakoliver/bubbletea](https://www.npmjs.com/package/@oakoliver/bubbletea) (Elm Architecture) and [@oakoliver/lipgloss](https://www.npmjs.com/package/@oakoliver/lipgloss) (terminal styling).

Portable API and behavior parity is tracked against upstream
[`charmbracelet/bubbles` `v2.2.1`](https://github.com/charmbracelet/bubbles/releases/tag/v2.2.1)
(upstream `main` has no behavioral changes since). See [CHANGELOG.md](CHANGELOG.md).
The one platform-specific exclusion is upstream's unexported Windows
`isHidden(path)` implementation in `filepicker/hidden_windows.go`: Node's
portable filesystem API does not expose `FILE_ATTRIBUTE_HIDDEN`, so the file
picker uses the Unix dotfile convention on every platform.

<img alt="The list component from @oakoliver/bubbles: browsing 'My Fave Things', then fuzzy-filtering with / to items matching 'te'" src="https://raw.githubusercontent.com/oakoliver/bubbles/main/assets/list.gif" width="600">

**Read the article:** [Getting Started with Bubbles](https://engineering.oakoliver.com/articles/getting-started-bubbles-typescript-tui-components) · [Porting Bubbles from Go to TypeScript](https://engineering.oakoliver.com/articles/porting-go-bubbles-to-typescript-15-tui-components-zero-dependencies)

## Features

- 16 ready-to-use TUI components
- Zero runtime dependencies (peer dependencies on lipgloss + bubbletea)
- Full Elm Architecture: each component has `update(msg)` and `view()`
- Keybinding system with help text generation
- ESM and CommonJS builds with full TypeScript declarations

## Install

```bash
npm install @oakoliver/bubbles @oakoliver/lipgloss @oakoliver/bubbletea
```

## Components

### Input

| Component | Description |
|-----------|-------------|
| **TextInput** | Single-line text input with cursor, echo modes, suggestions, and completion |
| **TextArea** | Multi-line text editor with word wrapping, line numbers, soft wrap, and keyboard/mouse text selection |

### Display

| Component | Description |
|-----------|-------------|
| **Spinner** | Animated spinner with 12 built-in styles (Line, Dot, MiniDot, Jump, Pulse, Points, Globe, Moon, Monkey, Meter, Hamburger, Ellipsis) |
| **Progress** | Progress bar with spring-physics animation |
| **Table** | Tabular data with headers, row selection, and scrollable viewport |
| **Viewport** | Scrollable content viewer with soft wrapping, gutter functions, and horizontal scroll |

### Navigation

| Component | Description |
|-----------|-------------|
| **List** | Full-featured list browser with fuzzy filtering, pagination, and customizable delegates |
| **Paginator** | Page navigation with Arabic (1/5) or Dots (●○○) display |
| **FilePicker** | File system browser using Node.js `fs` |
| **Tree** | Collapsible tree browser with scroll-off, multi-line nodes, and custom enumerators |

### Utility

| Component | Description |
|-----------|-------------|
| **Help** | Auto-generated help view from keybindings (short and full modes) |
| **Key** | Keybinding system — `Binding` class with `matches()`, `withKeys()`, `withHelp()` |
| **Cursor** | Virtual blinking cursor with focus/blur and multiple blink modes |
| **Timer** | Countdown timer with start/stop/toggle |
| **Stopwatch** | Count-up stopwatch with start/stop/toggle/reset |

## Examples

Runnable programs live in [`examples/`](examples/):

```bash
bun examples/list.ts       # list with fuzzy filtering
bun examples/spinners.ts   # every built-in spinner
bun examples/textinput.ts  # suggestions and a masked field
bun examples/progress.ts   # animated progress bar
bun examples/table.ts      # navigable table
bun examples/ide.ts        # tree file explorer + textarea editor
```

The README recordings are made with [@oakoliver/vhs](https://github.com/oakoliver/vhs) from the tapes in [`assets/tapes/`](assets/tapes/).

## Quick Start

```typescript
import {
  SpinnerModel, newSpinner, Line,
  ProgressModel, newProgress,
  TextInputModel, newTextInput,
  ViewportModel, newViewport, withViewportWidth, withViewportHeight,
} from '@oakoliver/bubbles';
```

### Spinner

```typescript
import { SpinnerModel, newSpinner, withSpinner, Dot } from '@oakoliver/bubbles';
import type { Msg, Cmd } from '@oakoliver/bubbletea';

const spinner = newSpinner(withSpinner(Dot));
const view = spinner.view(); // "⣾ "

// In your update loop:
const [updated, cmd] = spinner.update(msg);
```

<img alt="All twelve built-in spinners animating: Line, Dot, MiniDot, Jump, Pulse, Points, Globe, Moon, Monkey, Meter, Hamburger and Ellipsis" src="https://raw.githubusercontent.com/oakoliver/bubbles/main/assets/spinners.gif" width="600">

### Text Input

```typescript
import { TextInputModel, newTextInput } from '@oakoliver/bubbles';

const input = newTextInput();
input.placeholder = 'Type something...';
input.charLimit = 100;
input.focus();

const view = input.view();
const [updated, cmd] = input.update(msg);
const value = input.value();
```

<img alt="A text input completing 'charmbracelet/bu' from suggestions, then a masked token field" src="https://raw.githubusercontent.com/oakoliver/bubbles/main/assets/textinput.gif" width="600">

### Text Area

```typescript
import { TextareaModel, newTextarea } from '@oakoliver/bubbles';

const ta = newTextarea();
ta.placeholder = 'Enter your message...';
ta.setWidth(80);
ta.setHeight(10);
ta.focus();

const view = ta.view();
const [updated, cmd] = ta.update(msg);
```

Selection: `shift+←/→/↑/↓` select by character/line, `ctrl+shift+←/→` (or
`alt+shift+←/→`) by word, `ctrl+g` selects all and `ctrl+shift+c` copies to the
system clipboard. Typing, pasting, enter and the delete keys replace the
selection. Pointer-driven selection is exposed for mouse handlers:

```typescript
// x/y are relative to the textarea's top-left cell (gutter included).
ta.beginSelection(x, y);   // on mouse press
ta.extendSelection(x, y);  // on mouse motion
ta.endSelection();         // on mouse release
ta.selectedText();         // "selected\ntext"
const cmd = ta.copySelection(); // Cmd writing to the clipboard, or null
```

### Progress Bar

```typescript
import { ProgressModel, newProgress } from '@oakoliver/bubbles';

const bar = newProgress();

// Static render at a given percentage:
bar.viewAs(0.75); // "▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌░░░░░░░░░  75%"

// Animated: setPercent returns a Cmd that drives the spring animation;
// return it from your update and pass the resulting frame messages back.
const cmd = bar.setPercent(0.75);
const view = bar.view();
```

<img alt="A gradient progress bar springing from 0% to 100% in 25% steps" src="https://raw.githubusercontent.com/oakoliver/bubbles/main/assets/progress.gif" width="600">

### Viewport

```typescript
import { ViewportModel, newViewport, withViewportWidth, withViewportHeight } from '@oakoliver/bubbles';

const vp = newViewport(withViewportWidth(80), withViewportHeight(24));
vp.setContent(longString);

const view = vp.view();
const [updated, cmd] = vp.update(msg);
```

### Table

```typescript
import { TableModel, newTable, withColumns, withRows, withTableWidth, withTableHeight } from '@oakoliver/bubbles';

const table = newTable(
  withColumns([
    { title: 'Name', width: 20 },
    { title: 'Age', width: 5 },
  ]),
  withRows([
    ['Alice', '30'],
    ['Bob', '25'],
  ]),
  // As in upstream v2, rows only render once the table has a width.
  withTableWidth(29),
  withTableHeight(5),
);
table.focus();
const view = table.view();
```

<img alt="A table of the world's most populous cities with the selected row moving down and back up" src="https://raw.githubusercontent.com/oakoliver/bubbles/main/assets/table.gif" width="440">

### List

```typescript
import { newList, newListDefaultDelegate } from '@oakoliver/bubbles';
import type { ListDefaultItem } from '@oakoliver/bubbles';

// The default delegate renders a title and a description.
class MyItem implements ListDefaultItem {
  constructor(public name: string, public detail: string) {}
  title() { return this.name; }
  description() { return this.detail; }
  filterValue() { return this.name; }
}

const items = [
  new MyItem('Raspberry Pi’s', 'I have ’em all over my house'),
  new MyItem('Nutella', 'It’s good on toast'),
];
const list = newList(items, newListDefaultDelegate(), 80, 24);
const view = list.view();
```

### Tree

```typescript
import { newTree, treeRoot, treeRoundedEnumerator } from '@oakoliver/bubbles';

const tree = newTree(
  treeRoot('~/charm').child(
    'ayman',
    treeRoot('bash').child(treeRoot('tools').child('zsh', 'doom-emacs')),
    'maas',
  ),
  70, // width
  13, // height (including the help line)
);
tree.enumerator(treeRoundedEnumerator);

// ↑/↓ (k/j) move, enter toggles, →/l opens, ←/h closes, ? toggles help.
const [updated, cmd] = tree.update(msg);
tree.nodeAtCurrentOffset()?.givenValue(); // the value you passed in
const view = tree.view();
```

<img alt="examples/ide.ts: a tree file explorer expanding src/pomo and opening cli.py in a textarea editor, then selecting all 64 lines" src="https://raw.githubusercontent.com/oakoliver/bubbles/main/assets/ide.gif" width="760">

### Help

```typescript
import { HelpModel, newHelp, newBinding, withKeys, withHelp } from '@oakoliver/bubbles';

const quit = newBinding(withKeys('q', 'ctrl+c'), withHelp('q', 'quit'));
const keyMap = {
  shortHelp: () => [quit],
  fullHelp: () => [[quit]],
};

const help = newHelp();
help.view(keyMap); // "q quit"
```

### Keybindings

```typescript
import { newBinding, withKeys, withHelp, matches } from '@oakoliver/bubbles';
import { KeyPressMsg, Quit, type Cmd, type Msg } from '@oakoliver/bubbletea';

const quit = newBinding(
  withKeys('q', 'ctrl+c'),
  withHelp('q', 'quit'),
);

// In your model's update():
function update(msg: Msg): Cmd {
  if (msg instanceof KeyPressMsg && matches(msg, quit)) return Quit;
  return null;
}
```

### Paginator

```typescript
import { PaginatorModel, newPaginator, PaginatorType } from '@oakoliver/bubbles';

const pager = newPaginator();
pager.type = PaginatorType.Dots; // or PaginatorType.Arabic for "3/5"
pager.totalPages = 5;
pager.page = 2;
pager.view(); // "○○•○○"
```

### Timer & Stopwatch

```typescript
import { TimerModel, newTimer, StopwatchModel, newStopwatch } from '@oakoliver/bubbles';

// Countdown
const timer = newTimer(30000); // 30 seconds
const [t, cmd] = timer.update(msg);

// Count up
const sw = newStopwatch();
const [s, cmd2] = sw.update(msg);
```

## Keybinding System

The `key` module provides a composable keybinding system used by all components:

```typescript
import { Binding, newBinding, withKeys, withHelp, withDisabled, matches } from '@oakoliver/bubbles';

// Create a binding
const save = newBinding(
  withKeys('ctrl+s'),
  withHelp('ctrl+s', 'save file'),
);

// Check if a key message matches
if (matches(keyMsg, save)) { /* ... */ }

// Disable/enable at runtime
save.setEnabled(false);
```

## API Pattern

Every component follows the Bubbletea Elm Architecture:

```typescript
import { newSpinner } from '@oakoliver/bubbles';

// Create (each component has a new*() constructor taking options)
const model = newSpinner();

// Update on each message
const [updated, cmd] = model.update(msg);

// Render
const output = updated.view();
```

Components are immutable-style — `update()` returns a `[Model, Cmd | null]` tuple.

## Attribution

This is a TypeScript port of [bubbles](https://github.com/charmbracelet/bubbles) by [Charmbracelet, Inc.](https://charm.sh), licensed under MIT.

## License

MIT

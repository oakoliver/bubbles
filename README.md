# @oakoliver/bubbles

Pre-built TUI components for TypeScript. A pure TypeScript port of [charmbracelet/bubbles](https://github.com/charmbracelet/bubbles) with zero dependencies.

Built on top of [@oakoliver/bubbletea](https://www.npmjs.com/package/@oakoliver/bubbletea) (Elm Architecture) and [@oakoliver/lipgloss](https://www.npmjs.com/package/@oakoliver/lipgloss) (terminal styling).

## Features

- 15 ready-to-use TUI components
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
| **TextArea** | Multi-line text editor with word wrapping, line numbers, and soft wrap |

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

### Utility

| Component | Description |
|-----------|-------------|
| **Help** | Auto-generated help view from keybindings (short and full modes) |
| **Key** | Keybinding system — `Binding` class with `matches()`, `withKeys()`, `withHelp()` |
| **Cursor** | Virtual blinking cursor with focus/blur and multiple blink modes |
| **Timer** | Countdown timer with start/stop/toggle |
| **Stopwatch** | Count-up stopwatch with start/stop/toggle/reset |

## Quick Start

```typescript
import {
  SpinnerModel, newSpinner, Line,
  ProgressModel, newProgress,
  TextInputModel, newTextInput,
  ViewportModel, newViewport, withWidth, withHeight,
} from '@oakoliver/bubbles';
```

### Spinner

```typescript
import { SpinnerModel, newSpinner, Dot } from '@oakoliver/bubbles';
import type { Msg, Cmd } from '@oakoliver/bubbletea';

const spinner = newSpinner(Dot);
const view = spinner.view(); // "⣾"

// In your update loop:
const [updated, cmd] = spinner.update(msg);
```

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

### Text Area

```typescript
import { TextAreaModel, newTextarea } from '@oakoliver/bubbles';

const ta = newTextarea();
ta.placeholder = 'Enter your message...';
ta.setWidth(80);
ta.setHeight(10);
ta.focus();

const view = ta.view();
const [updated, cmd] = ta.update(msg);
```

### Progress Bar

```typescript
import { ProgressModel, newProgress } from '@oakoliver/bubbles';

const bar = newProgress();
bar.setPercent(0.75);
const view = bar.view(); // "████████████████████░░░░░░░"
```

### Viewport

```typescript
import { ViewportModel, newViewport, withWidth, withHeight } from '@oakoliver/bubbles';

const vp = newViewport(withWidth(80), withHeight(24));
vp.setContent(longString);

const view = vp.view();
const [updated, cmd] = vp.update(msg);
```

### Table

```typescript
import { TableModel, newTable, withTableColumns, withTableRows } from '@oakoliver/bubbles';

const table = newTable(
  withTableColumns([
    { title: 'Name', width: 20 },
    { title: 'Age', width: 5 },
  ]),
  withTableRows([
    ['Alice', '30'],
    ['Bob', '25'],
  ]),
);
table.focus();
const view = table.view();
```

### List

```typescript
import { ListModel, newList } from '@oakoliver/bubbles';
import type { ListItem, ListItemDelegate } from '@oakoliver/bubbles';

class MyItem implements ListItem {
  constructor(public name: string) {}
  filterValue() { return this.name; }
}

const list = newList(items, delegate, 80, 24);
const view = list.view();
```

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
import { Binding, newBinding, withKeys, withHelp, withDisabled, matches } from '@oakoliver/bubbles';

const quit = newBinding(
  withKeys('q', 'ctrl+c'),
  withHelp('q', 'quit'),
);

// In update():
if (matches(msg, quit)) {
  return [model, Quit];
}
```

### Paginator

```typescript
import { PaginatorModel, newPaginator, Arabic, Dots } from '@oakoliver/bubbles';

const pager = newPaginator();
pager.type = Dots;
pager.totalPages = 5;
pager.page = 2;
pager.view(); // "○ ○ ● ○ ○"
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
// Create
const model = newComponent(options);

// Update on each message
const [updated, cmd] = model.update(msg);

// Render
const output = model.view();
```

Components are immutable-style — `update()` returns a `[Model, Cmd | null]` tuple.

## Attribution

This is a TypeScript port of [bubbles](https://github.com/charmbracelet/bubbles) by [Charmbracelet, Inc.](https://charm.sh), licensed under MIT.

## License

MIT

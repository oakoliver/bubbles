# Changelog

## 1.2.2 — cursor colour matches upstream

### Fixed

- **A null or unset cursor colour no longer keeps the previous colour.** Textinput's `setStyles` (and `setVirtualCursor`) only restyled the virtual cursor when `styles.cursor.color` was truthy, so passing `null` left the earlier colour in place. For example, huh's Base and Base16 themes showed the default cursor colour instead of none. Like upstream's `updateVirtualCursorStyle`, the cursor style is now always replaced with `newStyle().foreground(color)`, so a null colour renders the cursor reverse-video with no foreground. Textarea already did this. Its `CursorStyle.color` type now allows `null` too, and both components pass `null` (never `undefined`) to the real cursor's `color`.

### Added

- Goldens generated with real Go (bubbles v2.2.1) for focused textinput and textarea renders with a nil cursor colour and with set colours (`#ff00ff`, `2`, `212`), with blink on and off, with a value and with a placeholder. The comparison is by styled cell, so it does not depend on how the two lipgloss ports encode SGR sequences.

## 1.2.1 — ANSI escape parsing fix

### Fixed

- **OSC sequences (hyperlinks, window titles) broke width, cutting and the viewport.** The internal ANSI parser ended every escape sequence at its first letter, so an OSC 8 hyperlink such as `ESC ]8;id=1;https://… ESC \` ended at the `i` of `id=` and the URL counted as visible text. Lines with links were measured too wide and truncated early in the viewport (a pager showed "availab" instead of "available on npm…"), and cutting could drop the link's closing sequence, leaving the hyperlink open on the following lines. `src/internal/ansi.ts` is now a port of `charmbracelet/x/ansi` v0.11.8's state machine: CSI ends at a final byte 0x40–0x7E; OSC, DCS, SOS, PM and APC end at ST (`ESC \`) or, for OSC, BEL; two-byte and intermediate `ESC` sequences are recognised. `stringWidth`, `stripAnsi`, `cut` and the viewport's highlight tokenizer all use it.
- **`cut` follows x/ansi's `Cut`.** Like upstream, it keeps every escape sequence and drops only the visible text outside the range, so a style or hyperlink open at the cut keeps its own closing sequence. It no longer re-emits earlier sequences and appends `ESC[0m`. Control characters such as `\t` are zero-width, as in x/ansi.

### Added

- `ansiTruncate(s, width, tail)` and `ansiTruncateLeft(s, n, prefix)`, ports of x/ansi's `Truncate` and `TruncateLeft`.
- Goldens generated with real Go (x/ansi v0.11.8 and bubbles v2.2.1) for width, strip, truncate, truncate-left and cut on strings with OSC 8 links, OSC titles, SGR, DCS/APC/PM/SOS and two-byte escapes, plus viewport renders of lines with links (plain, narrow, horizontal offsets, vertical offset, soft wrap).

## 1.2.0 — parity with Bubbles v2.2.1

Syncs with upstream [v2.2.0](https://github.com/charmbracelet/bubbles/releases/tag/v2.2.0) and [v2.2.1](https://github.com/charmbracelet/bubbles/releases/tag/v2.2.1). Upstream `main` after v2.2.1 only bumps Go dependencies.

The previous release (1.1.0) was committed as "Bubbles v2.0.0-alpha.2 parity", but its code and README match upstream **v2.1.1**: textarea dynamic height (v2.1.0) and the prompt-style fix for filler lines (v2.1.1) are present, and nothing from v2.2.0 is. This release diffs from v2.1.1.

### Added

- **Tree component** (upstream #893). `newTree(root, width, height)` / `TreeModel` with keyboard navigation (line, page, half page, top, bottom), open/close/toggle, a scroll-off margin, multi-line nodes, custom open/closed/cursor characters, enumerators and indenters (`treeDefaultEnumerator`, `treeRoundedEnumerator`, `treeDefaultIndenter`), light and dark styles with per-node style functions, and built-in short and full help with extra keys. Nodes are built with `treeRoot(value).child(...)` and `newTreeNode()`. `@oakoliver/lipgloss` has no tree module, so lipgloss v2.0.5's `tree` renderer is ported internally (`src/internal/ltree.ts`). Upstream's golden files are included as tests.
- **Textarea selection** (upstream #1029). Keyboard selection with `shift+←/→/↑/↓`, `ctrl+shift+←/→` / `alt+shift+←/→` / `alt+shift+f/b` (by word), `ctrl+g` (select all) and `ctrl+shift+c` (copy to the system clipboard). New APIs: `positionAt`, `beginSelection`, `extendSelection`, `endSelection`, `selectAll`, `clearSelection`, `hasSelection`, `selection`, `selectedText`, `deleteSelection` and `copySelection`. There is a new `selection` style in `StyleState`, and the `TextareaPosition`, `TextareaCopyMsg` and `TextareaCopyErrMsg` types. Typing, paste, enter and every delete binding replace an active selection. Plain movement clears it, and `reset()` / `setValue()` do too. A selected segment is drawn with the selection style instead of the inline cursor.
- **Textarea and textinput word keys** (upstream #1020). Textarea word movement also binds `ctrl+right` / `ctrl+left`. Both components delete words with `ctrl+backspace` and `ctrl+delete`.

### Fixed

- **Textarea word-left at the input boundary** (upstream #1036). Moving word-left (`alt+left`/`ctrl+left`/`alt+b`) from inside leading whitespace at the start of the buffer no longer loops forever.
- **File picker with no height set** (upstream #1026). When no `WindowSizeMsg` has arrived, the file picker shows one entry instead of rendering a blank view after entering a directory, and "go to last" / page-down no longer produce a negative scroll index. The `didSelectFile` precedence fix is mirrored. This port already required a selected path for both branches.
- **Help full-view column width.** Columns are now measured by their widest line, as upstream's `lipgloss.Width` does, not by the summed width of all lines. Full help was truncating far too early. The output now matches upstream's `TestFullHelp` goldens.
- **Viewport keeps leading whitespace.** `@oakoliver/lipgloss` 1.1.0 drops leading whitespace on every line when a width is set, so the viewport stripped indentation. Lines that already fit are now padded directly.

### Changed

- **List default quit binding: not mirrored.** Upstream v2.2.0 (#893) accidentally changed `list.DefaultKeyMap().Quit` from `q`/`esc` ("quit") to `v` ("select"). Upstream tracks it as bug #1045 with a fix in PR #1046, so this port keeps `q`/`esc`.

## 1.1.0 — parity with Bubbles v2.1.1

- Ported the Bubbles v2.1.1 API and behavior surface and added missing components.

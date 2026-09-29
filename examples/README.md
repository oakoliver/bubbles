# Examples

## ide.ts

A two-pane terminal "IDE": the tree component as a file explorer and the
textarea as an editor with keyboard text selection. By default it browses
`examples/pomo`, a small fictional Python project bundled here; pass a path to
browse something else.

```sh
bun examples/ide.ts          # the bundled sample project
bun examples/ide.ts ~/code   # any directory
```

Keys in the explorer: `↑`/`↓` move, `←`/`→` collapse and expand, `enter` opens
a file (or toggles a folder), `tab` switches to the editor, `q` quits.

Keys in the editor: `shift+arrows` select, `ctrl+shift+←/→` select by word,
`ctrl+g` selects all, `alt+←/→` or `ctrl+←/→` jump by word, `tab` goes back to
the explorer, `ctrl+c` quits. Typing edits the buffer; nothing is written to
disk.

The editor caches its rendered view and sets the textarea's `maxHeight` high
so its wrap cache holds whole files; see the comments in `ide.ts` for why.

### Dependencies

The example imports this repository's source directly (`../src/index.ts`) and
`@oakoliver/bubbletea` and `@oakoliver/lipgloss` by name, resolved from this
repository's `node_modules` (the dev dependencies installed by `bun install`).
It was written against `@oakoliver/bubbletea` 1.2.0 and `@oakoliver/lipgloss`
1.1.2 and also runs with the 1.1.x releases. Until 1.2.0 and 1.1.2 are published
to npm, you can run it against local builds: run `bun run build` in your
bubbletea and lipgloss checkouts and copy each one's `package.json` and `dist/`
into `node_modules/@oakoliver/<name>/` here.

To type-check the examples: `bunx tsc -p examples/tsconfig.json`.

## pomo/

The fictional sample project that `ide.ts` browses by default. It is only there
to be looked at; nothing in this repository builds or tests it.

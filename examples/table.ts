/**
 * Table — a port of the Bubbles table example: the world's most populous
 * cities, navigable with ↑/↓ (or j/k). Press q to quit.
 *
 * Run:  bun examples/table.ts
 */

import { type Cmd, type Msg, Program, KeyPressMsg, Quit, WithAltScreen } from '@oakoliver/bubbletea';
import { newStyle, normalBorder } from '@oakoliver/lipgloss';
import {
  type TableModel,
  newTable, tableDefaultStyles, withColumns, withRows, withTableFocused, withTableHeight, withTableStyles, withTableWidth,
} from '../src/index.js';

const baseStyle = newStyle().border(normalBorder()).borderForeground('240');

class App {
  constructor(readonly table: TableModel) {}

  init(): Cmd {
    return null;
  }

  update(msg: Msg): [App, Cmd] {
    if (msg instanceof KeyPressMsg && (msg.toString() === 'q' || msg.toString() === 'ctrl+c')) return [this, Quit];
    const [table, cmd] = this.table.update(msg);
    return [new App(table), cmd];
  }

  view(): string {
    return baseStyle.render(this.table.view()) + '\n  ' + this.table.helpView() + '\n';
  }
}

const styles = tableDefaultStyles();
styles.header = styles.header.borderStyle(normalBorder()).borderForeground('240').borderBottom(true).bold(false);
styles.selected = styles.selected.foreground('229').background('57').bold(false);

const table = newTable(
  withColumns([
    { title: 'Rank', width: 4 },
    { title: 'City', width: 12 },
    { title: 'Country', width: 10 },
    { title: 'Population', width: 10 },
  ]),
  withRows([
    ['1', 'Tokyo', 'Japan', '37,274,000'],
    ['2', 'Delhi', 'India', '32,065,760'],
    ['3', 'Shanghai', 'China', '28,516,904'],
    ['4', 'Dhaka', 'Bangladesh', '22,478,116'],
    ['5', 'São Paulo', 'Brazil', '22,429,800'],
    ['6', 'Mexico City', 'Mexico', '22,085,140'],
    ['7', 'Cairo', 'Egypt', '21,750,020'],
    ['8', 'Beijing', 'China', '21,333,332'],
    ['9', 'Mumbai', 'India', '20,961,472'],
    ['10', 'Osaka', 'Japan', '19,059,856'],
    ['11', 'Chongqing', 'China', '16,874,740'],
    ['12', 'Karachi', 'Pakistan', '16,839,950'],
    ['13', 'Istanbul', 'Turkey', '15,636,243'],
    ['14', 'Kinshasa', 'DR Congo', '15,628,085'],
    ['15', 'Lagos', 'Nigeria', '15,387,639'],
  ]),
  withTableFocused(true),
  withTableHeight(8),
  withTableWidth(44),
  withTableStyles(styles),
);

await new Program(new App(table), WithAltScreen()).run();

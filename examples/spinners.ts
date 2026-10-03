/**
 * Spinners — every built-in spinner, animating side by side.
 * Press q to quit.
 *
 * Run:  bun examples/spinners.ts
 */

import { type Cmd, type Msg, Batch, Program, KeyPressMsg, Quit, WithAltScreen } from '@oakoliver/bubbletea';
import { newStyle } from '@oakoliver/lipgloss';
import {
  type Spinner,
  type SpinnerModel,
  Dot, Ellipsis, Globe, Hamburger, Jump, Line, Meter, MiniDot, Monkey, Moon, Points, Pulse,
  newSpinner, withSpinner, withSpinnerStyle,
} from '../src/index.js';

const named: Array<[string, Spinner]> = [
  ['Line', Line], ['Dot', Dot], ['MiniDot', MiniDot], ['Jump', Jump],
  ['Pulse', Pulse], ['Points', Points], ['Globe', Globe], ['Moon', Moon],
  ['Monkey', Monkey], ['Meter', Meter], ['Hamburger', Hamburger], ['Ellipsis', Ellipsis],
];

const spinnerStyle = newStyle().foreground('#cba6f7');
const nameStyle = newStyle().foreground('#a6adc8');
const faint = newStyle().faint(true);
const spinnerCell = newStyle().width(5);
const nameCell = newStyle().width(12);

class App {
  constructor(readonly spinners: SpinnerModel[]) {}

  init(): Cmd {
    return Batch(...this.spinners.map((s) => () => s.tick()));
  }

  update(msg: Msg): [App, Cmd] {
    if (msg instanceof KeyPressMsg && (msg.toString() === 'q' || msg.toString() === 'ctrl+c')) return [this, Quit];
    const cmds: Cmd[] = [];
    const spinners = this.spinners.map((s) => {
      const [next, cmd] = s.update(msg);
      cmds.push(cmd);
      return next;
    });
    return [new App(spinners), Batch(...cmds)];
  }

  view(): string {
    const cell = (i: number) => spinnerCell.render(this.spinners[i].view()) + nameCell.render(nameStyle.render(named[i][0]));
    const rows: string[] = [];
    for (let i = 0; i < named.length; i += 3) rows.push('  ' + [i, i + 1, i + 2].map(cell).join('   '));
    return `\n${rows.join('\n\n')}\n\n  ${faint.render('q to quit')}`;
  }
}

await new Program(
  new App(named.map(([, spinner]) => newSpinner(withSpinner(spinner), withSpinnerStyle(spinnerStyle)))),
  WithAltScreen(),
).run();

/**
 * Progress — a port of the Bubbles progress-animated example: the bar
 * springs to each new percentage with a gradient fill. Quits when full.
 *
 * Run:  bun examples/progress.ts
 */

import { type Cmd, type Msg, Program, KeyPressMsg, Quit, Sequence, Tick, WindowSizeMsg, WithAltScreen } from '@oakoliver/bubbletea';
import { newStyle } from '@oakoliver/lipgloss';
import { type ProgressModel, newProgress, withDefaultBlend } from '../src/index.js';

const padding = 2;
const maxWidth = 60;
const helpStyle = newStyle().foreground('#626262');

class TickMsg {}
const tick: Cmd = Tick(1000, () => new TickMsg());

class App {
  constructor(readonly progress: ProgressModel) {}

  init(): Cmd {
    return tick;
  }

  update(msg: Msg): [App, Cmd] {
    if (msg instanceof KeyPressMsg) return [this, Quit];
    if (msg instanceof WindowSizeMsg) {
      this.progress.setWidth(Math.min(msg.width - padding * 2 - 4, maxWidth));
      return [this, null];
    }
    if (msg instanceof TickMsg) {
      if (this.progress.percent() >= 1) return [this, Sequence(Tick(800, () => null), Quit)];
      return [this, Sequence(this.progress.incrPercent(0.25), tick)];
    }
    const [progress, cmd] = this.progress.update(msg);
    return [new App(progress), cmd];
  }

  view(): string {
    const pad = ' '.repeat(padding);
    return `\n${pad}${this.progress.view()}\n\n${pad}${helpStyle.render('Press any key to quit')}`;
  }
}

await new Program(new App(newProgress(withDefaultBlend())), WithAltScreen()).run();

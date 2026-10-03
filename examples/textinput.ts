/**
 * Text Input — a repo picker with suggestions (tab accepts the ghost text)
 * and a masked token field. Enter moves to the next field, then quits.
 *
 * Run:  bun examples/textinput.ts
 */

import { type Cmd, type Msg, Batch, Program, KeyPressMsg, Quit, WithAltScreen } from '@oakoliver/bubbletea';
import { newStyle } from '@oakoliver/lipgloss';
import { type TextInputModel, EchoMode, newTextInput } from '../src/index.js';

const label = newStyle().bold(true).foreground('#cba6f7');
const faint = newStyle().faint(true);

const repo = newTextInput();
repo.placeholder = 'charmbracelet/…';
repo.showSuggestions = true;
repo.setSuggestions(['bubbletea', 'bubbles', 'lipgloss', 'glamour', 'glow', 'gum', 'huh', 'vhs'].map((r) => `charmbracelet/${r}`));
repo.setWidth(32);

const token = newTextInput();
token.placeholder = 'ghp_…';
token.echoMode = EchoMode.EchoPassword;
token.echoCharacter = '•';
token.setWidth(32);

class App {
  constructor(readonly inputs: TextInputModel[], readonly focused = 0, readonly done = false) {}

  init(): Cmd {
    return this.inputs[0].focus();
  }

  update(msg: Msg): [App, Cmd] {
    if (msg instanceof KeyPressMsg) {
      const key = msg.toString();
      if (key === 'ctrl+c' || key === 'esc') return [this, Quit];
      if (key === 'enter') {
        if (this.focused === this.inputs.length - 1) return [new App(this.inputs, this.focused, true), Quit];
        this.inputs[this.focused].blur();
        return [new App(this.inputs, this.focused + 1), this.inputs[this.focused + 1].focus()];
      }
    }
    const cmds: Cmd[] = [];
    const inputs = this.inputs.map((input, i) => {
      if (i !== this.focused && !(typeof msg === 'object' && msg && 'id' in msg)) return input;
      const [next, cmd] = input.update(msg);
      cmds.push(cmd);
      return next;
    });
    return [new App(inputs, this.focused), Batch(...cmds)];
  }

  view(): string {
    if (this.done) return '';
    return [
      '',
      `  ${label.render('Repository')}`,
      `  ${this.inputs[0].view()}`,
      '',
      `  ${label.render('Token')}`,
      `  ${this.inputs[1].view()}`,
      '',
      `  ${faint.render('tab accept suggestion • ↑/↓ cycle • enter next • esc quit')}`,
    ].join('\n');
  }
}

await new Program(new App([repo, token]), WithAltScreen()).run();

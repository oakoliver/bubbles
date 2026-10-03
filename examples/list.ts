/**
 * List — a port of the Bubbles list-default example
 * (charmbracelet/bubbletea/examples/list-default). Press / to filter,
 * ↑/↓ to move, q to quit.
 *
 * Run:  bun examples/list.ts
 */

import { type Cmd, type Msg, Program, KeyPressMsg, Quit, WindowSizeMsg, WithAltScreen } from '@oakoliver/bubbletea';
import { newStyle } from '@oakoliver/lipgloss';
import { type ListDefaultItem, type ListModel, newList, newListDefaultDelegate } from '../src/index.js';

const docStyle = newStyle().margin(1, 2);

class Item implements ListDefaultItem {
  constructor(private readonly t: string, private readonly d: string) {}
  title(): string { return this.t; }
  description(): string { return this.d; }
  filterValue(): string { return this.t; }
}

const items = [
  new Item('Raspberry Pi’s', 'I have ’em all over my house'),
  new Item('Nutella', 'It’s good on toast'),
  new Item('Bitter melon', 'It cools you down'),
  new Item('Nice socks', 'And by that I mean socks without holes'),
  new Item('Eight hours of sleep', 'I had this once'),
  new Item('Cats', 'Usually'),
  new Item('Plantasia, the album', 'My plants love it too'),
  new Item('Pour over coffee', 'It takes forever to make though'),
  new Item('VR', 'Virtual reality…what is there to say?'),
  new Item('Noguchi Lamps', 'Such pleasing organic forms'),
  new Item('Linux', 'Pretty much the best OS'),
  new Item('Business school', 'Just kidding'),
  new Item('Pottery', 'Wet clay is a great feeling'),
  new Item('Shampoo', 'Nothing like clean hair'),
  new Item('Table tennis', 'It’s surprisingly exhausting'),
  new Item('Milk crates', 'Great for packing in your extra stuff'),
  new Item('Afternoon tea', 'Especially the tea sandwich part'),
  new Item('Stickers', 'The thicker the vinyl the better'),
  new Item('20° Weather', 'Celsius, not Fahrenheit'),
  new Item('Warm light', 'Like around 2700 Kelvin'),
  new Item('The vernal equinox', 'The autumnal equinox is pretty good too'),
  new Item('Gaffer’s tape', 'Basically sticky fabric'),
  new Item('Terrycloth', 'In other words, towel fabric'),
];

class App {
  constructor(readonly list: ListModel) {}

  init(): Cmd {
    return null;
  }

  update(msg: Msg): [App, Cmd] {
    if (msg instanceof KeyPressMsg && msg.toString() === 'ctrl+c') return [this, Quit];
    if (msg instanceof WindowSizeMsg) {
      const { x, y } = docStyle.getFrameSize();
      this.list.setSize(msg.width - x, msg.height - y);
    }
    const [list, cmd] = this.list.update(msg);
    return [new App(list), cmd];
  }

  view(): string {
    return docStyle.render(this.list.view());
  }
}

const list = newList(items, newListDefaultDelegate(), 0, 0);
list.title = 'My Fave Things';

await new Program(new App(list), WithAltScreen()).run();

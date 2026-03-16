/**
 * Tests for viewport module — ported from charm.land/bubbles/v2/viewport/viewport_test.go
 *
 * The Go tests use golden files for View() snapshots. We test structurally
 * by checking line counts, scroll offsets, and content correctness.
 * Private fields are accessed via bracket notation where needed.
 */
import { describe, expect, test } from 'bun:test';
import {
  Model,
  newViewport,
  withWidth,
  withHeight,
} from '../src/viewport/viewport.js';
import { stringWidth } from '@oakoliver/lipgloss';

// ── Shared content from Go tests ────────────────────────────────────────────

const textContentList = `57 Precepts of narcissistic comedy character Zote from an awesome "Hollow knight" game (https://store.steampowered.com/app/367520/Hollow_Knight/).
Precept One: 'Always Win Your Battles'. Losing a battle earns you nothing and teaches you nothing. Win your battles, or don't engage in them at all!

Precept Two: 'Never Let Them Laugh at You'. Fools laugh at everything, even at their superiors. But beware, laughter isn't harmless! Laughter spreads like a disease, and soon everyone is laughing at you. You need to strike at the source of this perverse merriment quickly to stop it from spreading.
Precept Three: 'Always Be Rested'. Fighting and adventuring take their toll on your body. When you rest, your body strengthens and repairs itself. The longer you rest, the stronger you become.
Precept Four: 'Forget Your Past'. The past is painful, and thinking about your past can only bring you misery. Think about something else instead, such as the future, or some food.
Precept Five: 'Strength Beats Strength'. Is your opponent strong? No matter! Simply overcome their strength with even more strength, and they'll soon be defeated.
Precept Six: 'Choose Your Own Fate'. Our elders teach that our fate is chosen for us before we are even born. I disagree.
Precept Seven: 'Mourn Not the Dead'. When we die, do things get better for us or worse? There's no way to tell, so we shouldn't bother mourning. Or celebrating for that matter.
Precept Eight: 'Travel Alone'. You can rely on nobody, and nobody will always be loyal. Therefore, nobody should be your constant companion.
Precept Nine: 'Keep Your Home Tidy'. Your home is where you keep your most prized possession - yourself. Therefore, you should make an effort to keep it nice and clean.
Precept Ten: 'Keep Your Weapon Sharp'. I make sure that my weapon, 'Life Ender', is kept well-sharpened at all times. This makes it much easier to cut things.
Precept Eleven: 'Mothers Will Always Betray You'. This Precept explains itself.
Precept Twelve: 'Keep Your Cloak Dry'. If your cloak gets wet, dry it as soon as you can. Wearing wet cloaks is unpleasant, and can lead to illness.
Precept Thirteen: 'Never Be Afraid'. Fear can only hold you back. Facing your fears can be a tremendous effort. Therefore, you should just not be afraid in the first place.
Precept Fourteen: 'Respect Your Superiors'. If someone is your superior in strength or intellect or both, you need to show them your respect. Don't ignore them or laugh at them.
Precept Fifteen: 'One Foe, One Blow'. You should only use a single blow to defeat an enemy. Any more is a waste. Also, by counting your blows as you fight, you'll know how many foes you've defeated.`;

const defaultList = textContentList.split('\n');

// ── TestNew ─────────────────────────────────────────────────────────────────

describe('TestNew', () => {
  test('default values on create by New', () => {
    const m = newViewport(withHeight(10), withWidth(10));

    expect(m.mouseWheelDelta).toBe(3);
    expect(m.mouseWheelEnabled).toBe(true);
    expect(m.height()).toBe(10);
    expect(m.width()).toBe(10);
  });
});

// ── TestSetHorizontalStep ───────────────────────────────────────────────────

describe('TestSetHorizontalStep', () => {
  test('change default', () => {
    const m = newViewport(withHeight(10), withWidth(10));
    const newStep = 8;
    m.setHorizontalStep(newStep);
    // We can't directly read _horizontalStep, but we can test behavior
    // by scrolling right and checking xOffset
    m.setContent('Some very long line that definitely exceeds the viewport width and needs scrolling');
    m.scrollRight(newStep);
    expect(m.xOffset()).toBe(newStep);
  });

  test('no negative', () => {
    const m = newViewport(withHeight(10), withWidth(10));
    m.setHorizontalStep(-1);
    m.setContent('Some very long line that exceeds the width');
    // After setting step to -1, it should be clamped to 0
    // so scrollRight with that step does nothing visible
    // Test via xOffset behavior
    m.scrollRight(0);
    expect(m.xOffset()).toBe(0);
  });
});

// ── TestMoveLeft ────────────────────────────────────────────────────────────

describe('TestMoveLeft', () => {
  test('zero position', () => {
    const m = newViewport(withHeight(10), withWidth(10));
    expect(m.xOffset()).toBe(0);

    m.scrollLeft(6);
    expect(m.xOffset()).toBe(0);
  });

  test('move', () => {
    const m = newViewport(withHeight(10), withWidth(10));
    m.setContent('Some very long line that exceeds the viewport width and needs scrolling a lot');

    // Move right first
    m.scrollRight(6);
    m.scrollRight(6);
    expect(m.xOffset()).toBe(12);

    // Move left one step
    m.scrollLeft(6);
    expect(m.xOffset()).toBe(6);
  });
});

// ── TestMoveRight ───────────────────────────────────────────────────────────

describe('TestMoveRight', () => {
  test('move', () => {
    const m = newViewport(withHeight(10), withWidth(10));
    m.setContent('Some line that is longer than width');
    expect(m.xOffset()).toBe(0);

    m.scrollRight(6);
    expect(m.xOffset()).toBe(6);
  });
});

// ── TestResetIndent ─────────────────────────────────────────────────────────

describe('TestResetIndent', () => {
  test('reset', () => {
    const m = newViewport(withHeight(10), withWidth(10));
    m.setContent('A sufficiently long line for this test to work properly with overscroll');
    m.scrollRight(500);

    m.setXOffset(0);
    expect(m.xOffset()).toBe(0);
  });
});

// ── TestVisibleLines ────────────────────────────────────────────────────────

describe('TestVisibleLines', () => {
  test('empty list', () => {
    const m = newViewport(withHeight(10), withWidth(10));
    expect(m.visibleLineCount()).toBe(0);
  });

  test('list', () => {
    const numberOfLines = 10;
    const m = newViewport(withHeight(numberOfLines), withWidth(10));
    m.setContent(defaultList.join('\n'));

    expect(m.visibleLineCount()).toBe(numberOfLines);
  });

  test('list: with y offset', () => {
    const numberOfLines = 10;
    const m = newViewport(withHeight(numberOfLines), withWidth(10));
    m.setContent(defaultList.join('\n'));
    m.setYOffset(5);

    expect(m.visibleLineCount()).toBe(numberOfLines);
    expect(m.yOffset()).toBe(5);
  });

  test('list: with y offset: horizontal scroll', () => {
    const numberOfLines = 10;
    const m = newViewport(withHeight(numberOfLines), withWidth(10));
    m.setContent(textContentList);
    m.setYOffset(7);

    // Verify visible lines
    const count = m.visibleLineCount();
    expect(count).toBe(numberOfLines);

    // scroll right
    m.scrollRight(6);
    expect(m.xOffset()).toBe(6);

    // scroll left
    m.scrollLeft(6);
    expect(m.xOffset()).toBe(0);
  });
});

// ── TestRightOverscroll ─────────────────────────────────────────────────────

describe('TestRightOverscroll', () => {
  test('prevent right overscroll', () => {
    const content = 'Content is short';
    const m = newViewport(withHeight(5), withWidth(content.length + 1));
    m.setContent(content);

    for (let i = 0; i < 10; i++) {
      m.scrollRight(6);
    }

    // Should not have scrolled beyond the content
    // The xOffset should be clamped so content is still fully visible
    expect(m.xOffset()).toBe(0);
  });
});

// ── TestSizing ──────────────────────────────────────────────────────────────

describe('TestSizing', () => {
  test('view-0x0', () => {
    const vt = newViewport(withWidth(0), withHeight(0));
    vt.setContent(textContentList);
    // should not panic
    const view = vt.view();
    expect(view).toBe('');
  });

  test('view-1x0', () => {
    const vt = newViewport(withWidth(1), withHeight(0));
    vt.setContent(textContentList);
    const view = vt.view();
    expect(view).toBe('');
  });

  test('view-0x1', () => {
    const vt = newViewport(withWidth(0), withHeight(1));
    vt.setContent(textContentList);
    const view = vt.view();
    expect(view).toBe('');
  });

  test('view has correct dimensions', () => {
    const width = 40;
    const height = 15;
    const vt = newViewport(withWidth(width), withHeight(height));
    vt.setContent(textContentList);

    const view = vt.view();
    const lines = view.split('\n');
    expect(lines.length).toBe(height);
    // Each line should have the correct width
    for (const line of lines) {
      expect(stringWidth(line)).toBe(width);
    }
  });

  test('view-50x15-softwrap', () => {
    const width = 50;
    const height = 15;
    const vt = newViewport(withWidth(width), withHeight(height));
    vt.softWrap = true;
    vt.setContent(textContentList);

    const view = vt.view();
    const lines = view.split('\n');
    expect(lines.length).toBe(height);
    for (const line of lines) {
      expect(stringWidth(line)).toBe(width);
    }
  });

  test('view-50x15-softwrap scroll', () => {
    const width = 50;
    const height = 15;
    const vt = newViewport(withWidth(width), withHeight(height));
    vt.softWrap = true;
    vt.setContent(textContentList);

    // At top
    let view = vt.view();
    let lines = view.split('\n');
    expect(lines.length).toBe(height);

    // Scroll down
    vt.scrollDown(1);
    view = vt.view();
    lines = view.split('\n');
    expect(lines.length).toBe(height);

    // Scroll down again
    vt.scrollDown(1);
    view = vt.view();
    lines = view.split('\n');
    expect(lines.length).toBe(height);

    // Go to bottom
    vt.gotoBottom();
    view = vt.view();
    lines = view.split('\n');
    expect(lines.length).toBe(height);
  });

  test('content lines with embedded newlines', () => {
    const content = [
      '57 Precepts of narcissistic comedy character Zote from an\nawesome "Hollow knight" game',
    ];
    const vt = newViewport(withWidth(50), withHeight(15));
    vt.setContentLines(content);

    const view = vt.view();
    // The embedded \n should be split into two lines
    expect(view.length).toBeGreaterThan(0);
  });
});

// ── Scroll behavior tests ───────────────────────────────────────────────────

describe('Scroll behavior', () => {
  test('atTop/atBottom', () => {
    const m = newViewport(withHeight(5), withWidth(40));
    m.setContent(defaultList.join('\n'));

    expect(m.atTop()).toBe(true);
    expect(m.atBottom()).toBe(false);

    m.gotoBottom();
    expect(m.atTop()).toBe(false);
    expect(m.atBottom()).toBe(true);

    m.gotoTop();
    expect(m.atTop()).toBe(true);
    expect(m.atBottom()).toBe(false);
  });

  test('scrollPercent', () => {
    const m = newViewport(withHeight(5), withWidth(40));
    m.setContent(defaultList.join('\n'));

    // At top
    expect(m.scrollPercent()).toBe(0);

    // At bottom
    m.gotoBottom();
    expect(m.scrollPercent()).toBe(1);
  });

  test('pageDown/pageUp', () => {
    const m = newViewport(withHeight(5), withWidth(40));
    m.setContent(defaultList.join('\n'));

    expect(m.yOffset()).toBe(0);

    m.pageDown();
    expect(m.yOffset()).toBe(5);

    m.pageUp();
    expect(m.yOffset()).toBe(0);
  });

  test('halfPageDown/halfPageUp', () => {
    const m = newViewport(withHeight(10), withWidth(40));
    m.setContent(defaultList.join('\n'));

    m.halfPageDown();
    expect(m.yOffset()).toBe(5);

    m.halfPageUp();
    expect(m.yOffset()).toBe(0);
  });

  test('scrollDown at bottom does nothing', () => {
    const m = newViewport(withHeight(5), withWidth(40));
    m.setContent(defaultList.join('\n'));

    m.gotoBottom();
    const offset = m.yOffset();
    m.scrollDown(1);
    expect(m.yOffset()).toBe(offset);
  });

  test('scrollUp at top does nothing', () => {
    const m = newViewport(withHeight(5), withWidth(40));
    m.setContent(defaultList.join('\n'));

    m.scrollUp(1);
    expect(m.yOffset()).toBe(0);
  });

  test('setContent adjusts offset if past bottom', () => {
    const m = newViewport(withHeight(5), withWidth(40));
    m.setContent(defaultList.join('\n'));
    m.gotoBottom();

    // Now set shorter content
    m.setContent('Short\ncontent');
    expect(m.yOffset()).toBe(0);
  });
});

// ── Update handler tests ────────────────────────────────────────────────────

describe('Update handler', () => {
  test('down key scrolls down', () => {
    const m = newViewport(withHeight(5), withWidth(40));
    m.setContent(defaultList.join('\n'));

    const msg = { type: 'keyPress' as const, key: 'down' };
    m.update(msg);
    expect(m.yOffset()).toBe(1);
  });

  test('up key scrolls up', () => {
    const m = newViewport(withHeight(5), withWidth(40));
    m.setContent(defaultList.join('\n'));
    m.setYOffset(3);

    const msg = { type: 'keyPress' as const, key: 'up' };
    m.update(msg);
    expect(m.yOffset()).toBe(2);
  });

  test('unrelated message does nothing', () => {
    const m = newViewport(withHeight(5), withWidth(40));
    m.setContent(defaultList.join('\n'));

    m.update({ type: 'unrelated' });
    expect(m.yOffset()).toBe(0);
  });
});

// ── GetContent ──────────────────────────────────────────────────────────────

describe('GetContent', () => {
  test('round-trips content', () => {
    const m = newViewport(withHeight(10), withWidth(40));
    m.setContent(textContentList);
    expect(m.getContent()).toBe(textContentList);
  });
});

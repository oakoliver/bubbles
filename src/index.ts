/**
 * @oakoliver/bubbles — Pre-built TUI components for TypeScript
 *
 * Zero-dependency port of Charmbracelet's Bubbles (Go).
 * Provides ready-to-use components for building rich terminal UIs.
 *
 * @module
 */

// ── Key (keybinding system) ─────────────────────────────────────────────────
export {
  Binding,
  newBinding,
  withKeys,
  withHelp,
  withDisabled,
  matches,
} from './key/key.js';
export type { Help, BindingOpt } from './key/key.js';

// ── Cursor ──────────────────────────────────────────────────────────────────
export {
  Model as CursorModel,
  newCursor,
  blink,
  Mode as CursorMode,
  modeString as cursorModeString,
} from './cursor/cursor.js';
export type {
  InitialBlinkMsg,
  BlinkMsg,
  BlinkCanceledMsg,
  CursorMsg,
} from './cursor/cursor.js';

// ── Spinner ─────────────────────────────────────────────────────────────────
export {
  Model as SpinnerModel,
  newSpinner,
  withSpinner,
  withStyle as withSpinnerStyle,
  // Built-in spinners
  Line,
  Dot,
  MiniDot,
  Jump,
  Pulse,
  Points,
  Globe,
  Moon,
  Monkey,
  Meter,
  Hamburger,
  Ellipsis,
} from './spinner/spinner.js';
export type {
  Spinner,
  TickMsg as SpinnerTickMsg,
  Option as SpinnerOption,
} from './spinner/spinner.js';

// ── Paginator ───────────────────────────────────────────────────────────────
export {
  Model as PaginatorModel,
  newPaginator,
  Type as PaginatorType,
  defaultKeyMap as paginatorDefaultKeyMap,
  withTotalPages,
  withPerPage,
} from './paginator/paginator.js';
export type {
  KeyMap as PaginatorKeyMap,
  Option as PaginatorOption,
} from './paginator/paginator.js';

// ── Timer ───────────────────────────────────────────────────────────────────
export {
  Model as TimerModel,
  newTimer,
  withInterval as withTimerInterval,
} from './timer/timer.js';
export type {
  StartStopMsg as TimerStartStopMsg,
  TickMsg as TimerTickMsg,
  TimeoutMsg,
  Option as TimerOption,
} from './timer/timer.js';

// ── Stopwatch ───────────────────────────────────────────────────────────────
export {
  Model as StopwatchModel,
  newStopwatch,
  withInterval as withStopwatchInterval,
} from './stopwatch/stopwatch.js';
export type {
  TickMsg as StopwatchTickMsg,
  StartStopMsg as StopwatchStartStopMsg,
  ResetMsg as StopwatchResetMsg,
  Option as StopwatchOption,
} from './stopwatch/stopwatch.js';

// ── Progress ────────────────────────────────────────────────────────────────
export {
  Model as ProgressModel,
  newProgress,
  DefaultFullCharHalfBlock,
  DefaultFullCharFullBlock,
  DefaultEmptyCharBlock,
  withDefaultBlend,
  withColors as withProgressColors,
  withColorFunc,
  withFillCharacters,
  withoutPercentage,
  withWidth as withProgressWidth,
  withSpringOptions,
  withScaled,
} from './progress/progress.js';
export type {
  ColorFunc,
  FrameMsg as ProgressFrameMsg,
  Option as ProgressOption,
} from './progress/progress.js';

// ── Help ────────────────────────────────────────────────────────────────────
export {
  Model as HelpModel,
  newHelp,
  defaultStyles as helpDefaultStyles,
  defaultDarkStyles as helpDefaultDarkStyles,
  defaultLightStyles as helpDefaultLightStyles,
} from './help/help.js';
export type {
  KeyMap as HelpKeyMap,
  Styles as HelpStyles,
} from './help/help.js';

// ── Viewport ────────────────────────────────────────────────────────────────
export {
  Model as ViewportModel,
  newViewport,
  defaultKeyMap as viewportDefaultKeyMap,
  withWidth as withViewportWidth,
  withHeight as withViewportHeight,
} from './viewport/viewport.js';
export type {
  Option as ViewportOption,
  GutterFunc,
  GutterContext,
  KeyMap as ViewportKeyMap,
} from './viewport/viewport.js';

// ── Table ───────────────────────────────────────────────────────────────────
export {
  Model as TableModel,
  newTable,
  defaultKeyMap as tableDefaultKeyMap,
  defaultStyles as tableDefaultStyles,
  withColumns,
  withRows,
  withHeight as withTableHeight,
  withWidth as withTableWidth,
  withFocused as withTableFocused,
  withStyles as withTableStyles,
  withKeyMap as withTableKeyMap,
} from './table/table.js';
export type {
  Row,
  Column,
  KeyMap as TableKeyMap,
  Styles as TableStyles,
  Option as TableOption,
} from './table/table.js';

// ── TextInput ───────────────────────────────────────────────────────────────
export {
  Model as TextInputModel,
  newTextInput,
  EchoMode,
  defaultKeyMap as textInputDefaultKeyMap,
  defaultStyles as textInputDefaultStyles,
  defaultDarkStyles as textInputDefaultDarkStyles,
  defaultLightStyles as textInputDefaultLightStyles,
  textInputBlink,
} from './textinput/textinput.js';
export type {
  ValidateFunc,
  KeyMap as TextInputKeyMap,
  StyleState as TextInputStyleState,
  CursorStyle as TextInputCursorStyle,
  Styles as TextInputStyles,
} from './textinput/textinput.js';

// ── Internal: Runeutil ──────────────────────────────────────────────────────
export {
  newSanitizer,
  replaceTabs,
  replaceNewlines,
} from './internal/runeutil.js';
export type { Sanitizer } from './internal/runeutil.js';

// ── Textarea ────────────────────────────────────────────────────────────────
export {
  Model as TextareaModel,
  newTextarea,
  defaultKeyMap as textareaDefaultKeyMap,
  defaultStyles as textareaDefaultStyles,
  defaultDarkStyles as textareaDefaultDarkStyles,
  defaultLightStyles as textareaDefaultLightStyles,
  paste as textareaPaste,
} from './textarea/textarea.js';
export type {
  LineInfo,
  PromptInfo,
  KeyMap as TextareaKeyMap,
  CursorStyle as TextareaCursorStyle,
  StyleState as TextareaStyleState,
  Styles as TextareaStyles,
} from './textarea/textarea.js';

// ── List ────────────────────────────────────────────────────────────────────
export {
  Model as ListModel,
  newList,
  DefaultDelegate as ListDefaultDelegate,
  newDefaultDelegate as newListDefaultDelegate,
  defaultKeyMap as listDefaultKeyMap,
  defaultStyles as listDefaultStyles,
  newDefaultItemStyles as listNewDefaultItemStyles,
  defaultFilter as listDefaultFilter,
  unsortedFilter as listUnsortedFilter,
  FilterState as ListFilterState,
} from './list/list.js';
export type {
  Item as ListItem,
  DefaultItem as ListDefaultItem,
  ItemDelegate as ListItemDelegate,
  KeyMap as ListKeyMap,
  Styles as ListStyles,
  DefaultItemStyles as ListDefaultItemStyles,
  Rank as ListRank,
  FilterFunc as ListFilterFunc,
  FilterMatchesMsg as ListFilterMatchesMsg,
  FilteredItem as ListFilteredItem,
} from './list/list.js';

// ── FilePicker ──────────────────────────────────────────────────────────────
export {
  Model as FilePickerModel,
  newFilePicker,
  defaultKeyMap as filePickerDefaultKeyMap,
  defaultStyles as filePickerDefaultStyles,
} from './filepicker/filepicker.js';
export type {
  DirEntry,
  KeyMap as FilePickerKeyMap,
  Styles as FilePickerStyles,
} from './filepicker/filepicker.js';

// ── Internal: ANSI utilities ────────────────────────────────────────────────
export {
  stripAnsi as ansiStripAnsi,
  stringWidth as ansiStringWidth,
  cut as ansiCut,
} from './internal/ansi.js';

// ── Internal: Harmonica (spring physics) ────────────────────────────────────
export {
  FPS,
  NewSpring,
  springUpdate,
} from './internal/harmonica.js';
export type { Spring } from './internal/harmonica.js';

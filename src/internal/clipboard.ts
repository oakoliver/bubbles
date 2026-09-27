import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface ClipboardCommand {
  command: string;
  args: string[];
}

/**
 * Reads text from the host clipboard using the platform's native clipboard
 * command. Errors are surfaced to the component so callers can display them.
 */
export async function readClipboard(): Promise<string> {
  const commands = clipboardCommands(process.platform);
  let lastError: unknown;

  for (const { command, args } of commands) {
    try {
      const { stdout } = await execFileAsync(command, args, {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      });
      return stdout;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`unable to read clipboard on ${process.platform}`, {
    cause: lastError,
  });
}

function clipboardCommands(platform: NodeJS.Platform): ClipboardCommand[] {
  switch (platform) {
    case 'darwin':
      return [{ command: 'pbpaste', args: [] }];
    case 'win32':
      return [{
        command: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard -Raw'],
      }];
    default:
      return [
        { command: 'wl-paste', args: ['--type', 'text/plain'] },
        { command: 'xclip', args: ['-selection', 'clipboard', '-out'] },
        { command: 'xsel', args: ['--clipboard', '--output'] },
      ];
  }
}

/**
 * Writes text to the host clipboard using the platform's native clipboard
 * command. Errors are surfaced to the component so callers can display them.
 */
export async function writeClipboard(text: string): Promise<void> {
  const commands = clipboardWriteCommands(process.platform);
  let lastError: unknown;

  for (const { command, args } of commands) {
    try {
      await pipeToCommand(command, args, text);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`unable to write clipboard on ${process.platform}`, {
    cause: lastError,
  });
}

function pipeToCommand(command: string, args: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
    child.stdin.on('error', reject);
    child.stdin.end(input, 'utf8');
  });
}

function clipboardWriteCommands(platform: NodeJS.Platform): ClipboardCommand[] {
  switch (platform) {
    case 'darwin':
      return [{ command: 'pbcopy', args: [] }];
    case 'win32':
      return [{
        command: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command', '$input | Set-Clipboard'],
      }];
    default:
      return [
        { command: 'wl-copy', args: ['--type', 'text/plain'] },
        { command: 'xclip', args: ['-selection', 'clipboard', '-in'] },
        { command: 'xsel', args: ['--clipboard', '--input'] },
      ];
  }
}

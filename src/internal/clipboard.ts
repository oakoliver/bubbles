import { execFile } from 'node:child_process';
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

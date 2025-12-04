import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

export default class TtyOutputReader {
  /**
   * Reads terminal output, optionally from a specific session.
   * @param linesOfOutput Number of lines to return (from the end)
   * @param sessionId Optional session ID to read from. If not provided, reads from current session.
   */
  static async call(linesOfOutput?: number, sessionId?: string): Promise<string> {
    const buffer = await this.retrieveBuffer(sessionId);
    if (!linesOfOutput) {
      return buffer;
    }
    const lines = buffer.split('\n');
    return lines.slice(-linesOfOutput - 1).join('\n');
  }

  /**
   * Retrieves the full buffer content from a session.
   * @param sessionId Optional session ID. If not provided, reads from current session.
   */
  static async retrieveBuffer(sessionId?: string): Promise<string> {
    let ascript: string;

    if (sessionId) {
      // Target specific session by unique ID
      ascript = `
        tell application "iTerm2"
          repeat with w in windows
            repeat with t in tabs of w
              repeat with s in sessions of t
                if unique id of s is "${sessionId}" then
                  return contents of s
                end if
              end repeat
            end repeat
          end repeat
          error "Session not found: ${sessionId}"
        end tell
      `;
    } else {
      // Default: current session of front window
      ascript = `
        tell application "iTerm2"
          tell front window
            tell current session of current tab
              set allContent to contents
              return allContent
            end tell
          end tell
        end tell
      `;
    }

    const { stdout: finalContent } = await execPromise(`osascript -e '${ascript}'`);
    return finalContent.trim();
  }
}
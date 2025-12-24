import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { escapeForAppleScriptString, buildOsascriptCommand } from './utils/escaping.js';

const execPromise = promisify(exec);

// Map of special key names to their ASCII codes
const SPECIAL_KEYS: Record<string, number> = {
  // Enter/Return keys
  'ENTER': 13,      // Carriage Return
  'RETURN': 13,     // Carriage Return
  'CR': 13,         // Carriage Return
  'LF': 10,         // Line Feed
  'NEWLINE': 10,    // Line Feed

  // Escape key
  'ESCAPE': 27,
  'ESC': 27,

  // Tab key
  'TAB': 9,

  // Backspace/Delete
  'BACKSPACE': 127, // DEL character (what backspace typically sends)
  'BS': 8,          // ASCII backspace
  'DELETE': 127,    // DEL
  'DEL': 127,

  // Other control characters
  ']': 29,          // GS - Group Separator (telnet escape)
  'SPACE': 32,      // Space (useful for sending space without implicit newline)
};

class SendControlCharacter {
  private sessionId?: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId;
  }

  // This method is added for testing purposes
  protected async executeCommand(command: string): Promise<void> {
    await execPromise(command);
  }

  async send(letter: string): Promise<void> {
    let controlCode: number;
    const upperLetter = letter.toUpperCase();

    // Check if it's a special key name first
    if (upperLetter in SPECIAL_KEYS) {
      controlCode = SPECIAL_KEYS[upperLetter];
    }
    // Check for the literal ']' character (telnet escape)
    else if (letter === ']') {
      controlCode = SPECIAL_KEYS[']'];
    }
    // Standard control characters (A-Z become Ctrl+A through Ctrl+Z)
    else {
      const normalizedLetter = upperLetter;
      if (!/^[A-Z]$/.test(normalizedLetter)) {
        throw new Error(`Invalid key: "${letter}". Use a single letter (A-Z) for control characters, or a special key name (ENTER, ESC, TAB, BACKSPACE, etc.)`);
      }
      // Convert to standard control code (A=1, B=2, etc.)
      controlCode = normalizedLetter.charCodeAt(0) - 64;
    }

    let ascript: string;

    if (this.sessionId) {
      // Target specific session by unique ID
      const escapedSessionId = escapeForAppleScriptString(this.sessionId);
      // Use "newline NO" to prevent iTerm2 from adding an extra newline after the character
      ascript = `
        tell application "iTerm2"
          repeat with w in windows
            repeat with t in tabs of w
              repeat with s in sessions of t
                if unique id of s is "${escapedSessionId}" then
                  tell s to write text (ASCII character ${controlCode}) newline NO
                  return
                end if
              end repeat
            end repeat
          end repeat
          error "Session not found: ${escapedSessionId}"
        end tell
      `;
    } else {
      // Default: current session of front window
      // Use "newline NO" to prevent iTerm2 from adding an extra newline after the character
      ascript = `
        tell application "iTerm2"
          tell front window
            tell current session of current tab
              write text (ASCII character ${controlCode}) newline NO
            end tell
          end tell
        end tell
      `;
    }

    try {
      await this.executeCommand(buildOsascriptCommand(ascript));
    } catch (error: unknown) {
      throw new Error(`Failed to send key: ${(error as Error).message}`);
    }
  }
}

export default SendControlCharacter;
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

export interface SessionInfo {
  sessionId: string;
  name: string;
  windowName: string;
  windowId: number;
  tabIndex: number;
  tty: string;
  profile: string;
  isCurrent: boolean;
  isProcessing: boolean;
  preview: string;
}

/**
 * SessionManager handles discovering and managing iTerm2 sessions.
 * 
 * It provides methods to:
 * - List all sessions across all windows and tabs
 * - Get metadata about each session
 * - Support targeting specific sessions by their unique ID
 */
export default class SessionManager {
  /**
   * Discovers all iTerm2 sessions across all windows and tabs.
   * Returns detailed information about each session including a preview of recent output.
   */
  static async listSessions(): Promise<SessionInfo[]> {
    const script = `
      tell application "iTerm2"
        set output to ""
        set currentSessionId to ""
        set fieldSep to "<<:FIELD:>>"
        set recordSep to "<<:RECORD:>>"

        try
          set currentSessionId to unique id of current session of current window
        end try

        set windowList to windows
        repeat with wIndex from 1 to count of windowList
          set w to item wIndex of windowList
          set windowId to id of w
          set windowName to name of w
          set tabList to tabs of w
          repeat with tIndex from 1 to count of tabList
            set t to item tIndex of tabList
            set sessionList to sessions of t
            repeat with sIndex from 1 to count of sessionList
              set s to item sIndex of sessionList
              set sessionId to unique id of s
              set sessionName to name of s
              set sessionTty to tty of s
              set profileName to profile name of s
              set isProc to is processing of s

              -- Get last few lines as preview (limit to last 500 chars to avoid issues)
              set sessionContents to contents of s
              set previewText to ""
              if length of sessionContents > 0 then
                if length of sessionContents > 500 then
                  set previewText to text ((length of sessionContents) - 499) thru (length of sessionContents) of sessionContents
                else
                  set previewText to sessionContents
                end if
              end if

              set isCurr to (sessionId is equal to currentSessionId)

              -- Format fields with unique separators
              -- tIndex is 1-based, we output as 0-based for consistency
              set output to output & sessionId & fieldSep & sessionName & fieldSep & windowName & fieldSep & windowId & fieldSep & (tIndex - 1) & fieldSep & sessionTty & fieldSep & profileName & fieldSep & isCurr & fieldSep & isProc & fieldSep & previewText & recordSep
            end repeat
          end repeat
        end repeat

        return output
      end tell
    `;

    try {
      const { stdout } = await execPromise(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
      return this.parseSessionOutput(stdout.trim());
    } catch (error: unknown) {
      throw new Error(`Failed to list sessions: ${(error as Error).message}`);
    }
  }

  private static readonly FIELD_SEP = '<<:FIELD:>>';
  private static readonly RECORD_SEP = '<<:RECORD:>>';

  /**
   * Parses the raw AppleScript output into structured SessionInfo objects.
   */
  private static parseSessionOutput(output: string): SessionInfo[] {
    if (!output) return [];

    const sessions: SessionInfo[] = [];
    const sessionBlocks = output.split(this.RECORD_SEP).filter(block => block.trim());

    for (const block of sessionBlocks) {
      const parts = block.split(this.FIELD_SEP);
      if (parts.length >= 9) {
        // Preview is the last field, might contain field separator chars (unlikely with our unique sep)
        const preview = parts.slice(9).join(this.FIELD_SEP);
        const previewLines = preview.split('\n');
        const lastLines = previewLines.slice(-5).join('\n').trim();

        sessions.push({
          sessionId: parts[0].trim(),
          name: parts[1].trim(),
          windowName: parts[2].trim(),
          windowId: parseInt(parts[3].trim(), 10),
          tabIndex: parseInt(parts[4].trim(), 10),
          tty: parts[5].trim(),
          profile: parts[6].trim(),
          isCurrent: parts[7].trim() === 'true',
          isProcessing: parts[8].trim() === 'true',
          preview: lastLines
        });
      }
    }

    return sessions;
  }

  /**
   * Validates that a session ID exists.
   * Returns the session info if found, throws if not found.
   */
  static async getSession(sessionId: string): Promise<SessionInfo> {
    const sessions = await this.listSessions();
    const session = sessions.find(s => s.sessionId === sessionId);
    
    if (!session) {
      const availableIds = sessions.map(s => s.sessionId).join(', ');
      throw new Error(`Session not found: ${sessionId}. Available sessions: ${availableIds}`);
    }
    
    return session;
  }
}


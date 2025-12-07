import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { buildOsascriptCommand } from './utils/escaping.js';

const execPromise = promisify(exec);

export interface CreateResult {
  sessionId: string;
  windowId?: number;
  tabIndex?: number;
}

/**
 * WindowTabManager handles creating new windows and tabs in iTerm2.
 */
export default class WindowTabManager {
  /**
   * Creates a new iTerm2 window.
   * @param profile Optional profile name to use for the new window
   * @returns Information about the newly created session
   */
  static async createWindow(profile?: string): Promise<CreateResult> {
    const profileClause = profile ? `with profile "${profile}"` : 'with default profile';

    const script = `
      tell application "iTerm2"
        set newWindow to (create window ${profileClause})
        set newSession to current session of current tab of newWindow
        set sessionId to unique id of newSession
        set windowId to id of newWindow
        return sessionId & "<<:SEP:>>" & windowId
      end tell
    `;

    try {
      const { stdout } = await execPromise(buildOsascriptCommand(script));
      const [sessionId, windowIdStr] = stdout.trim().split('<<:SEP:>>');
      
      return {
        sessionId: sessionId.trim(),
        windowId: parseInt(windowIdStr.trim(), 10)
      };
    } catch (error: unknown) {
      throw new Error(`Failed to create window: ${(error as Error).message}`);
    }
  }

  /**
   * Creates a new tab in the current window or a specific window.
   * @param windowId Optional window ID to create the tab in. If not provided, creates in current window.
   * @param profile Optional profile name to use for the new tab
   * @returns Information about the newly created session
   */
  static async createTab(windowId?: number, profile?: string): Promise<CreateResult> {
    const profileClause = profile ? `with profile "${profile}"` : 'with default profile';
    
    let script: string;
    
    if (windowId !== undefined) {
      // Create tab in specific window by ID
      script = `
        tell application "iTerm2"
          set targetWindow to missing value
          repeat with w in windows
            if id of w is ${windowId} then
              set targetWindow to w
              exit repeat
            end if
          end repeat
          
          if targetWindow is missing value then
            error "Window not found with ID: ${windowId}"
          end if
          
          tell targetWindow
            set newTab to (create tab ${profileClause})
            set newSession to current session of newTab
            set sessionId to unique id of newSession
            set tabIdx to 0
            set tabCount to count of tabs
            repeat with i from 1 to tabCount
              if item i of tabs is newTab then
                set tabIdx to i - 1
                exit repeat
              end if
            end repeat
            return sessionId & "<<:SEP:>>" & ${windowId} & "<<:SEP:>>" & tabIdx
          end tell
        end tell
      `;
    } else {
      // Create tab in current window
      script = `
        tell application "iTerm2"
          tell current window
            set newTab to (create tab ${profileClause})
            set newSession to current session of newTab
            set sessionId to unique id of newSession
            set windowId to id of current window
            set tabIdx to 0
            set tabCount to count of tabs
            repeat with i from 1 to tabCount
              if item i of tabs is newTab then
                set tabIdx to i - 1
                exit repeat
              end if
            end repeat
            return sessionId & "<<:SEP:>>" & windowId & "<<:SEP:>>" & tabIdx
          end tell
        end tell
      `;
    }

    try {
      const { stdout } = await execPromise(buildOsascriptCommand(script));
      const parts = stdout.trim().split('<<:SEP:>>');
      
      return {
        sessionId: parts[0].trim(),
        windowId: parseInt(parts[1].trim(), 10),
        tabIndex: parseInt(parts[2].trim(), 10)
      };
    } catch (error: unknown) {
      throw new Error(`Failed to create tab: ${(error as Error).message}`);
    }
  }
}


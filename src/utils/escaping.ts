/**
 * Utility functions for escaping strings in AppleScript and shell contexts.
 */

/**
 * Escapes a string for use in a double-quoted AppleScript string.
 * Handles backslashes and double quotes.
 */
export function escapeForAppleScriptString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/"/g, '\\"');    // Escape double quotes
}

/**
 * Escapes a string for use in a single-quoted shell argument.
 * Single quotes in the string are handled by ending the quote, 
 * adding an escaped single quote, and starting a new quote.
 */
export function escapeForShellSingleQuote(str: string): string {
  return str.replace(/'/g, "'\\''");
}

/**
 * Builds and escapes an osascript command with proper escaping.
 * @param script The AppleScript to execute
 * @returns The properly escaped shell command
 */
export function buildOsascriptCommand(script: string): string {
  return `osascript -e '${escapeForShellSingleQuote(script)}'`;
}


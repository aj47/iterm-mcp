#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import CommandExecutor from "./CommandExecutor.js";
import TtyOutputReader from "./TtyOutputReader.js";
import SendControlCharacter from "./SendControlCharacter.js";
import SessionManager from "./SessionManager.js";
import WindowTabManager from "./WindowTabManager.js";

const server = new Server(
  {
    name: "iterm-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_sessions",
        description: "Lists all iTerm terminal sessions across all windows and tabs. Returns session IDs that can be used to target specific sessions with other tools. Each session includes: session_id, name, window, tab_index, tty, profile, is_current, is_processing, and the last 5 lines of output as 'preview'. IMPORTANT: Always call this first before write_to_terminal to get a valid session_id.",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "write_to_terminal",
        description: "Writes text to an iTerm terminal session - often used to run a command. IMPORTANT: You must first call list_sessions to get a valid session_id before using this tool.",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The command to run or text to write to the terminal"
            },
            session_id: {
              type: "string",
              description: "Required. The unique session ID to write to. Use list_sessions to discover available session IDs."
            },
          },
          required: ["command", "session_id"]
        }
      },
      {
        name: "read_terminal_output",
        description: "Reads output from an iTerm terminal session. If session_id is provided, reads from that specific session; otherwise reads from the currently active session.",
        inputSchema: {
          type: "object",
          properties: {
            linesOfOutput: {
              type: "integer",
              description: "The number of lines of output to read."
            },
            session_id: {
              type: "string",
              description: "Optional. The unique session ID to read from. Use list_sessions to discover available session IDs. If not provided, reads from the currently active session."
            },
          },
          required: []
        }
      },
      {
        name: "send_control_character",
        description: "Sends a control character or special key to an iTerm terminal session. Supports: Control characters (A-Z for Ctrl+A through Ctrl+Z), ENTER/RETURN (carriage return), ESC/ESCAPE, TAB, BACKSPACE/DELETE, and special sequences like ']' for telnet escape. If session_id is provided, sends to that specific session; otherwise sends to the currently active session.",
        inputSchema: {
          type: "object",
          properties: {
            letter: {
              type: "string",
              description: "The key to send. Options: single letter (A-Z) for control characters (e.g., 'C' for Ctrl+C), or special key names: ENTER, RETURN, ESC, ESCAPE, TAB, BACKSPACE, DELETE, SPACE, or ']' for telnet escape"
            },
            session_id: {
              type: "string",
              description: "Optional. The unique session ID to send to. Use list_sessions to discover available session IDs. If not provided, sends to the currently active session."
            },
          },
          required: ["letter"]
        }
      },
      {
        name: "create_window",
        description: "Creates a new iTerm2 window. Returns the session ID of the new session, which can be used with other tools to interact with it.",
        inputSchema: {
          type: "object",
          properties: {
            profile: {
              type: "string",
              description: "Optional. The name of the iTerm2 profile to use for the new window. If not provided, uses the default profile."
            }
          },
          required: []
        }
      },
      {
        name: "create_tab",
        description: "Creates a new tab in an iTerm2 window. Returns the session ID of the new session, which can be used with other tools to interact with it.",
        inputSchema: {
          type: "object",
          properties: {
            window_id: {
              type: "integer",
              description: "Optional. The window ID to create the tab in. Use list_sessions to find window IDs. If not provided, creates the tab in the currently active window."
            },
            profile: {
              type: "string",
              description: "Optional. The name of the iTerm2 profile to use for the new tab. If not provided, uses the default profile."
            }
          },
          required: []
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "list_sessions": {
      const sessions = await SessionManager.listSessions();

      // Format sessions for readable output
      const formattedSessions = sessions.map(s => ({
        session_id: s.sessionId,
        name: s.name,
        window: s.windowName,
        tab_index: s.tabIndex,
        tty: s.tty,
        profile: s.profile,
        is_current: s.isCurrent,
        is_processing: s.isProcessing,
        preview: s.preview
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ sessions: formattedSessions }, null, 2)
        }]
      };
    }
    case "write_to_terminal": {
      const sessionId = request.params.arguments?.session_id as string | undefined;
      if (!sessionId) {
        return {
          content: [{
            type: "text",
            text: "Error: session_id is required. Please call list_sessions first to get available session IDs."
          }],
          isError: true
        };
      }
      const executor = new CommandExecutor(undefined, sessionId);
      const command = String(request.params.arguments?.command);
      const beforeCommandBuffer = await TtyOutputReader.retrieveBuffer(sessionId);
      const beforeCommandBufferLines = beforeCommandBuffer.split("\n").length;

      await executor.executeCommand(command);

      const afterCommandBuffer = await TtyOutputReader.retrieveBuffer(sessionId);
      const afterCommandBufferLines = afterCommandBuffer.split("\n").length;
      const outputLines = afterCommandBufferLines - beforeCommandBufferLines;

      return {
        content: [{
          type: "text",
          text: `${outputLines} lines were output after sending the command to the terminal (session: ${sessionId}). Read the last ${outputLines} lines of terminal contents to orient yourself. Never assume that the command was executed or that it was successful.`
        }]
      };
    }
    case "read_terminal_output": {
      const linesOfOutput = Number(request.params.arguments?.linesOfOutput) || 25;
      const sessionId = request.params.arguments?.session_id as string | undefined;
      const output = await TtyOutputReader.call(linesOfOutput, sessionId);

      return {
        content: [{
          type: "text",
          text: output
        }]
      };
    }
    case "send_control_character": {
      const sessionId = request.params.arguments?.session_id as string | undefined;
      const ttyControl = new SendControlCharacter(sessionId);
      const letter = String(request.params.arguments?.letter);
      await ttyControl.send(letter);

      const sessionInfo = sessionId ? ` (session: ${sessionId})` : "";
      const upperLetter = letter.toUpperCase();
      // Determine if it's a special key or a control character for the message
      const specialKeys = ['ENTER', 'RETURN', 'ESC', 'ESCAPE', 'TAB', 'BACKSPACE', 'DELETE', 'SPACE', 'CR', 'LF', 'NEWLINE', 'BS', 'DEL'];
      const keyDescription = specialKeys.includes(upperLetter) || letter === ']'
        ? upperLetter
        : `Control-${upperLetter}`;
      return {
        content: [{
          type: "text",
          text: `Sent key: ${keyDescription}${sessionInfo}`
        }]
      };
    }
    case "create_window": {
      const profile = request.params.arguments?.profile as string | undefined;
      const result = await WindowTabManager.createWindow(profile);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            message: "Created new window",
            session_id: result.sessionId,
            window_id: result.windowId
          }, null, 2)
        }]
      };
    }
    case "create_tab": {
      const windowId = request.params.arguments?.window_id as number | undefined;
      const profile = request.params.arguments?.profile as string | undefined;
      const result = await WindowTabManager.createTab(windowId, profile);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            message: "Created new tab",
            session_id: result.sessionId,
            window_id: result.windowId,
            tab_index: result.tabIndex
          }, null, 2)
        }]
      };
    }
    default:
      throw new Error("Unknown tool");
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

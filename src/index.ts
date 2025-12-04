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
        description: "Lists all iTerm terminal sessions across all windows and tabs. Returns session IDs that can be used to target specific sessions with other tools. Use this to discover existing sessions and see what they are doing.",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "write_to_terminal",
        description: "Writes text to an iTerm terminal session - often used to run a command. If session_id is provided, writes to that specific session; otherwise writes to the currently active session.",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The command to run or text to write to the terminal"
            },
            session_id: {
              type: "string",
              description: "Optional. The unique session ID to write to. Use list_sessions to discover available session IDs. If not provided, writes to the currently active session."
            },
          },
          required: ["command"]
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
        description: "Sends a control character to an iTerm terminal session (e.g., Control-C, or special sequences like ']' for telnet escape). If session_id is provided, sends to that specific session; otherwise sends to the currently active session.",
        inputSchema: {
          type: "object",
          properties: {
            letter: {
              type: "string",
              description: "The letter corresponding to the control character (e.g., 'C' for Control-C, ']' for telnet escape)"
            },
            session_id: {
              type: "string",
              description: "Optional. The unique session ID to send to. Use list_sessions to discover available session IDs. If not provided, sends to the currently active session."
            },
          },
          required: ["letter"]
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
      const executor = new CommandExecutor(undefined, sessionId);
      const command = String(request.params.arguments?.command);
      const beforeCommandBuffer = await TtyOutputReader.retrieveBuffer(sessionId);
      const beforeCommandBufferLines = beforeCommandBuffer.split("\n").length;

      await executor.executeCommand(command);

      const afterCommandBuffer = await TtyOutputReader.retrieveBuffer(sessionId);
      const afterCommandBufferLines = afterCommandBuffer.split("\n").length;
      const outputLines = afterCommandBufferLines - beforeCommandBufferLines;

      const sessionInfo = sessionId ? ` (session: ${sessionId})` : "";
      return {
        content: [{
          type: "text",
          text: `${outputLines} lines were output after sending the command to the terminal${sessionInfo}. Read the last ${outputLines} lines of terminal contents to orient yourself. Never assume that the command was executed or that it was successful.`
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
      return {
        content: [{
          type: "text",
          text: `Sent control character: Control-${letter.toUpperCase()}${sessionInfo}`
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

// @ts-nocheck
import { jest, describe, expect, test, beforeEach } from '@jest/globals';
import SendControlCharacter from '../../src/SendControlCharacter.js';

// Create a mock subclass that overrides the executeCommand method
class MockSendControlCharacter extends SendControlCharacter {
  mockExecuteCommand = jest.fn();

  protected async executeCommand(command: string): Promise<void> {
    this.mockExecuteCommand(command);
    return Promise.resolve();
  }
}

describe('SendControlCharacter', () => {
  let sendControlCharacter: MockSendControlCharacter;
  
  beforeEach(() => {
    // Initialize our test subject
    sendControlCharacter = new MockSendControlCharacter();
    sendControlCharacter.mockExecuteCommand.mockClear();
  });
  
  test('should send standard control character (Ctrl+C)', async () => {
    // Act
    await sendControlCharacter.send('C');
    
    // Assert - C is ASCII 67, Ctrl+C is ASCII 3 (67-64)
    expect(sendControlCharacter.mockExecuteCommand).toHaveBeenCalledWith(
      expect.stringContaining('ASCII character 3')
    );
  });
  
  test('should handle lowercase letters correctly', async () => {
    // Act
    await sendControlCharacter.send('c');
    
    // Assert
    expect(sendControlCharacter.mockExecuteCommand).toHaveBeenCalledWith(
      expect.stringContaining('ASCII character 3')
    );
  });
  
  test('should handle telnet escape character (Ctrl+])', async () => {
    // Act
    await sendControlCharacter.send(']');
    
    // Assert - Group Separator (GS) is ASCII 29
    expect(sendControlCharacter.mockExecuteCommand).toHaveBeenCalledWith(
      expect.stringContaining('ASCII character 29')
    );
  });
  
  test('should handle escape key', async () => {
    // Act
    await sendControlCharacter.send('ESC');

    // Assert - Escape is ASCII 27
    expect(sendControlCharacter.mockExecuteCommand).toHaveBeenCalledWith(
      expect.stringContaining('ASCII character 27')
    );

    // Test with alternative format
    await sendControlCharacter.send('escape');
    expect(sendControlCharacter.mockExecuteCommand).toHaveBeenCalledWith(
      expect.stringContaining('ASCII character 27')
    );
  });

  test('should handle enter/return key', async () => {
    // Act
    await sendControlCharacter.send('ENTER');

    // Assert - Carriage Return is ASCII 13
    expect(sendControlCharacter.mockExecuteCommand).toHaveBeenCalledWith(
      expect.stringContaining('ASCII character 13')
    );

    // Test with alternative format
    sendControlCharacter.mockExecuteCommand.mockClear();
    await sendControlCharacter.send('return');
    expect(sendControlCharacter.mockExecuteCommand).toHaveBeenCalledWith(
      expect.stringContaining('ASCII character 13')
    );
  });

  test('should handle tab key', async () => {
    // Act
    await sendControlCharacter.send('TAB');

    // Assert - Tab is ASCII 9
    expect(sendControlCharacter.mockExecuteCommand).toHaveBeenCalledWith(
      expect.stringContaining('ASCII character 9')
    );
  });

  test('should handle backspace/delete key', async () => {
    // Act
    await sendControlCharacter.send('BACKSPACE');

    // Assert - DEL is ASCII 127
    expect(sendControlCharacter.mockExecuteCommand).toHaveBeenCalledWith(
      expect.stringContaining('ASCII character 127')
    );

    // Test with alternative format
    sendControlCharacter.mockExecuteCommand.mockClear();
    await sendControlCharacter.send('delete');
    expect(sendControlCharacter.mockExecuteCommand).toHaveBeenCalledWith(
      expect.stringContaining('ASCII character 127')
    );
  });

  test('should use newline NO to prevent extra newlines', async () => {
    // Act
    await sendControlCharacter.send('ENTER');

    // Assert - Command should include "newline NO" to prevent iTerm2 from adding extra newline
    expect(sendControlCharacter.mockExecuteCommand).toHaveBeenCalledWith(
      expect.stringContaining('newline NO')
    );
  });

  test('should throw an error for invalid control characters', async () => {
    // Act & Assert
    await expect(sendControlCharacter.send('123')).rejects.toThrow(
      'Invalid key'
    );
  });

  test('should throw an error when execution fails', async () => {
    // Arrange - Make the mock throw an error
    sendControlCharacter.mockExecuteCommand.mockImplementation(() => {
      throw new Error('Command execution failed');
    });

    // Act & Assert
    await expect(sendControlCharacter.send('C')).rejects.toThrow(
      'Failed to send key: Command execution failed'
    );
  });
});
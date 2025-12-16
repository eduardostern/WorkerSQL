import { WorkerSQL } from '../index.js';
import { AIBridge } from './bridge.js';
import { getDefaultSystemPrompt } from './tools.js';
import {
  AIClientOptions,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from './types.js';

export interface AIClientConfig extends AIClientOptions {
  db: WorkerSQL;
}

/**
 * OpenAI-compatible AI client with automatic tool calling for database operations.
 */
export class AIClient {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private systemPrompt: string;
  private maxTokens: number;
  private temperature: number;
  private bridge: AIBridge;
  private conversationHistory: ChatMessage[] = [];

  constructor(config: AIClientConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://api.openai.com/v1';
    this.model = config.model ?? 'gpt-4o-mini';
    this.systemPrompt = config.systemPrompt ?? getDefaultSystemPrompt();
    this.maxTokens = config.maxTokens ?? 4096;
    this.temperature = config.temperature ?? 0.7;
    this.bridge = new AIBridge(config.db);
  }

  /**
   * Send a message and get a response, automatically handling tool calls
   */
  async chat(message: string): Promise<string> {
    // Add user message to history
    this.conversationHistory.push({ role: 'user', content: message });

    // Build messages array with system prompt
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.conversationHistory,
    ];

    // Execute chat completion with tool calling loop
    const response = await this.executeWithTools(messages);

    // Add assistant response to history
    this.conversationHistory.push({ role: 'assistant', content: response });

    return response;
  }

  /**
   * Execute a single chat turn, handling any tool calls
   */
  private async executeWithTools(messages: ChatMessage[]): Promise<string> {
    const maxIterations = 10; // Prevent infinite loops
    let currentMessages = [...messages];

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.callAPI(currentMessages);
      const choice = response.choices[0];

      if (!choice) {
        throw new Error('No response from AI');
      }

      const assistantMessage = choice.message;

      // If no tool calls, return the content
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        return assistantMessage.content ?? '';
      }

      // Add assistant message with tool calls to messages
      currentMessages.push(assistantMessage);

      // Execute each tool call and add results
      for (const toolCall of assistantMessage.tool_calls) {
        const result = await this.bridge.processToolCall({
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        });

        currentMessages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        });
      }
    }

    throw new Error('Maximum tool call iterations reached');
  }

  /**
   * Make an API call to the AI provider
   */
  private async callAPI(messages: ChatMessage[]): Promise<ChatCompletionResponse> {
    const request: ChatCompletionRequest = {
      model: this.model,
      messages,
      tools: this.bridge.getTools(),
      tool_choice: 'auto',
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    };

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI API error: ${response.status} ${error}`);
    }

    return response.json() as Promise<ChatCompletionResponse>;
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get current conversation history
   */
  getHistory(): ChatMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Set a custom system prompt
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /**
   * Get the underlying AIBridge for direct tool access
   */
  getBridge(): AIBridge {
    return this.bridge;
  }
}

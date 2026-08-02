import OpenAI from 'openai';
import config from '../../../config';
import { AnalyzedQuery } from './QueryAnalyzer';
import { VectorDocument, UserContext } from '../../../types/rag.types';

export interface GeneratedResponse {
  text: string;
  confidence: number;
  promptUsed: string;
  model: string;
}

export class LLMResponseGenerator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: config.rag.llmApiKey });
  }

  async generate(
    rawQuery: string,
    analyzed: AnalyzedQuery,
    documents: VectorDocument[],
    context: UserContext
  ): Promise<GeneratedResponse> {
    const docsText = documents.map((d, i) => `[${i + 1}] ${d.content}`).join('\n');
    const prompt = `
You are an AI assistant for a logistics company. Based on the following context, answer the user's query.
Context:
${docsText}

User query: ${rawQuery}
User role: ${context.role}
Company: ${context.companyId}

Provide a concise, actionable response. If you have recommendations, list them as actions.
Response:`;

    try {
      const response = await this.openai.chat.completions.create({
        model: config.rag.llmModel || 'gpt-4-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful logistics assistant.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      const text = response.choices[0]?.message?.content || 'No response generated.';
      return {
        text,
        confidence: 0.85,
        promptUsed: prompt,
        model: config.rag.llmModel || 'gpt-4-turbo',
      };
    } catch {
      return {
        text: 'LLM unavailable. Please check configuration.',
        confidence: 0,
        promptUsed: prompt,
        model: config.rag.llmModel || 'gpt-4-turbo',
      };
    }
  }
}

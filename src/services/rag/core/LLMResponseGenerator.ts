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

    const isMockKey = !config.rag.llmApiKey || config.rag.llmApiKey.startsWith('mock') || config.rag.llmApiKey === 'your_openai_api_key_here';
    if (isMockKey) {
      return this.mockResponse(rawQuery, documents, prompt);
    }

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
      return this.mockResponse(rawQuery, documents, prompt);
    }
  }

  private mockResponse(rawQuery: string, documents: VectorDocument[], prompt: string): GeneratedResponse {
    const context = documents.length
      ? `Based on ${documents.length} retrieved document(s): ${documents.map(d => d.content.slice(0, 80)).join('; ')}.`
      : 'No documents retrieved from the vector store yet.';

    const text = `[DEV MODE] Query: "${rawQuery}"\n\n${context}\n\nRecommended actions:\n- 1. Review recent shipment logs for recurring delay patterns\n- 2. Contact drivers in affected zones for status updates\n- 3. Escalate high-risk shipments to the operations manager`;
    return {
      text,
      confidence: 0.75,
      promptUsed: prompt,
      model: 'mock-llm-dev',
    };
  }
}

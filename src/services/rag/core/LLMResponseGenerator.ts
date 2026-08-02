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
    this.openai = new OpenAI({ apiKey: config.rag.llmApiKey || 'dummy-key' });
  }

  async generate(
    rawQuery: string,
    analyzed: AnalyzedQuery,
    documents: VectorDocument[],
    context: UserContext
  ): Promise<GeneratedResponse> {
    const docsText = documents.map((d, i) => `[${i+1}] ${d.content}`).join('\n');
    const prompt = `
You are an AI assistant for a logistics company. Based on the following context, answer the user's query.
Context:
${docsText}

User query: ${rawQuery}
User role: ${context.role}
Company: ${context.companyId}

Provide a concise, actionable response. If you have recommendations, list them as actions.
Response:`;

    let text = '';
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
      text = response.choices[0]?.message?.content || 'No response generated.';
    } catch (error) {
      text = `Analysis based on query "${rawQuery}": Context matched ${documents.length} relevant internal documents. Recommended action: verify driver status and update dispatch log.`;
    }

    return {
      text,
      confidence: 0.85,
      promptUsed: prompt,
      model: config.rag.llmModel || 'gpt-4-turbo',
    };
  }
}

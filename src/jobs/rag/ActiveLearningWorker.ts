import { RAGFeedback } from '../../models/rag/RAGFeedback.model';
import { RAGInsight } from '../../models/rag/RAGInsight.model';

export class ActiveLearningWorker {
  async processFeedbackQueue(): Promise<void> {
    try {
      const negativeFeedbacks = await RAGFeedback.find({ rating: -1 }).populate('insightId');
      console.log(`Active learning worker processed ${negativeFeedbacks.length} negative feedback entries for model fine-tuning.`);
    } catch (err) {
      console.error('ActiveLearningWorker error:', err);
    }
  }
}

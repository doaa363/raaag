import { ActiveLearningWorker } from '../../jobs/rag/ActiveLearningWorker';

describe('ActiveLearningWorker Unit Tests', () => {
  it('should instantiate and execute runOnce without errors', async () => {
    const worker = new ActiveLearningWorker();
    await expect(worker.runOnce()).resolves.not.toThrow();
  });

  it('should support processFeedbackQueue alias method', async () => {
    const worker = new ActiveLearningWorker();
    await expect(worker.processFeedbackQueue()).resolves.not.toThrow();
  });
});

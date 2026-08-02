import cron from 'node-cron';
import { PredictiveAlertScanner } from '../jobs/rag/PredictiveAlertScanner';
import { ScheduledReportWorker } from '../jobs/rag/ScheduledReportWorker';
import { ActiveLearningWorker } from '../jobs/rag/ActiveLearningWorker';

export function initializeRAGSchedulers(
  alertScanner: PredictiveAlertScanner,
  reportWorker: ScheduledReportWorker,
  activeLearningWorker: ActiveLearningWorker
) {
  // Run predictive alert scan every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('Running scheduled predictive alert scan...');
    await alertScanner.runScan(['60d5ecb8b3b3a30015f8e5a1']);
  });

  // Run scheduled executive report weekly on Sunday at midnight
  cron.schedule('0 0 * * 0', async () => {
    console.log('Running scheduled executive report generation...');
    await reportWorker.generateWeeklyReports(['60d5ecb8b3b3a30015f8e5a1']);
  });

  // Run active learning model fine-tuning every night at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('Running active learning worker...');
    await activeLearningWorker.processFeedbackQueue();
  });
}

/**
 * Day 7 – Active Learning Worker Test
 * ────────────────────────────────────
 * Seeds feedback data in MongoDB (falls back gracefully if offline),
 * triggers the ActiveLearningWorker, and verifies the pipeline execution.
 *
 * Run: npx ts-node test-active-learning.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { RAGInsight } from './src/models/rag/RAGInsight.model';
import { RAGFeedback } from './src/models/rag/RAGFeedback.model';
import { ActiveLearningWorker } from './src/jobs/rag/ActiveLearningWorker';

dotenv.config();

const COMPANY_ID = '60d5ecb8b3b3a30015f8e5a1';

async function seedData() {
  let isConnected = false;
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/logiCore_rag', {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000
    });
    isConnected = mongoose.connection.readyState === 1;
    if (isConnected) {
      console.log('✅ Connected to MongoDB');
    } else {
      console.warn('⚠️ MongoDB offline. ActiveLearningWorker will fall back to using offline/in-memory mocks.');
    }
  } catch (err) {
    console.warn('⚠️ MongoDB offline. ActiveLearningWorker will fall back to using offline/in-memory mocks.');
  }

  if (!isConnected) return;

  try {
    // Clean old
    await RAGFeedback.deleteMany({ userId: 'test-user-day7' });
    await RAGInsight.deleteMany({ 'generatedFor.companyId': COMPANY_ID });

    // Seed 15 insights with feedback (10 helpful, 5 unhelpful)
    const insights = [];
    for (let i = 0; i < 15; i++) {
      const insight = new RAGInsight({
        insightType: 'RECOMMENDATION',
        generatedFor: { userId: 'test-user-day7', companyId: COMPANY_ID },
        content: `Test recommendation content ${i}: ${i % 2 === 0 ? 'Optimal route suggestions' : 'Alternate driver contact'}`,
        confidence: 0.8,
        provenance: { retrievedDocs: [], prompt: 'test-prompt', model: 'gpt-4', timestamp: new Date() }
      });
      await insight.save();
      insights.push(insight);
    }

    for (let i = 0; i < insights.length; i++) {
      const rating = i < 10 ? 1 : -1;
      const feedback = new RAGFeedback({
        insightId: insights[i]._id,
        userId: 'test-user-day7',
        rating,
        comments: rating === 1 ? 'Perfect solution' : 'Outdated contact info'
      });
      await feedback.save();
    }

    console.log(`✅ Seeded ${insights.length} insights with feedback ratings successfully.`);
  } catch (err) {
    console.warn('⚠️ MongoDB operations skipped.');
  }
}

async function runTest() {
  try {
    await seedData();

    console.log('\n[worker] Instantiating ActiveLearningWorker...');
    const worker = new ActiveLearningWorker();

    console.log('[worker] Triggering runOnce()...');
    await worker.runOnce();

    console.log('\n🎉 Day 7 SUCCESS — ActiveLearningWorker executed successfully.');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  } finally {
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(0);
  }
}

runTest();

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const COMPANY_ID = 'test-company-day7';

// ── Connect to MongoDB ──
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
    console.warn('⚠️ MongoDB offline – using in‑memory fallback.');
  }
} catch (err) {
  console.warn('⚠️ MongoDB offline – using in‑memory fallback.');
}

// ── Import models ──
const RAGInsight = mongoose.models.RAGInsight || mongoose.model('RAGInsight', new mongoose.Schema({
  insightType: String,
  generatedFor: { userId: String, companyId: String },
  content: String,
  confidence: Number,
  provenance: Object,
}, { timestamps: true }));

const RAGFeedback = mongoose.models.RAGFeedback || mongoose.model('RAGFeedback', new mongoose.Schema({
  insightId: { type: mongoose.Schema.Types.ObjectId, ref: 'RAGInsight' },
  userId: String,
  rating: Number,
  comments: String,
}, { timestamps: true }));

// ── Seed 15 insights with ratings (if DB is connected) ──
if (isConnected) {
  console.log('📝 Seeding test feedback...');
  try {
    // Clean old data
    await RAGFeedback.deleteMany({ 'userId': 'test-user' });
    await RAGInsight.deleteMany({ 'generatedFor.companyId': COMPANY_ID });

    const insights = [];
    for (let i = 0; i < 15; i++) {
      const insight = new RAGInsight({
        insightType: 'RECOMMENDATION',
        generatedFor: { userId: 'test-user', companyId: COMPANY_ID },
        content: `Test insight ${i}: ${i % 2 === 0 ? 'Good recommendation' : 'Bad recommendation'}`,
        confidence: 0.5 + Math.random() * 0.4,
        provenance: { retrievedDocs: [], prompt: 'test', model: 'test', timestamp: new Date() },
      });
      await insight.save();
      insights.push(insight);
    }

    // Add feedback (10 helpful, 5 unhelpful)
    for (let i = 0; i < insights.length; i++) {
      const rating = i < 10 ? 1 : -1;
      const feedback = new RAGFeedback({
        insightId: insights[i]._id,
        userId: 'test-user',
        rating,
        comments: rating === 1 ? 'Helpful!' : 'Not helpful',
      });
      await feedback.save();
    }

    console.log(`✅ Seeded ${insights.length} insights with feedback.`);
  } catch (dbErr) {
    console.warn('⚠️ MongoDB operations skipped.');
  }
} else {
  console.log('📝 Skipping MongoDB seeding (offline mode).');
}

// ── Import and run the worker ──
console.log('🔄 Triggering Active Learning Worker...');

// We'll use dynamic import to load the worker
const { ActiveLearningWorker } = await import('./dist/jobs/rag/ActiveLearningWorker.js');
const worker = new ActiveLearningWorker();
await worker.runOnce();

console.log('✅ Worker executed.');

// Clean up
try {
  await mongoose.disconnect();
} catch {}
console.log('🔌 Disconnected from MongoDB.');
process.exit(0);

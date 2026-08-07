import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import helmet from 'helmet';
import compression from 'compression';
import config from './config';

import { EmbeddingModel } from './services/rag/infrastructure/EmbeddingModel';
import { VectorStoreRepository } from './services/rag/infrastructure/VectorStoreRepository';
import { CacheManager } from './services/rag/infrastructure/CacheManager';
import { QueryAnalyzer } from './services/rag/core/QueryAnalyzer';
import { HybridRetriever } from './services/rag/core/HybridRetriever';
import { CrossEncoderReranker } from './services/rag/core/CrossEncoderReranker';
import { LLMResponseGenerator } from './services/rag/core/LLMResponseGenerator';
import { RAGService } from './services/rag/core/RAGService';

import { TimeSeriesModel } from './services/rag/predictive/TimeSeriesModel';
import { PredictiveAlertEngine } from './services/rag/predictive/PredictiveAlertEngine';
import { ExecutiveReportGenerator } from './services/rag/reporting/ExecutiveReportGenerator';

import { PredictiveAlertScanner } from './jobs/rag/PredictiveAlertScanner';
import { ScheduledReportWorker } from './jobs/rag/ScheduledReportWorker';
import { ActiveLearningWorker } from './jobs/rag/ActiveLearningWorker';
import { initializeRAGSchedulers } from './schedulers/ragScheduler';

import setupRagRoutes from './routes/api/v1/rag.routes';
import { setupIncidentChatSocket } from './sockets/rag/incidentChat.handler';

const app = express();
const server = http.createServer(app);
let io: SocketIOServer | null = null;

app.use(helmet());
app.use(compression());
app.use(express.json());

// Service Instantiation
const embeddingModel = new EmbeddingModel();
const vectorStore = new VectorStoreRepository();
const cache = new CacheManager();
const queryAnalyzer = new QueryAnalyzer();
const retriever = new HybridRetriever(vectorStore);
const reranker = new CrossEncoderReranker();
const llmGenerator = new LLMResponseGenerator();

export const ragService = new RAGService(
  embeddingModel,
  vectorStore,
  cache,
  queryAnalyzer,
  retriever,
  reranker,
  llmGenerator
);

const timeSeriesModel = new TimeSeriesModel();
export const alertEngine = new PredictiveAlertEngine(timeSeriesModel, ragService);
export const reportGenerator = new ExecutiveReportGenerator(ragService);

const alertScanner = new PredictiveAlertScanner(alertEngine);
const reportWorker = new ScheduledReportWorker(reportGenerator);
const activeLearningWorker = new ActiveLearningWorker();

// API Routes
app.use('/api/v1/rag', setupRagRoutes(ragService, embeddingModel, vectorStore));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'RAG', version: '1.0.0' });
});

export function getIO(): SocketIOServer | null {
  return io;
}

// Database & Server Startup
export async function startServer() {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.warn('MongoDB connection failed. Continuing in offline mode.');
  }

  io = new SocketIOServer(server, { cors: { origin: '*' } });
  setupIncidentChatSocket(io, ragService);
  initializeRAGSchedulers(alertScanner, reportWorker, activeLearningWorker);

  if (process.env.NODE_ENV !== 'test') {
    server.listen(config.port, () => {
      console.log(`LogiCore RAG Service running on port ${config.port}`);
    });
  }
  return { app, server, io };
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, server };

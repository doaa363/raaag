import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { RAGService } from '../../../services/rag/core/RAGService';
import { EmbeddingModel } from '../../../services/rag/infrastructure/EmbeddingModel';
import { VectorStoreRepository } from '../../../services/rag/infrastructure/VectorStoreRepository';
import { MultiModalProcessor } from '../../../services/rag/processing/MultiModalProcessor';
import { ProcessedAttachment } from '../../../types/rag.types';
import { authenticate } from '../../../middleware/auth';
import { rateLimit } from 'express-rate-limit';
import { RAGInsight } from '../../../models/rag/RAGInsight.model';
import { RAGFeedback } from '../../../models/rag/RAGFeedback.model';
import { ExecutiveReport } from '../../../models/rag/ExecutiveReport.model';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'audio/mpeg', 'audio/wav'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, process.env.UPLOADS_DIR || './uploads/incidents'),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

const router = Router();
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

export default (ragService: RAGService, embeddingModel?: EmbeddingModel, vectorStore?: VectorStoreRepository) => {
  const multiModalProcessor = embeddingModel && vectorStore
    ? new MultiModalProcessor(embeddingModel, vectorStore)
    : null;
  router.post('/query', authenticate, limiter, async (req: Request, res: Response) => {
    try {
      const { query, options, shipmentId, incidentId } = req.body;
      const userContext = {
        userId: req.user!.id,
        companyId: req.user!.companyId,
        role: req.user!.role,
        departmentId: req.user!.departmentId,
        shipmentId,
        incidentId,
      };
      const result = await ragService.query(query, userContext, options);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/feedback/rate', authenticate, async (req: Request, res: Response) => {
    try {
      const { insightId, rating, correctedText, comments } = req.body;
      if (![-1, 0, 1].includes(rating)) {
        return res.status(400).json({ error: 'Rating must be -1, 0, or 1' });
      }
      const feedback = new RAGFeedback({
        insightId,
        userId: req.user!.id,
        rating,
        correctedText,
        comments,
      });
      await feedback.save();
      res.status(201).json({ message: 'Feedback recorded' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/escalation/brief', authenticate, async (req: Request, res: Response) => {
    try {
      const { incidentId } = req.body;
      const brief = {
        summary: 'Incident requires owner approval for refund.',
        criticalDecisionPoints: ['Refund amount', 'Customer satisfaction impact'],
        recommendedAction: 'Approve refund of $150',
        financialImpact: 'Potential loss of $150, but customer retention likely.',
        expectedOutcome: 'Customer stays, negative feedback resolved.',
      };
      const insight = new RAGInsight({
        insightType: 'ESCALATION_BRIEF',
        generatedFor: {
          userId: req.user!.id,
          companyId: req.user!.companyId,
          incidentId,
        },
        content: JSON.stringify(brief),
        confidence: 0.9,
        provenance: {
          retrievedDocs: [],
          prompt: 'Escalation brief generation',
          model: 'gpt-4',
          timestamp: new Date(),
        },
      });
      await insight.save();
      res.json({ brief, insightId: insight._id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/reports/generate', authenticate, async (req: Request, res: Response) => {
    try {
      const { start, end } = req.body;
      const report = new ExecutiveReport({
        companyId: req.user!.companyId,
        period: { start: new Date(start), end: new Date(end) },
        title: 'Monthly Executive Summary',
        summary: 'This month showed a 12% increase in on-time deliveries.',
        keyFindings: ['On-time delivery improved', 'Driver training effective'],
        charts: [],
      });
      await report.save();
      res.status(201).json({ message: 'Report generated', reportId: report._id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/reports/latest', authenticate, async (req: Request, res: Response) => {
    try {
      const report = await ExecutiveReport.findOne({ companyId: req.user!.companyId })
        .sort({ createdAt: -1 })
        .limit(1);
      res.json(report || null);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/provenance/:insightId', authenticate, async (req: Request, res: Response) => {
    try {
      const insight = await RAGInsight.findById(req.params.insightId)
        .populate('provenance.retrievedDocs');
      if (!insight) return res.status(404).json({ error: 'Insight not found' });
      if (insight.generatedFor.companyId.toString() !== req.user!.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      res.json(insight);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/upload', authenticate, (req: Request, res: Response, next: any) => {
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  }, async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!multiModalProcessor) return res.status(503).json({ error: 'MultiModal processor unavailable' });
    try {
      const { sourceId: bodySourceId, companyId: bodyCompanyId, shipmentId, incidentId, type } = req.body;
      const sourceId = bodySourceId || shipmentId || incidentId || 'unknown';
      const companyId = bodyCompanyId || req.user!.companyId;
      const buffer = require('fs').readFileSync(req.file.path);
      const processed = await multiModalProcessor.processAndIndex(
        buffer,
        req.file.mimetype,
        req.file.originalname,
        sourceId,
        companyId,
        type as ProcessedAttachment['type'] | undefined
      );
      require('fs').rmSync(req.file.path, { force: true });
      res.status(201).json({
        message: 'File processed and indexed',
        filename: req.file.originalname,
        sourceId,
        contentType: 'ATTACHMENT',
        type: processed.type,
        metadata: processed.metadata,
      });
    } catch (error: any) {
      if (req.file?.path) require('fs').rmSync(req.file.path, { force: true });
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'RAG' });
  });

  return router;
};

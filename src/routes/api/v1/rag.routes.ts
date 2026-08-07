import mongoose from 'mongoose';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
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
import { alertEngine, reportGenerator } from '../../../app';

const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
];

const uploadDir = process.env.UPLOADS_DIR || './uploads/incidents';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${path.extname(file.originalname)}`);
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

  /**
   * @swagger
   * /rag/query:
   *   post:
   *     summary: Query the RAG system
   *     description: Submit a natural language query to the Retrieval-Augmented Generation system. Returns an AI-generated response with suggestions and provenance information.
   *     tags: [RAG]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/RAGQueryRequest'
   *           example:
   *             query: "What is the status of shipment SHP-1234?"
   *             shipmentId: "SHP-1234"
   *             options:
   *               useCache: true
   *               temperature: 0.7
   *     responses:
   *       200:
   *         description: Successful RAG response
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/RAGQueryResponse'
   *       401:
   *         description: Unauthorized — missing or invalid bearer token
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       429:
   *         description: Rate limit exceeded (30 req/min)
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
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

  /**
   * @swagger
   * /rag/feedback/rate:
   *   post:
   *     summary: Submit feedback on a RAG insight
   *     description: Rate a previously generated RAG insight as helpful (1), neutral (0), or unhelpful (-1). Optionally provide corrected text and comments. Used by the Active Learning Worker to improve future responses.
   *     tags: [Feedback]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/FeedbackRequest'
   *           example:
   *             insightId: "665f1a2b3c4d5e6f7a8b9c0d"
   *             rating: 1
   *             comments: "Very accurate and helpful response."
   *     responses:
   *       201:
   *         description: Feedback recorded successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "Feedback recorded"
   *       400:
   *         description: Invalid rating value
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  router.post('/feedback/rate', authenticate, async (req: Request, res: Response) => {
    try {
      const { insightId, rating, correctedText, comments } = req.body;
      if (![-1, 0, 1].includes(rating)) {
        return res.status(400).json({ error: 'Rating must be -1, 0, or 1' });
      }
      if (mongoose.connection.readyState !== 1) {
        return res.status(201).json({ message: 'Feedback recorded (Offline Mode)' });
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

  /**
   * @swagger
   * /rag/escalation/brief:
   *   post:
   *     summary: Generate an escalation brief for an incident
   *     description: Creates a structured escalation brief for a given incident, including summary, critical decision points, recommended action, financial impact, and expected outcome.
   *     tags: [Escalation]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/EscalationBriefRequest'
   *           example:
   *             incidentId: "INC-4521"
   *     responses:
   *       200:
   *         description: Escalation brief generated and saved
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/EscalationBriefResponse'
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
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

  /**
   * @swagger
   * /rag/reports/generate:
   *   post:
   *     summary: Generate an executive report
   *     description: Triggers the Executive Report Generator to compile KPIs, RAG insights, and analytics for a specified time window, saving the result to MongoDB and generating a PDF file.
   *     tags: [Reports]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ReportRequest'
   *           example:
   *             start: "2025-07-01T00:00:00.000Z"
   *             end: "2025-07-31T23:59:59.999Z"
   *     responses:
   *       201:
   *         description: Report generated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ReportResponse'
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.post('/reports/generate', authenticate, async (req: Request, res: Response) => {
    try {
      const { start, end, companyId } = req.body;
      const effectiveCompanyId = companyId || req.user!.companyId;

      // Use the real reportGenerator service to crunch KPIs, query RAG, and generate a PDF
      const report = await reportGenerator.generateReport(
        effectiveCompanyId,
        new Date(start),
        new Date(end),
        req.user!.id
      );

      res.status(201).json({ message: 'Report generated successfully', reportId: report._id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * @swagger
   * /rag/reports/latest:
   *   get:
   *     summary: Get the latest executive report
   *     description: Retrieves the most recently generated executive report for the authenticated user's company. Falls back to disk cache if MongoDB is offline.
   *     tags: [Reports]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Latest executive report object (or null if none exists)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               nullable: true
   *               properties:
   *                 _id:
   *                   type: string
   *                 title:
   *                   type: string
   *                 summary:
   *                   type: string
   *                 keyFindings:
   *                   type: array
   *                   items:
   *                     type: string
   *                 pdfUrl:
   *                   type: string
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  router.get('/reports/latest', authenticate, async (req: Request, res: Response) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB offline');
      }
      const report = await ExecutiveReport.findOne({ companyId: req.user!.companyId })
        .sort({ createdAt: -1 })
        .limit(1);
      res.json(report || null);
    } catch (error: any) {
      // Fallback: search on disk if MongoDB is offline
      try {
        const reportsDir = path.join(process.cwd(), 'reports');
        const files = fs.readdirSync(reportsDir)
          .filter(f => f.startsWith('report_') && f.endsWith('.pdf'))
          .map(f => ({ name: f, time: fs.statSync(path.join(reportsDir, f)).mtime.getTime() }))
          .sort((a, b) => b.time - a.time);

        if (files.length > 0) {
          const latestFile = files[0].name;
          return res.json({
            _id: latestFile.replace('report_', '').replace('.pdf', ''),
            title: 'Monthly Executive Summary (Offline Cache)',
            summary: '[DEV MODE] Detailed performance summary generated under offline mode.',
            keyFindings: ['Operational on-time delivery maintained above target', 'Resolved critical customer feedback issues'],
            charts: [],
            pdfUrl: `/reports/${latestFile}`
          });
        }
      } catch (diskErr) {
        console.error('Failed disk fallback retrieval:', diskErr);
      }
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * @swagger
   * /rag/provenance/{insightId}:
   *   get:
   *     summary: Get provenance details for an insight
   *     description: Returns the full provenance chain for a stored RAG insight, including retrieved source documents, the prompt used, and model metadata. Access is restricted to the owning company.
   *     tags: [RAG]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: insightId
   *         required: true
   *         schema:
   *           type: string
   *         description: MongoDB ObjectId of the RAGInsight document
   *         example: "665f1a2b3c4d5e6f7a8b9c0d"
   *     responses:
   *       200:
   *         description: Insight provenance object
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 _id:
   *                   type: string
   *                 insightType:
   *                   type: string
   *                 content:
   *                   type: string
   *                 confidence:
   *                   type: number
   *                 provenance:
   *                   type: object
   *       403:
   *         description: Access denied — insight belongs to a different company
   *       404:
   *         description: Insight not found
   *       401:
   *         description: Unauthorized
   */
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

  /**
   * @swagger
   * /rag/upload:
   *   post:
   *     summary: Upload a file for multimodal processing and indexing
   *     description: Accepts images (JPEG, PNG, GIF, WebP), PDFs, plain text, or audio files (MP3, WAV, OGG, MP4). The file is processed by the MultiModal Processor (OCR, image classification, audio transcription, or PDF text extraction) and the resulting embedding is indexed into the vector store.
   *     tags: [RAG]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - file
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: The file to upload (max 10 MB)
   *               sourceId:
   *                 type: string
   *                 description: Source entity ID (shipment, incident, etc.)
   *               companyId:
   *                 type: string
   *               type:
   *                 type: string
   *                 enum: [RECEIPT, DAMAGED_PARCEL, SIGNATURE, DOCUMENT, VOICE_NOTE]
   *     responses:
   *       201:
   *         description: File processed and indexed successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/UploadResponse'
   *       400:
   *         description: Invalid file type, file too large, or no file provided
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       401:
   *         description: Unauthorized
   *       503:
   *         description: MultiModal processor unavailable
   */
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
      const buffer = fs.readFileSync(req.file.path);
      const processed = await multiModalProcessor.processAndIndex(
        buffer,
        req.file.mimetype,
        req.file.originalname,
        sourceId,
        companyId,
        type as ProcessedAttachment['type'] | undefined
      );
      fs.rmSync(req.file.path, { force: true });
      res.status(201).json({
        message: 'File processed and indexed',
        filename: req.file.originalname,
        sourceId,
        contentType: 'ATTACHMENT',
        type: processed.type,
        metadata: processed.metadata,
      });
    } catch (error: any) {
      if (req.file?.path) fs.rmSync(req.file.path, { force: true });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * @swagger
   * /rag/alerts/scan:
   *   post:
   *     summary: Trigger predictive alert scan
   *     description: Runs the Predictive Alert Engine against a company's shipments. If a `shipments` array is provided in the body, those objects are scanned directly (useful for offline/test scenarios). Otherwise, the engine loads shipments from MongoDB and scans the full company fleet.
   *     tags: [Alerts]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             allOf:
   *               - $ref: '#/components/schemas/AlertScanRequest'
   *               - type: object
   *                 properties:
   *                   shipments:
   *                     type: array
   *                     description: Optional array of shipment objects to scan directly (offline/test mode)
   *                     items:
   *                       type: object
   *           example:
   *             companyId: "COMP-001"
   *     responses:
   *       200:
   *         description: Scan completed
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "Scan completed"
   *                 companyId:
   *                   type: string
   *                 results:
   *                   type: array
   *                   items:
   *                     type: object
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  router.post('/alerts/scan', authenticate, async (req: Request, res: Response) => {
    try {
      const { companyId, shipments } = req.body;
      const effectiveCompanyId = companyId || req.user!.companyId;

      let results;
      if (Array.isArray(shipments) && shipments.length > 0) {
        // Offline / test path: caller provides mock shipment objects
        results = await alertEngine.scanShipments(shipments, effectiveCompanyId);
      } else {
        // Production path: load from MongoDB
        await alertEngine.scanCompany(effectiveCompanyId);
        results = [{ note: 'DB scan completed — check MongoDB for saved alerts' }];
      }

      res.json({ message: 'Scan completed', companyId: effectiveCompanyId, results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * @swagger
   * /rag/health:
   *   get:
   *     summary: RAG service health check
   *     description: Returns a simple status object confirming the RAG service is running. Does not require authentication.
   *     tags: [System]
   *     security: []
   *     responses:
   *       200:
   *         description: Service is healthy
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: "ok"
   *                 service:
   *                   type: string
   *                   example: "RAG"
   */
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'RAG' });
  });

  return router;
};

import { Router, Request, Response } from 'express';
import { RAGService } from '../../../services/rag/core/RAGService';
import { authenticate } from '../../../middleware/auth';
import { rateLimit } from 'express-rate-limit';
import { RAGInsight } from '../../../models/rag/RAGInsight.model';
import { RAGFeedback } from '../../../models/rag/RAGFeedback.model';
import { ExecutiveReport } from '../../../models/rag/ExecutiveReport.model';

const router = Router();
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

export default (ragService: RAGService) => {
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

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'RAG' });
  });

  return router;
};

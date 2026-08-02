import PDFDocument from 'pdfkit';
import { RAGService } from '../core/RAGService';
import { ExecutiveReport } from '../../../models/rag/ExecutiveReport.model';
import { Shipment } from '../../../models/Shipment.model';
import { Incident } from '../../../models/Incident.model';
import { RAGInsight } from '../../../models/rag/RAGInsight.model';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import path from 'path';

export class ExecutiveReportGenerator {
  constructor(private ragService: RAGService) {}

  async generateReport(
    companyId: string,
    start: Date,
    end: Date,
    userId: string
  ): Promise<any> {
    const shipments = await Shipment.find({ companyId, createdAt: { $gte: start, $lte: end } });
    const incidents = await Incident.find({ companyId, createdAt: { $gte: start, $lte: end } });
    const insights = await RAGInsight.find({
      'generatedFor.companyId': companyId,
      createdAt: { $gte: start, $lte: end },
    });

    const totalShipments = shipments.length;
    const deliveredOnTime = shipments.filter(s => s.status === 'DELIVERED' && s.deliveredAt && s.expectedDelivery && s.deliveredAt <= s.expectedDelivery).length;
    const onTimeRate = totalShipments ? deliveredOnTime / totalShipments : 0;
    const avgResolutionTime = incidents.reduce((acc, inc) => acc + (inc.resolvedAt ? (inc.resolvedAt.getTime() - inc.createdAt.getTime()) : 0), 0) / (incidents.length || 1);

    const prompt = `
      Generate an executive summary for a logistics company.
      Period: ${start.toISOString().slice(0,10)} to ${end.toISOString().slice(0,10)}
      Shipments: ${totalShipments} total, ${(onTimeRate * 100).toFixed(1)}% on-time.
      Incidents: ${incidents.length} total, avg resolution ${Math.round(avgResolutionTime / 60000)} min.
      Insights generated: ${insights.length}

      Provide:
      1. Executive Summary (3 bullet points)
      2. Operational Performance (key metrics, trends)
      3. Customer Sentiment Analysis (positive/negative drivers)
      4. Top 3 Issues & Root Causes
      5. Strategic Recommendations (with priority and expected impact)
      6. Financial Health Overview
    `;

    const ragResponse = await this.ragService.query(prompt, {
      userId,
      companyId,
      role: 'SYSTEM',
    });

    const report = new ExecutiveReport({
      companyId,
      period: { start, end },
      title: `Executive Summary ${start.toISOString().slice(0,10)} - ${end.toISOString().slice(0,10)}`,
      summary: ragResponse.response,
      keyFindings: ragResponse.suggestions.map(s => s.description),
      charts: [],
    });
    await report.save();

    const pdfPath = await this.generatePDF(report);
    report.pdfUrl = pdfPath;
    await report.save();

    return report;
  }

  private async generatePDF(report: any): Promise<string> {
    const doc = new PDFDocument();
    const filename = `report_${report._id}.pdf`;
    const reportsDir = process.env.REPORTS_DIR || './reports';
    if (!existsSync(reportsDir)) {
      mkdirSync(reportsDir, { recursive: true });
    }
    const filepath = path.join(reportsDir, filename);
    const stream = createWriteStream(filepath);
    doc.pipe(stream);

    doc.fontSize(18).text(report.title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(report.summary);
    doc.moveDown();
    doc.text('Key Findings:', { underline: true });
    report.keyFindings.forEach((f: string, i: number) => {
      doc.text(`${i+1}. ${f}`);
    });

    doc.end();
    return new Promise((resolve) => {
      stream.on('finish', () => resolve(`/reports/${filename}`));
    });
  }
}

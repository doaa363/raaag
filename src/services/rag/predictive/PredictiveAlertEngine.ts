import { TimeSeriesModel } from './TimeSeriesModel';
import { RAGService } from '../core/RAGService';
import { Shipment } from '../../../models/Shipment.model';
import { Alert } from '../../../models/Alert.model';

export class PredictiveAlertEngine {
  constructor(
    private timeSeriesModel: TimeSeriesModel,
    private ragService: RAGService
  ) {}

  /** Production path: loads shipments from MongoDB */
  async scanCompany(companyId: string): Promise<void> {
    const activeShipments = await Shipment.find({
      companyId,
      status: 'OUT_FOR_DELIVERY',
    }).populate('driver route');

    await this.scanShipments(activeShipments, companyId);
  }

  /** Test / offline path: accepts pre-built shipment objects directly */
  async scanShipments(shipments: any[], companyId: string): Promise<{ riskScore: number; saved: boolean; alertId?: string }[]> {
    const results: { riskScore: number; saved: boolean; alertId?: string }[] = [];

    for (const shipment of shipments) {
      const traffic = this.getTraffic(shipment.route);
      const weather = this.getWeather(shipment.destination);
      const features = this.timeSeriesModel.buildFeatures(shipment, traffic, weather);
      const riskScore = await this.timeSeriesModel.predict(features);

      console.log(`[alert-engine] shipment ${shipment.trackingNumber ?? shipment._id} → riskScore: ${riskScore.toFixed(3)}`);

      if (riskScore > 0.7) {
        const ragResponse = await this.ragService.query(
          `Provide mitigation steps for a shipment with delay risk ${riskScore.toFixed(2)}`,
          {
            userId: 'system',
            companyId,
            role: 'SYSTEM',
            shipmentId: (shipment._id as any)?.toString() ?? shipment.trackingNumber,
          }
        );

        let savedAlertId: string | undefined;
        try {
          const alert = new Alert({
            companyId,
            shipmentId: shipment._id,
            type: 'PREDICTIVE_DELAY',
            severity: riskScore > 0.85 ? 'CRITICAL' : 'HIGH',
            message: `Shipment ${shipment.trackingNumber} has ${Math.round(riskScore * 100)}% chance of delay.`,
            recommendedActions: ragResponse.suggestions,
            expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
          });
          await alert.save();
          savedAlertId = (alert._id as any).toString();
          console.log(`[alert-engine] ✅ Alert saved: ${alert.severity} — ${alert.message}`);
        } catch {
          console.warn('[alert-engine] MongoDB unavailable — alert not persisted.');
        }

        let io: any;
        try {
          const appModule = require('../../../app');
          io = appModule.getIO ? appModule.getIO() : null;
        } catch {}
        if (io) {
          io.to(`company:${companyId}`).emit('predictive_alert', {
            shipmentId: shipment._id ?? shipment.trackingNumber,
            trackingNumber: shipment.trackingNumber,
            riskScore,
            severity: riskScore > 0.85 ? 'CRITICAL' : 'HIGH',
            actions: ragResponse.suggestions,
          });
          console.log(`[alert-engine] 📡 Socket event emitted to company:${companyId}`);
        }

        results.push({ riskScore, saved: !!savedAlertId, alertId: savedAlertId });
      } else {
        console.log(`[alert-engine] ℹ️  Risk below threshold (${riskScore.toFixed(3)} ≤ 0.7) — no alert.`);
        results.push({ riskScore, saved: false });
      }
    }

    return results;
  }

  private getTraffic(_route: any): number {
    const hour = new Date().getHours();
    if (hour >= 7 && hour <= 9) return 0.8;
    if (hour >= 17 && hour <= 19) return 0.9;
    return 0.3;
  }

  private getWeather(_destination: any): number {
    return 0.2;
  }
}


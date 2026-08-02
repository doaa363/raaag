import { TimeSeriesModel } from './TimeSeriesModel';
import { RAGService } from '../core/RAGService';
import { Shipment } from '../../../models/Shipment.model';
import { Alert } from '../../../models/Alert.model';
import { getIO } from '../../../app';

export class PredictiveAlertEngine {
  constructor(
    private timeSeriesModel: TimeSeriesModel,
    private ragService: RAGService
  ) {}

  async scanCompany(companyId: string): Promise<void> {
    try {
      const activeShipments = await Shipment.find({
        companyId,
        status: 'OUT_FOR_DELIVERY',
      });

      for (const shipment of activeShipments) {
        const traffic = this.getTraffic(shipment.route);
        const weather = this.getWeather(shipment.destination);
        const features = this.timeSeriesModel.buildFeatures(shipment, traffic, weather);
        const riskScore = await this.timeSeriesModel.predict(features);

        if (riskScore > 0.7) {
          const ragResponse = await this.ragService.query(
            `Provide mitigation steps for a shipment with delay risk ${riskScore.toFixed(2)}`,
            {
              userId: 'system',
              companyId,
              role: 'SYSTEM',
              shipmentId: shipment._id.toString(),
            }
          );

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

          const io = getIO();
          if (io) {
            io.to(`company:${companyId}`).emit('predictive_alert', {
              shipmentId: shipment._id,
              riskScore,
              actions: ragResponse.suggestions,
            });
          }
        }
      }
    } catch (err) {
      console.error('Error during predictive alert scan:', err);
    }
  }

  private getTraffic(route: any): number {
    const hour = new Date().getHours();
    if (hour >= 7 && hour <= 9) return 0.8;
    if (hour >= 17 && hour <= 19) return 0.9;
    return 0.3;
  }

  private getWeather(destination: any): number {
    return 0.2;
  }
}

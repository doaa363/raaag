import * as fs from 'fs/promises';
import * as path from 'path';

export type FeatureVector = number[];

export class TimeSeriesModel {
  private model: any = null;
  private modelPath: string;

  constructor() {
    this.modelPath = path.join(__dirname, '../../../../models/delay_model.json');
    this.loadModel();
  }

  private async loadModel(): Promise<void> {
    try {
      const json = await fs.readFile(this.modelPath, 'utf-8');
      this.model = JSON.parse(json);
      if (process.env.NODE_ENV !== 'test') console.log('TimeSeriesModel loaded successfully.');
    } catch {
      if (process.env.NODE_ENV !== 'test') console.warn('No pre‑trained model found. Using default prediction logic.');
      this.model = null;
    }
  }

  async predict(features: FeatureVector): Promise<number> {
    // features: [driverHistory, traffic, weather, hour/24, day/7, routeComplexity/10]
    const [driverHist, traffic, weather, hourFrac, _day, complexity] = features;
    // driverHist is onTimeRate (0–1); invert it → poor drivers = higher risk
    const driverRisk = 1 - (driverHist ?? 0.8);
    let risk =
      0.10 +
      0.35 * driverRisk +       // driver reliability (dominant factor)
      0.20 * (traffic  || 0) +  // traffic congestion
      0.15 * (weather  || 0) +  // weather conditions
      0.15 * (complexity || 0) + // route complexity (normalised 0-1)
      0.05 * (hourFrac  || 0);   // time-of-day
    risk = Math.min(0.99, Math.max(0.01, risk));
    return risk;
  }


  buildFeatures(shipment: any, trafficData: number, weatherData: number): FeatureVector {
    const driverHistory = shipment.driver?.onTimeRate ?? 0.8;
    const expected = shipment.expectedDelivery ? new Date(shipment.expectedDelivery) : new Date();
    const hour = expected.getHours();
    const day = expected.getDay();
    // Normalize route complexity: length 5 → 1.0; cap at 1.0
    const complexity = Math.min(1.0, (shipment.route?.length || 1) / 5);
    return [driverHistory, trafficData, weatherData, hour / 24, day / 7, complexity];
  }
}

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
    const [driverHist, traffic, weather, hour, day, complexity] = features;
    let risk = 0.1 + 0.3 * (traffic || 0) + 0.2 * (weather || 0) + 0.05 * ((hour || 0) / 24) + 0.1 * (complexity || 0);
    risk = Math.min(0.99, Math.max(0.01, risk));
    return risk;
  }

  buildFeatures(shipment: any, trafficData: number, weatherData: number): FeatureVector {
    const driverHistory = shipment.driver?.onTimeRate || 0.8;
    const expected = shipment.expectedDelivery ? new Date(shipment.expectedDelivery) : new Date();
    const hour = expected.getHours();
    const day = expected.getDay();
    const complexity = shipment.route?.length || 1;
    return [driverHistory, trafficData, weatherData, hour / 24, day / 7, complexity / 10];
  }
}

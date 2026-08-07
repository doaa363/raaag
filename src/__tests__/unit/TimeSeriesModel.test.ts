import { TimeSeriesModel } from '../../services/rag/predictive/TimeSeriesModel';

describe('TimeSeriesModel Unit Tests', () => {
  let model: TimeSeriesModel;

  beforeEach(() => {
    model = new TimeSeriesModel();
  });

  it('should build features from shipment object correctly', () => {
    const shipment = {
      driver: { onTimeRate: 0.9 },
      expectedDelivery: new Date('2026-08-07T10:00:00Z'),
      route: ['Stop 1', 'Stop 2', 'Stop 3'],
    };

    const features = model.buildFeatures(shipment, 0.5, 0.2);
    expect(features).toHaveLength(6);
    expect(features[0]).toBe(0.9); // driver onTimeRate
    expect(features[1]).toBe(0.5); // traffic
    expect(features[2]).toBe(0.2); // weather
  });

  it('should calculate delay risk score within valid range [0.01, 0.99]', async () => {
    const featuresHighRisk = [0.2, 0.9, 0.8, 0.7, 0.5, 0.9];
    const riskHigh = await model.predict(featuresHighRisk);
    expect(riskHigh).toBeGreaterThan(0.5);
    expect(riskHigh).toBeLessThanOrEqual(0.99);

    const featuresLowRisk = [0.99, 0.1, 0.1, 0.2, 0.2, 0.2];
    const riskLow = await model.predict(featuresLowRisk);
    expect(riskLow).toBeLessThan(0.5);
    expect(riskLow).toBeGreaterThanOrEqual(0.01);
  });
});

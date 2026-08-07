import { PredictiveAlertEngine } from '../../services/rag/predictive/PredictiveAlertEngine';
import { TimeSeriesModel } from '../../services/rag/predictive/TimeSeriesModel';
import { RAGService } from '../../services/rag/core/RAGService';

describe('PredictiveAlertEngine Unit Tests', () => {
  let engine: PredictiveAlertEngine;
  let mockModel: jest.Mocked<TimeSeriesModel>;
  let mockRAGService: jest.Mocked<RAGService>;

  beforeEach(() => {
    mockModel = new TimeSeriesModel() as jest.Mocked<TimeSeriesModel>;
    mockRAGService = {
      query: jest.fn(),
    } as unknown as jest.Mocked<RAGService>;

    mockModel.buildFeatures = jest.fn().mockReturnValue([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    engine = new PredictiveAlertEngine(mockModel, mockRAGService);
  });

  it('should trigger alert when riskScore > 0.7', async () => {
    mockModel.predict = jest.fn().mockResolvedValue(0.85);
    mockRAGService.query.mockResolvedValue({
      response: 'High risk detected. Reroute driver.',
      confidence: 0.9,
      suggestions: [{ type: 'CONTACT_DRIVER', description: 'Reroute driver', priority: 1, steps: [] }],
      provenance: { retrievedDocIds: [], prompt: 'p', model: 'm', timestamp: new Date() },
    });

    const shipments = [
      { _id: 'shipment-1', trackingNumber: 'TRK-100', driver: { onTimeRate: 0.5 } },
    ];

    const results = await engine.scanShipments(shipments, 'comp-100');

    expect(results).toHaveLength(1);
    expect(results[0].riskScore).toBe(0.85);
    expect(mockRAGService.query).toHaveBeenCalledWith(
      expect.stringContaining('0.85'),
      expect.objectContaining({ companyId: 'comp-100', shipmentId: 'shipment-1' })
    );
  });

  it('should not trigger alert when riskScore <= 0.7', async () => {
    mockModel.predict = jest.fn().mockResolvedValue(0.40);

    const shipments = [
      { _id: 'shipment-2', trackingNumber: 'TRK-200', driver: { onTimeRate: 0.95 } },
    ];

    const results = await engine.scanShipments(shipments, 'comp-100');

    expect(results).toHaveLength(1);
    expect(results[0].riskScore).toBe(0.40);
    expect(results[0].saved).toBe(false);
    expect(mockRAGService.query).not.toHaveBeenCalled();
  });
});

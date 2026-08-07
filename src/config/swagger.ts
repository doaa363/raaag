import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LogiCore RAG API',
      version: '1.0.0',
      description:
        'Retrieval-Augmented Generation system for the LogiCore Operational Command Center.',
      contact: {
        name: 'LogiCore Support',
        email: 'support@logiCore.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        RAGQueryRequest: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', description: 'The user query' },
            shipmentId: { type: 'string' },
            incidentId: { type: 'string' },
            options: {
              type: 'object',
              properties: {
                useCache: { type: 'boolean', default: true },
                temperature: { type: 'number', minimum: 0, maximum: 1 },
              },
            },
          },
        },
        RAGQueryResponse: {
          type: 'object',
          properties: {
            response: { type: 'string' },
            confidence: { type: 'number' },
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  description: { type: 'string' },
                  assignedTo: { type: 'string' },
                  priority: { type: 'integer' },
                  steps: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            provenance: {
              type: 'object',
              properties: {
                retrievedDocIds: { type: 'array', items: { type: 'string' } },
                prompt: { type: 'string' },
                model: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        UploadResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            sourceId: { type: 'string' },
            contentType: { type: 'string' },
            type: { type: 'string' },
            metadata: {
              type: 'object',
              properties: {
                damageScore: { type: 'number' },
                pageCount: { type: 'integer' },
              },
            },
          },
        },
        FeedbackRequest: {
          type: 'object',
          required: ['insightId', 'rating'],
          properties: {
            insightId: { type: 'string' },
            rating: {
              type: 'integer',
              enum: [-1, 0, 1],
              description: '-1 unhelpful, 0 neutral, 1 helpful',
            },
            correctedText: { type: 'string' },
            comments: { type: 'string' },
          },
        },
        ReportRequest: {
          type: 'object',
          required: ['start', 'end'],
          properties: {
            start: { type: 'string', format: 'date-time' },
            end: { type: 'string', format: 'date-time' },
          },
        },
        ReportResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            reportId: { type: 'string' },
          },
        },
        EscalationBriefRequest: {
          type: 'object',
          required: ['incidentId'],
          properties: {
            incidentId: { type: 'string' },
          },
        },
        EscalationBriefResponse: {
          type: 'object',
          properties: {
            brief: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                criticalDecisionPoints: { type: 'array', items: { type: 'string' } },
                recommendedAction: { type: 'string' },
                financialImpact: { type: 'string' },
                expectedOutcome: { type: 'string' },
              },
            },
            insightId: { type: 'string' },
          },
        },
        AlertScanRequest: {
          type: 'object',
          required: ['companyId'],
          properties: {
            companyId: { type: 'string' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/api/v1/*.ts'], // Scan route files for @swagger JSDoc annotations
};

export const swaggerSpec = swaggerJsdoc(options);

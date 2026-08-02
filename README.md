# LogiCore RAG System

> Retrieval-Augmented Generation system for the LogiCore Operational Command Center.

## Overview

This is the complete RAG (Retrieval-Augmented Generation) system for LogiCore. It provides:

- 🤖 **Intelligent Feedback Analysis** – Real‑time sentiment and urgency detection
- 📊 **Executive Reporting** – Automated narrative reports with KPIs
- 🚨 **Predictive Alerts** – Machine‑learning based delivery delay prediction
- 💬 **Real‑time Chat Assistance** – Suggested replies and escalation briefings
- 📎 **Multi‑modal Processing** – OCR, image classification, and speech‑to‑text
- 🔄 **Active Learning** – Continuous improvement from user feedback

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- OpenAI API key

### Installation

```bash
# 1. Clone or extract this package
cd logiCore-rag

# 2. Install dependencies
npm install

# 3. Copy environment file
cp .env.example .env

# 4. Edit .env with your API keys

# 5. Start dependencies (Qdrant, Redis, MongoDB)
docker-compose -f docker-compose.rag.yml up -d

# 6. Build typescript
npm run build

# 7. Start the service
npm run dev
```

### Testing

```bash
# Run unit tests
npm test
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/rag/query` | General RAG query |
| POST | `/api/v1/rag/feedback/rate` | Rate an insight |
| POST | `/api/v1/rag/escalation/brief` | Generate escalation brief |
| POST | `/api/v1/rag/reports/generate` | Generate executive report |
| GET | `/api/v1/rag/reports/latest` | Get latest report |
| GET | `/api/v1/rag/provenance/:id` | Get insight provenance |
| GET | `/api/v1/rag/health` | Health check |

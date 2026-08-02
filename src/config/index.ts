import dotenv from 'dotenv';
dotenv.config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  env: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/logiCore_rag',
  rag: {
    embeddingModel: process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small',
    llmProvider: process.env.RAG_LLM_PROVIDER || 'openai',
    llmApiKey: process.env.RAG_LLM_API_KEY || '',
    llmModel: process.env.RAG_LLM_MODEL || 'gpt-4-turbo',
    vectorDbType: process.env.RAG_VECTOR_DB_TYPE || 'qdrant',
    vectorDbUrl: process.env.RAG_VECTOR_DB_URL || 'http://localhost:6333',
    vectorDbApiKey: process.env.RAG_VECTOR_DB_API_KEY || '',
    vectorIndexName: process.env.RAG_VECTOR_INDEX_NAME || 'logiCore_embeddings',
    vectorDimensions: parseInt(process.env.RAG_VECTOR_DIMENSIONS || '1536', 10),
    redisUrl: process.env.RAG_REDIS_URL || 'redis://localhost:6379',
    cacheTtlSeconds: parseInt(process.env.RAG_CACHE_TTL_SECONDS || '300', 10),
  },
  reportsDir: process.env.REPORTS_DIR || './reports',
  uploadsDir: process.env.UPLOADS_DIR || './uploads/incidents',
};

export default config;

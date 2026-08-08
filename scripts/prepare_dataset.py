#!/usr/bin/env python3
"""
Prepare training triplets from MongoDB for cross-encoder fine-tuning.
Extracts RAGFeedback + RAGInsight, builds (query, positive, negative) triplets.
"""

import os
import json
import logging
from typing import List, Dict
from datetime import datetime, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

MONGO_URI    = os.getenv("MONGODB_URI", "mongodb://admin:password@localhost:27017/logiCore_rag?authSource=admin")
DB_NAME      = os.getenv("MONGO_DB_NAME", "logiCore_rag")
OUTPUT_PATH  = os.getenv("DATASET_OUTPUT", "data/logistics_triplets.jsonl")
DAYS_BACK    = int(os.getenv("DAYS_BACK", "30"))
MIN_RATINGS  = int(os.getenv("MIN_RATINGS", "5"))


def fetch_feedback_with_insights(db, since: datetime) -> List[Dict]:
    pipeline = [
        {"$match": {"createdAt": {"$gte": since}, "rating": {"$ne": 0}}},
        {"$lookup": {
            "from": "raginsights",
            "localField": "insightId",
            "foreignField": "_id",
            "as": "insight"
        }},
        {"$unwind": {"path": "$insight", "preserveNullAndEmptyArrays": False}}
    ]
    results = list(db["ragfeedbacks"].aggregate(pipeline))
    logger.info(f"Fetched {len(results)} feedback records with insights.")
    return results


def build_triplets(records: List[Dict]) -> List[Dict]:
    """
    Build (query, positive_context, negative_context) triplets.
    rating=1  → retrieved docs are positive context
    rating=-1 → retrieved docs are negative context (paired with a positive from another record)
    """
    positives = [r for r in records if r["rating"] == 1]
    negatives = [r for r in records if r["rating"] == -1]

    triplets = []
    for i, pos in enumerate(positives):
        query = pos["insight"].get("content", "")[:500]
        pos_ctx = " ".join(str(d) for d in pos["insight"].get("provenance", {}).get("retrievedDocs", []))[:500] or query
        # pair with a negative if available, else use a different positive as hard negative
        neg_rec = negatives[i % len(negatives)] if negatives else positives[(i + 1) % len(positives)]
        neg_ctx = " ".join(str(d) for d in neg_rec["insight"].get("provenance", {}).get("retrievedDocs", []))[:500] or neg_rec["insight"].get("content", "")[:500]
        triplets.append({"query": query, "positive_context": pos_ctx, "negative_context": neg_ctx})

    logger.info(f"Built {len(triplets)} triplets.")
    return triplets


def save_triplets(triplets: List[Dict], output_path: str):
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        for t in triplets:
            f.write(json.dumps(t, ensure_ascii=False) + "\n")
    logger.info(f"Saved {len(triplets)} triplets to {output_path}")


def main():
    since = datetime.utcnow() - timedelta(days=DAYS_BACK)
    logger.info(f"Fetching feedback since {since.isoformat()}")

    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[DB_NAME]
        records = fetch_feedback_with_insights(db, since)
    except Exception as e:
        logger.error(f"MongoDB connection failed: {e}")
        logger.info("Generating synthetic dataset for offline testing...")
        records = [
            {"rating": 1, "insight": {"content": f"Delivery delay in zone {i}", "provenance": {"retrievedDocs": [f"doc_{i}"]}}}
            for i in range(10)
        ] + [
            {"rating": -1, "insight": {"content": f"Wrong address issue {i}", "provenance": {"retrievedDocs": [f"neg_doc_{i}"]}}}
            for i in range(5)
        ]

    if len(records) < MIN_RATINGS:
        logger.warning(f"Only {len(records)} records. Need {MIN_RATINGS}. Exiting.")
        return

    triplets = build_triplets(records)
    save_triplets(triplets, OUTPUT_PATH)
    logger.info("Dataset preparation complete.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Fine-tune cross-encoder/ms-marco-MiniLM-L-6-v2 on logistics triplets and export to ONNX.
"""

import os
import json
import logging
from typing import List, Dict
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DATASET_PATH    = os.getenv("DATASET_PATH", "data/logistics_triplets.jsonl")
MODEL_NAME      = "cross-encoder/ms-marco-MiniLM-L-6-v2"
OUTPUT_DIR      = os.getenv("MODEL_OUTPUT", "models/custom-reranker")
BATCH_SIZE      = int(os.getenv("TRAIN_BATCH_SIZE", "16"))
EPOCHS          = int(os.getenv("TRAIN_EPOCHS", "3"))
LEARNING_RATE   = float(os.getenv("TRAIN_LR", "2e-5"))
WARMUP_RATIO    = float(os.getenv("TRAIN_WARMUP_RATIO", "0.1"))
MAX_SEQ_LENGTH  = 512
ONNX_PATH       = os.path.join(OUTPUT_DIR, "custom-reranker.onnx")


def load_triplets(path: str) -> List[Dict]:
    triplets = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                triplets.append(json.loads(line))
    logger.info(f"Loaded {len(triplets)} triplets from {path}")
    return triplets


def train(triplets: List[Dict]):
    try:
        import torch
        from torch.utils.data import DataLoader
        from sentence_transformers import CrossEncoder, InputExample
    except ImportError as e:
        logger.error(f"Missing dependency: {e}. Run: pip install sentence-transformers torch")
        raise

    # Build InputExample pairs: positive (label=1) and negative (label=0)
    samples = []
    for t in triplets:
        samples.append(InputExample(texts=[t["query"], t["positive_context"]], label=1.0))
        samples.append(InputExample(texts=[t["query"], t["negative_context"]], label=0.0))

    logger.info(f"Training on {len(samples)} samples ({len(triplets)} triplets × 2)")

    model = CrossEncoder(MODEL_NAME, num_labels=1, max_length=MAX_SEQ_LENGTH)

    total_steps = (len(samples) // BATCH_SIZE) * EPOCHS
    warmup_steps = int(total_steps * WARMUP_RATIO)

    from torch.utils.data import DataLoader as TorchDataLoader
    train_dataloader = TorchDataLoader(samples, shuffle=True, batch_size=BATCH_SIZE)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    logger.info(f"Starting training: epochs={EPOCHS}, lr={LEARNING_RATE}, warmup={warmup_steps}")

    model.fit(
        train_dataloader=train_dataloader,
        epochs=EPOCHS,
        warmup_steps=warmup_steps,
        optimizer_params={"lr": LEARNING_RATE},
        output_path=OUTPUT_DIR,
        show_progress_bar=True,
    )
    logger.info(f"Model saved to {OUTPUT_DIR}")
    return model


def export_to_onnx(model_dir: str, onnx_path: str):
    try:
        import torch
        import onnx
        from transformers import AutoTokenizer, AutoModelForSequenceClassification
    except ImportError as e:
        logger.error(f"Missing dependency: {e}. Run: pip install onnx transformers")
        raise

    logger.info("Exporting to ONNX...")
    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir)
    model.eval()

    dummy = "Sample logistics query for ONNX export"
    inputs = tokenizer(dummy, dummy, return_tensors="pt", truncation=True, max_length=MAX_SEQ_LENGTH)

    torch.onnx.export(
        model,
        (inputs["input_ids"], inputs["attention_mask"]),
        onnx_path,
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids":      {0: "batch_size", 1: "seq_len"},
            "attention_mask": {0: "batch_size", 1: "seq_len"},
            "logits":         {0: "batch_size"},
        },
        opset_version=14,
    )

    onnx_model = onnx.load(onnx_path)
    onnx.checker.check_model(onnx_model)
    logger.info(f"ONNX model verified and saved to {onnx_path}")


def main():
    if not os.path.exists(DATASET_PATH):
        logger.error(f"Dataset not found at {DATASET_PATH}. Run prepare_dataset.py first.")
        return

    triplets = load_triplets(DATASET_PATH)
    if len(triplets) < 10:
        logger.warning(f"Only {len(triplets)} triplets — need at least 10. Exiting.")
        return

    train(triplets)
    export_to_onnx(OUTPUT_DIR, ONNX_PATH)
    logger.info("Training pipeline complete.")


if __name__ == "__main__":
    main()

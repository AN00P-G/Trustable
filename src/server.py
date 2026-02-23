"""Minimal API server to classify scraped text using the cached pipeline."""

from __future__ import annotations

from pathlib import Path
from typing import Dict

from flask import Flask, jsonify, request, make_response

# Reuse the cached/loaded pipeline from model.py
from model import pipeline, explain

app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "Content-Type")
    response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
    response.headers.add("Access-Control-Allow-Private-Network", "true")
    return response


@app.route("/classify", methods=["OPTIONS"])
def classify_options():
    resp = make_response("", 204)
    return resp


@app.post("/classify")
def classify() -> Dict[str, str]:
    payload = request.get_json(force=True, silent=True) or {}
    text = payload.get("text", "")
    if not text:
        return jsonify({"error": "missing text"}), 400

    result = explain(text)
    return jsonify(result)


if __name__ == "__main__":
    # Run on localhost:8000 for the extension fetch
    app.run(host="127.0.0.1", port=8000, debug=False)

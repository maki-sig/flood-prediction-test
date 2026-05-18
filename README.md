```
███████╗██╗      ██████╗ ██╗    ██╗███████╗
██╔════╝██║     ██╔═══██╗██║    ██║██╔════╝
█████╗  ██║     ██║   ██║██║ █╗ ██║███████╗
██╔══╝  ██║     ██║   ██║██║███╗██║╚════██║
██║     ███████╗╚██████╔╝╚███╔███╔╝███████║
╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝ ╚══════╝
```

```
maki-sig@flood-prediction-test
────────────────────────────────────────────
Project    flood-prediction-test
Purpose    Flood probability prediction
Input      3-day forecasted precipitation
Model      XGBoost Classifier
Frontend   Next.js · TypeScript · Tailwind CSS · Leaflet.js
Backend    Python
Weather    Open-Meteo API
Structure  frontend / backend / model / data
License    MIT
```

---

# Flood Prediction Prototype

A full-stack web application that predicts flood probabilities using 3-day forecasted precipitation data, powered by an XGBoost classifier.

---

## Overview

This project fetches 3-day precipitation forecasts from the Open-Meteo API for a user-selected location, then runs the data through a trained XGBoost classifier to produce flood probability estimates. Locations are picked interactively via a Leaflet.js map, and results are surfaced through a Next.js frontend with a Python backend handling inference.

---

## Project Structure

```
flood-prediction-test/
├── frontend/       # Next.js + Tailwind CSS web UI
├── backend/        # Python API server
├── model/          # XGBoost model training & serialization
└── data/           # Datasets used for training and evaluation
```

---

## Tech Stack

| Layer        | Technology                               |
|--------------|------------------------------------------|
| Frontend     | Next.js, TypeScript, Tailwind CSS        |
| Maps         | Leaflet.js                               |
| Weather Data | Open-Meteo API                           |
| Backend      | Python                                   |
| ML Model     | XGBoost Classifier                       |
| Input Data   | 3-day forecasted precipitation           |

---

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js 18+

### 1. Clone the repository

```bash
git clone https://github.com/maki-sig/flood-prediction-test.git
cd flood-prediction-test
```

### 2. Set up the backend

```bash
cd backend
python main.py
```

The API server will start at `http://localhost:8000` (or as configured).

### 3. Set up the frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`.

---

## Model

The ML model lives in the `model/` directory. It is an **XGBoost Classifier** trained on historical precipitation and flood occurrence data.

To retrain the model:

```bash
cd model
python train.py
```

The trained model artifact is saved and loaded automatically by the backend at inference time.

---

## Data

The `data/` directory contains the datasets used for training and evaluation. Input features are derived from **3-day forecasted precipitation** values.

---

## License

This project is licensed under the [MIT License](LICENSE).
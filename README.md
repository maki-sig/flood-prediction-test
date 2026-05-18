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
Frontend   TypeScript + CSS
Backend    Python
Structure  frontend / backend / model / data
License    MIT
Languages  TypeScript 86% · Python 6% · CSS 7%
Commits    16
Branch     main
```

---

# Flood Prediction Webapp Prototype

A full-stack web application prototype that predicts flood probabilities using 3-day forecasted precipitation data, powered by an XGBoost classifier.

---

## Overview

This project ingests short-range precipitation forecast data and runs it through a trained machine learning model to produce flood probability estimates. The results are surfaced through a TypeScript-based frontend, with a Python backend handling inference requests.

---

## Project Structure

```
flood-prediction-test/
├── frontend/       # TypeScript/CSS web UI
├── backend/        # Python API server
├── model/          # XGBoost model training & serialization
└── data/           # Datasets used for training and evaluation
```

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | TypeScript, CSS                   |
| Backend   | Python                            |
| ML Model  | XGBoost Classifier                |
| Data      | 3-day forecasted precipitation    |

---

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js 18+
- pip / npm

### 1. Clone the repository

```bash
git clone https://github.com/maki-sig/flood-prediction-test.git
cd flood-prediction-test
```

### 2. Set up the backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

The API server will start at `http://localhost:8000` (or as configured).

### 3. Set up the frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000` (or as configured).

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

## How It Works

1. The frontend collects or displays precipitation forecast inputs.
2. A request is sent to the Python backend.
3. The backend feeds the input into the trained XGBoost model.
4. The predicted flood probability is returned and displayed in the UI.

---

## License

This project is licensed under the [MIT License](LICENSE).
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
Project    FLOWS — Flood Level Observation and Warning System
Location   Naga City, Camarines Sur, Philippines
Model      XGBoost Classifier
Frontend   Next.js · TypeScript · Tailwind CSS · Leaflet.js
Backend    FastAPI (Python)
Database   Supabase
Weather    Open-Meteo API
License    MIT
```

---

# FLOWS — Flood Level Observation and Warning System

A full-stack ML-powered flood intelligence dashboard providing **3-day hourly flood probability forecasts** for Naga City, Philippines. Built with an XGBoost classifier, a FastAPI backend, and a responsive Next.js dashboard with light/dark themes.

---

## Dashboard Features

- **3-Day Forecast View** — Switch between Today, Tomorrow, and Day After Tomorrow with per-day risk summaries
- **Interactive Chart** — Dual-axis overlay of rain intensity and flood probability across 24 hourly ticks with hover inspection
- **Timeline Node Inspector** — Hourly breakdown of rainfall features and the raw XGBoost probability output
- **Interactive Map** — Naga City boundary overlay color-coded by current risk level, with multiple map tile styles
- **Logs Table** — Scrollable hourly data table with per-row risk classification badges
- **Live Indicators** — Philippine Standard Time (PST) clock and next sync countdown
- **Dark / Light Theme** — WCAG-compliant semantic color system

### Risk Levels

| Level                       | Probability |
|-----------------------------|-------------|
| No Chance of Flooding       | < 1%        |
| Low Chance of Flooding      | 1% – 10%    |
| Moderate Chance of Flooding | 10% – 35%   |
| High Chance of Flooding     | > 35%       |

---

## Tech Stack

| Layer        | Technology                                          |
|--------------|-----------------------------------------------------|
| Frontend     | Next.js, TypeScript, Tailwind CSS                   |
| Map          | Leaflet.js                                          |
| Backend      | FastAPI, Python 3.9+                                |
| ML Model     | XGBoost Classifier                                  |
| Database     | Supabase                                            |
| Weather API  | Open-Meteo                                          |
| Deployment   | Vercel (frontend) · Render (backend) · cron-job.org |

---

## Project Structure

```
flood-prediction-test/
├── frontend/   # Next.js dashboard
├── backend/    # FastAPI inference server
├── model/      # XGBoost model artifact
└── data/       # Training & evaluation datasets
```

---

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js 18+
- Supabase project
- Environment variables configured (see `.env.example` if provided)

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The dashboard will be available at `http://localhost:3000`.

---

## Model

The XGBoost classifier is trained on historical precipitation data. To retrain:

```bash
cd backend
python train.py
```

---

## License

This project is licensed under the [MIT License](LICENSE).
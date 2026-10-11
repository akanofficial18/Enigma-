# Sentinel Vitals (prototype)

One health-monitoring app with two interfaces that stay in sync:

| Interface | File | What it shows |
|---|---|---|
| Phone / laptop app | `index.html` | Main page is a six-axis health radar with a parameter table, then live monitoring, baseline, anomaly rules, smart alerts, emergency spike, doctor message, reminders, event log and CSV export |
| Smartwatch | `watch.html` | Only the radar (with parameter names and values) and the clock. The ring turns amber/red during warnings and alerts |

Data is replayed from the Kaggle smartwatch CSV. The doctor message is a draft; nothing is sent to a doctor.

## What changed in this version (real data + Hugging Face model)

The random simulator is gone. The app now replays the **Kaggle "unclean smartwatch health data"** CSV and scores every reading with a **Hugging Face time-series model**.

```
unclean CSV --> server/clean_data.py --> data/clean_smartwatch.csv
                                              |
                       server/app.py  (one reading per second, light smoothing, injection)
                                              |
                       server/scorer.py  --> ibm-granite/granite-timeseries-ttm-r2 (zero-shot forecast)
                                              |
        browser: js/engine.js  (baseline learning + rules + ML result) --> dashboard / watch / doctor message
```

* **Cleaning** (`python3 server/clean_data.py data/unclean_smartwatch_health_data.csv`): fixes activity typos (Seddentary, Actve, Highly_Active), turns text such as ERROR / Very High into missing, removes impossible values (HR outside 30-220, steps above 40000, HR stuck at exactly 40.0), fills gaps with the median of the same activity level. It prints a count for every rule.
* **Model**: Granite TinyTimeMixer (about 1M parameters, runs on CPU) forecasts the next heart rate, SpO2 and stress reading from the wearer's own recent history. The distance between forecast and reality, divided by that wearer's usual forecast error, is the anomaly score. No labelled emergencies are used. Warning needs 2 consecutive high readings, critical (score 8+) is immediate.
* **Fallback**: if the model cannot download or load, the same scoring runs on a moving-average forecaster. The dashboard "AI model" row and `/api/status` always say which one is active.
* **Signals**: the CSV has heart rate, SpO2, steps, sleep, activity level and stress. It has **no skin temperature or respiratory rate**, so those axes and rules were removed instead of being invented.
* **Injection**: "Emergency spike" (HR 160, SpO2 88, not moving) and "Warning demo" are injected into the stream by the server.
* The CSV rows are independent readings (no timestamps). To make the stream behave like one body, each row becomes a target that is held 6-14 s and eased toward (about 1 bpm change per second), rows are pulled halfway toward the typical level, and a small documented activity effect is added (walking +15 bpm, running +55 bpm, SpO2 down 0.3-0.8 points) because the CSV has no link between activity and heart rate. The AI model sees heart rate with that effect removed. Constants are at the top of `nxt()` in `server/app.py` (and `js/local.js` for the standalone page).

## Run it

```bash
pip install -r requirements.txt
python3 server/app.py          # first start downloads the model (needs internet once)
```

Open http://localhost:8000/index.html (app) and http://localhost:8000/watch.html (watch). Use the server above, not `python -m http.server`: the pages need `/api/next`.

Useful settings: `SV_NO_HF=1` (skip the model), `SV_HF_MODEL=<repo>`, `SV_HF_REVISION=<branch>`, `PORT=8000`.

## How the sync works

- One page is the **leader** and runs the simulation once per second; the other is a **follower** that only displays the shared state and sends commands back.
- The first page opened becomes the leader. If the leader is closed (or its tab is throttled in the background), the follower takes over after about 3.5 seconds and keeps the same readings, baseline and history.
- Event history is also kept in `localStorage`, so it survives a reload.

## Files

```
index.html          app page (markup only)
watch.html          watch page (markup only)
css/base.css        colour tokens (light + dark), type, buttons, radar styling
css/app.css         app layout and components
css/watch.css       round watch face
js/config.js        axes, reference values, shared helpers
js/rules.js         rule-based anomaly detection (single, baseline and combined rules)
js/engine.js        pulls readings from the server, baseline learning, events
server/app.py       data server: CSV replay, injection, serves the pages
server/scorer.py    Hugging Face model scoring (+ visible fallback)
server/clean_data.py  CSV cleaning
js/sync.js          leader/follower sync between the pages
js/radar.js         SVG radar renderer (used by app and watch)
js/app.js           app UI
js/watch.js         watch UI
tools/build_single_file.py   optional: inline everything into dist/index.html and dist/watch.html
```

## Radar axes

Heart rate, SpO₂, steps/day, activity, sleep and stress. Three shapes are drawn: **now**, **5-minute average** and **your baseline**. Heart rate and SpO₂ drive the rules; the AI model also watches stress.

## Where to change things

- Alert limits and combined rules: `js/rules.js`
- Injected scenarios and replay behaviour: `nxt()` in `server/app.py`; model thresholds `SEV1`, `SEV2`, `HOLD` in `server/scorer.py`
- Baseline learning length (30 samples for the demo): `target` in `js/engine.js`
- Sending a real doctor notification: replace the "Mark as sent" handler in `js/app.js`

## Not built yet

Duplicate-alert reduction (grouping repeated alerts, cooldown) is listed as a planned enhancement. Today an alert is logged once each time the overall status changes.

## Feature tabs (added)

The app page is split into tabs: **Overview**, **Monitoring**, **Doctor & history**, **Prescription**, **Reports**, **Rehab**. The banner stays on top of every tab.

| Tab | File | Notes |
|---|---|---|
| Prescription | `js/rx.js` | Paste text or upload a photo (OCR via Tesseract.js, loaded on first use). Checks dose per day, duration, interactions, duplicate classes and allergies. Covers ~20 common medicines: extend the `D` and `INT` lists. |
| Reports | `js/report.js` | Parses "test value" lines (CBC, sugar, lipids, kidney, liver, thyroid, vitamins, electrolytes) against adult ranges: extend the `T` list. |
| Rehab | `js/rehab.js` | MediaPipe Pose (CDN) draws joint dots on the live camera, tracks one joint angle, counts reps and logs the session to history. Needs camera permission and HTTPS or localhost. Add exercises in `EX`. |
| Tabs, helpers | `js/tabs.js`, `css/tabs.css` | Tab switching plus shared toast, OCR and "add to doctor message". |

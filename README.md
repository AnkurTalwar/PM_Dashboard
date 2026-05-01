# Program Pulse

Program Pulse is a Vite + React + TypeScript dashboard for project health, ETC walkforward, cushion waterfall analysis, expense/LTA monitoring, and data import.

## Features

- **Project Scorecard**: Track project health with customizable KPIs and metrics
- **ETC (Estimate to Complete)**: Walkforward analysis and resource allocation
- **Expense Compliance**: Monitor policy violations and spending thresholds
- **LTA Tracking**: Long-term assignment hotel night compliance monitoring
- **AI Assistant**: Chat with your data using AWS Bedrock (Claude) - ask questions about hours, expenses, and compliance
- **Data Import**: Load and analyze program package data

## Run Locally

### Prerequisites

1. Node.js 18+ (recommended) and npm, or Bun.
2. Visual Studio Code (recommended for built-in tasks).

### 1) Install dependencies

From the project root, run one of the following:

```powershell
bun install
```

or

```powershell
npm install
```

### 2) Start the dashboard (recommended: VS Code task)

In VS Code:

1. Open the command palette.
2. Run `Tasks: Run Task`.
3. Select `Run dashboard locally`.

This task automatically uses:

1. `bun run dev` if Bun is available.
2. Otherwise `npm run dev`.

### 3) Open the app

Vite will print a local URL in the terminal, usually:

```text
http://localhost:5173
```

Open that URL in your browser.

## Terminal-Only Commands (No VS Code Task)

From project root:

```powershell
bun run dev
```

or

```powershell
npm run dev
```

## Other Useful Tasks

This workspace includes these VS Code tasks:

1. `Run dashboard locally` (dev server)
2. `Build dashboard` (production build)
3. `Preview production build` (serve built output)

## Build and Preview

### Build

```powershell
bun run build
```

or

```powershell
npm run build
```

### Preview production build

```powershell
bun run preview
```

or

```powershell
npm run preview
```

## First-Run Workflow for New Team Members

1. Clone repo.
2. Install dependencies.
3. Run `Run dashboard locally` task.
4. Open local Vite URL.
5. Optionally load package data from the app's `Data Import` page.

## AI Assistant (Optional)

The dashboard includes an AI-powered chatbot that can answer questions about your dashboard data using AWS Bedrock (Claude).

### Setup

1. Navigate to the `chatbot` folder and run setup:
```powershell
cd chatbot
.\setup.ps1
```

2. Configure AWS credentials in `chatbot/bedrock_chatbot.py`

3. Start the API server:
```powershell
.\start_api.ps1
```

4. Access the chatbot at `http://localhost:8080/chatbot` or click "AI Assistant" in the sidebar

For detailed setup instructions, see `chatbot/README.md`.

## Troubleshooting

### "Neither bun nor npm was found on PATH"

Install Node.js (includes npm) or Bun, then restart terminal/VS Code.

### Port already in use

Stop the other process using the Vite port or run with a different port:

```powershell
npm run dev -- --port 5174
```

### Clean install

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
```

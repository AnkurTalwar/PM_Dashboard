# Program Pulse Runbook

## Purpose

This runbook gives the fastest path to run Program Pulse locally and troubleshoot common startup issues.

## Quick Start (VS Code)

1. Open the repository in VS Code.
2. Open a terminal in project root.
3. Install dependencies:

```powershell
npm install
```

or

```powershell
bun install
```

4. Run task: `Tasks: Run Task` -> `Run dashboard locally`.
5. Open the Vite URL shown in terminal (typically `http://localhost:5173`).

## Quick Start (Terminal only)

From project root:

```powershell
npm run dev
```

or

```powershell
bun run dev
```

## Build / Preview

### Build

```powershell
npm run build
```

or

```powershell
bun run build
```

### Preview production build

```powershell
npm run preview
```

or

```powershell
bun run preview
```

## Standard Handoff Checklist

1. Clone repo.
2. Install dependencies.
3. Launch local dashboard.
4. Verify ETC, Waterfall, LTA, and Expenses pages load.
5. Verify `Data Import` page can load package folder.
6. (Optional) Set up AI Assistant - see AI Assistant Setup below.

## AI Assistant Setup (Optional)

The dashboard includes an AI-powered chatbot that can answer questions about your data. To enable it:

### Quick Setup

1. Navigate to the `chatbot` folder:
```powershell
cd chatbot
```

2. Run the setup script:
```powershell
.\setup.ps1
```

3. Configure AWS credentials in `bedrock_chatbot.py` (lines 29-31)

4. Start the API server:
```powershell
.\start_api.ps1
```

or

```powershell
python api_server.py
```

5. The chatbot is now available at `http://localhost:8080/chatbot` (click "AI Assistant" in the sidebar)

### Requirements

- Python 3.8 or higher
- AWS account with Bedrock access
- AWS credentials with appropriate permissions
- Enabled Claude models in AWS Bedrock Console

See `chatbot/README.md` for detailed setup instructions.

## Common Issues

### Error: `Neither bun nor npm was found on PATH`

Install Node.js (includes npm) or Bun, then restart terminal/VS Code.

### Port conflict (5173 already in use)

Run on a different port:

```powershell
npm run dev -- --port 5174
```

### Clean reinstall

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
```

## Notes for Maintainers

1. App branding is `Program Pulse`.
2. Sidebar app icon uses `Radar`.
3. Favicon file is `public/dashboard-favicon.svg`.
4. Existing local storage keys may still use legacy `restrack` prefixes for backward compatibility.

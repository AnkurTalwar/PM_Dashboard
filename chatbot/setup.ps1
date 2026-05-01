# Chatbot Setup Script for Program Pulse Dashboard
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "Program Pulse AI Assistant - Setup Script" -ForegroundColor Green
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Check Python installation
Write-Host "Checking Python installation..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✓ $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Python not found. Please install Python 3.8 or higher." -ForegroundColor Red
    Write-Host "  Download from: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Check if pip is available
Write-Host "Checking pip installation..." -ForegroundColor Yellow
try {
    $pipVersion = pip --version 2>&1
    Write-Host "✓ pip is installed" -ForegroundColor Green
} catch {
    Write-Host "✗ pip not found. Please install pip." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Install API dependencies
Write-Host "Installing API server dependencies..." -ForegroundColor Yellow
try {
    pip install -r api_requirements.txt
    Write-Host "✓ API dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to install API dependencies" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Check if bedrock chatbot dependencies are installed
Write-Host "Installing chatbot dependencies..." -ForegroundColor Yellow
$packages = @("streamlit", "boto3", "langchain", "langchain-aws")
foreach ($package in $packages) {
    try {
        pip show $package > $null 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ $package already installed" -ForegroundColor Green
        } else {
            pip install $package
            Write-Host "✓ $package installed" -ForegroundColor Green
        }
    } catch {
        Write-Host "✗ Failed to install $package" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Configure AWS credentials in bedrock_chatbot.py (lines 29-31)" -ForegroundColor White
Write-Host "2. Enable AWS Bedrock model access in AWS Console" -ForegroundColor White
Write-Host "3. Test connection: python test_bedrock_connection.py" -ForegroundColor White
Write-Host "4. Start API server: python api_server.py" -ForegroundColor White
Write-Host "   OR use: .\start_api.ps1" -ForegroundColor White
Write-Host ""
Write-Host "See README.md for detailed instructions" -ForegroundColor Cyan
Write-Host ""

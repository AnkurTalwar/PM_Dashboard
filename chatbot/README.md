# Chatbot Integration for Program Pulse Dashboard

## Overview
This folder contains an AWS Bedrock-powered AI chatbot that integrates with the Program Pulse dashboard. The chatbot can answer questions about hours reconciliation, LTA tracking, and expense compliance.

## Architecture
- **Backend**: Python FastAPI server (`api_server.py`) that wraps the Bedrock chatbot
- **Frontend**: React component (`src/components/Chatbot.tsx`) that provides the chat interface
- **Model**: AWS Bedrock Claude Sonnet 4.5 (configurable in `bedrock_chatbot.py`)

## Setup Instructions

### 1. Install Python Dependencies

First, make sure you have Python 3.8+ installed. Then install the required packages:

```powershell
# Install backend dependencies (from project root)
cd chatbot
pip install -r api_requirements.txt

# If you haven't already, install the chatbot dependencies
pip install streamlit boto3 langchain langchain-aws
```

### 2. Configure AWS Credentials

Edit `bedrock_chatbot.py` and add your AWS credentials (lines 29-31):

```python
AWS_ACCESS_KEY_ID = "YOUR_ACCESS_KEY_ID"
AWS_SECRET_ACCESS_KEY = "YOUR_SECRET_ACCESS_KEY"
AWS_REGION = "us-east-1"  # or your preferred region
```

**Important**: Make sure you have:
- Enabled AWS Bedrock model access in the AWS Console
- IAM permissions for `bedrock:InvokeModel` and related actions
- Selected and enabled the Claude models in Bedrock

See `BEDROCK_SETUP_GUIDE.md` for detailed AWS setup instructions.

### 3. Start the Backend API Server

From the `chatbot` folder:

```powershell
# Option 1: Using Python directly
python api_server.py

# Option 2: Using uvicorn (recommended for development)
uvicorn api_server:app --reload --host 0.0.0.0 --port 8000
```

The API server will start at `http://localhost:8000`

You can verify it's running by visiting:
- `http://localhost:8000/` - Health check
- `http://localhost:8000/docs` - Interactive API documentation

### 4. Start the Frontend Dashboard

The frontend is already integrated! Just make sure your React app is running:

```powershell
# From project root
bun run dev
```

Then navigate to `http://localhost:8080/chatbot` (or click "AI Assistant" in the sidebar)

## Usage

### In the Dashboard
1. Click on "AI Assistant" in the sidebar navigation
2. Type your question in the chat input
3. The chatbot will respond with insights based on dashboard data
4. Use "Reset Chat" to start a new conversation

### Example Questions
- "How many resources have billing violations?"
- "What's the total forecasted hours vs billed hours?"
- "Show me LTA compliance status"
- "Which employees have expense policy violations?"
- "What's the utilization rate for Project X?"

## API Endpoints

### POST /api/chat
Send a message to the chatbot
```json
{
  "message": "Your question here",
  "session_id": "default",
  "data_context": "Optional dashboard data context"
}
```

### POST /api/chat/reset
Reset the conversation history for a session
```json
{
  "session_id": "default"
}
```

### GET /api/sessions
List all active chat sessions

### DELETE /api/sessions/{session_id}
Delete a specific chat session

## Customization

### Change the AI Model
Edit `bedrock_chatbot.py` line 50:
```python
BEDROCK_MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
# Or try: "anthropic.claude-3-haiku-20240307-v1:0" for faster responses
```

### Adjust Model Parameters
Edit `bedrock_chatbot.py` lines 53-56:
```python
MODEL_KWARGS = {
    "temperature": 0.7,  # 0.0 = deterministic, 1.0 = creative
    "max_tokens": 2048,   # Maximum response length
}
```

### Customize System Prompt
Edit the `system_preamble` in `bedrock_chatbot.py` (lines 98-124) to change the chatbot's personality and capabilities.

### Change API Port
Edit `api_server.py` line 135 to use a different port:
```python
uvicorn.run(app, host="0.0.0.0", port=8000)  # Change 8000 to your port
```

Then update the frontend component default API URL in `src/components/Chatbot.tsx` line 25.

## Troubleshooting

### "Unable to connect to chatbot API"
- Make sure the Python backend is running: `python chatbot/api_server.py`
- Check that the API is accessible at `http://localhost:8000`
- Verify no firewall is blocking the port

### "AWS credentials not configured"
- Double-check your AWS credentials in `bedrock_chatbot.py`
- Verify the credentials have Bedrock permissions
- Try running `python test_bedrock_connection.py` to test the connection

### "Model not found" or "Access denied"
- Enable model access in AWS Bedrock Console
- Go to AWS Bedrock → Model access → Manage model access
- Enable Claude 3 Sonnet and other desired models
- Wait a few minutes for activation

### CORS errors in browser
- The API server is configured to allow requests from `localhost:8080`, `localhost:5173`, and `localhost:3000`
- If your frontend runs on a different port, add it to the `allow_origins` list in `api_server.py` line 20

## Production Deployment

For production use:

1. **Secure AWS Credentials**: Use environment variables or AWS IAM roles instead of hardcoding
2. **Add Authentication**: Implement user authentication for the API
3. **Rate Limiting**: Add rate limiting to prevent abuse
4. **HTTPS**: Use HTTPS for all communications
5. **Error Logging**: Set up proper error logging and monitoring
6. **Scale Backend**: Deploy the API server using a proper WSGI server like Gunicorn

## Files Reference

- `api_server.py` - FastAPI backend server
- `bedrock_chatbot.py` - Core chatbot logic and Bedrock integration
- `api_requirements.txt` - Python dependencies for the API server
- `test_bedrock_connection.py` - Test script for AWS Bedrock connection
- `BEDROCK_SETUP_GUIDE.md` - Detailed AWS Bedrock setup guide
- `BEDROCK_README.md` - Original chatbot documentation
- `../src/components/Chatbot.tsx` - React chat component
- `../src/pages/ChatbotPage.tsx` - Chatbot page component

## Support

For issues related to:
- **AWS Bedrock**: See `BEDROCK_SETUP_GUIDE.md`
- **API Backend**: Check `api_server.py` logs
- **Frontend Integration**: Check browser console for errors

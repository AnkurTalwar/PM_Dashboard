# AI Assistant Integration Guide

This document explains how the AI Assistant chatbot is integrated into the Program Pulse dashboard.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   React Frontend                        │
│  (Program Pulse Dashboard - http://localhost:8080)     │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Chatbot Page (/chatbot)                        │  │
│  │  - src/pages/ChatbotPage.tsx                    │  │
│  │                                                  │  │
│  │  ┌────────────────────────────────────────────┐ │  │
│  │  │  Chatbot Component                         │ │  │
│  │  │  - src/components/Chatbot.tsx              │ │  │
│  │  │  - Manages chat UI and state               │ │  │
│  │  │  - Sends HTTP requests to backend          │ │  │
│  │  └────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP/REST API
                       │ (POST /api/chat)
                       ↓
┌─────────────────────────────────────────────────────────┐
│              Python FastAPI Backend                     │
│           (http://localhost:8000)                       │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  API Server                                      │  │
│  │  - chatbot/api_server.py                        │  │
│  │  - Handles HTTP requests                        │  │
│  │  - Manages chat sessions                        │  │
│  │  - CORS configuration                           │  │
│  └────────────────┬─────────────────────────────────┘  │
│                   │                                     │
│                   ↓                                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Bedrock Chatbot Class                          │  │
│  │  - chatbot/bedrock_chatbot.py                   │  │
│  │  - LangChain integration                        │  │
│  │  - Chat history management                      │  │
│  │  - System prompts and context                   │  │
│  └────────────────┬─────────────────────────────────┘  │
└────────────────────┼─────────────────────────────────────┘
                     │ AWS SDK (boto3)
                     ↓
┌─────────────────────────────────────────────────────────┐
│                  AWS Bedrock                            │
│                                                         │
│  - Claude Sonnet 4.5 Model                             │
│  - us.anthropic.claude-sonnet-4-5-20250929-v1:0       │
│  - Hosted LLM inference                                │
└─────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Frontend Components

#### Chatbot Component (`src/components/Chatbot.tsx`)
- **Purpose**: Provides the chat UI interface
- **Key Features**:
  - Message display with user/assistant avatars
  - Input field with send button
  - Loading states and error handling
  - API connection checking
  - Conversation reset functionality
  - Auto-scrolling to latest messages
- **Props**:
  - `apiUrl`: Backend API URL (default: `http://localhost:8000`)
  - `sessionId`: Chat session identifier (default: `"default"`)
  - `dataContext`: Optional dashboard data to include in queries

#### Chatbot Page (`src/pages/ChatbotPage.tsx`)
- **Purpose**: Page wrapper for the Chatbot component
- **Location**: Accessible at `/chatbot` route
- **Navigation**: Added to sidebar as "AI Assistant"

### 2. Backend API Server

#### FastAPI Server (`chatbot/api_server.py`)
- **Purpose**: REST API to expose chatbot functionality
- **Port**: 8000 (configurable)
- **Key Endpoints**:
  
  **POST /api/chat**
  - Send a message and get AI response
  - Request body: `{ message, session_id?, data_context? }`
  - Response: `{ response, session_id }`
  
  **POST /api/chat/reset**
  - Reset conversation history
  - Request body: `{ session_id? }`
  
  **GET /api/sessions**
  - List all active chat sessions
  
  **DELETE /api/sessions/{session_id}**
  - Delete a specific session

- **CORS**: Configured to allow:
  - `http://localhost:8080` (Vite default)
  - `http://localhost:5173` (Vite alt port)
  - `http://localhost:3000` (Create React App default)

### 3. Bedrock Chatbot Class

#### BedrockChatbot (`chatbot/bedrock_chatbot.py`)
- **Purpose**: Core chatbot logic using AWS Bedrock
- **Key Components**:
  - AWS Bedrock client initialization
  - LangChain LCEL chain configuration
  - Chat history management
  - System prompt with dashboard context
  - Response generation with streaming support

- **System Prompt**: Configured to understand:
  - Hours Reconciliation data
  - LTA (Long Term Assignment) compliance
  - Expense policy violations
  - Dashboard metrics and KPIs

## Data Flow

### Typical Chat Interaction

1. **User types a message** in the React chat interface
2. **Frontend sends POST request** to `/api/chat`:
   ```json
   {
     "message": "How many resources have billing violations?",
     "session_id": "default",
     "data_context": "...optional dashboard data..."
   }
   ```
3. **API Server receives request** and routes to appropriate handler
4. **BedrockChatbot.chat()** is called with the message
5. **LangChain processes** the message through the configured chain:
   - System prompt provides context about dashboard capabilities
   - Chat history is included for conversation continuity
   - Optional data context is added to the message
6. **AWS Bedrock Claude model** generates a response
7. **Response flows back** through the layers:
   - BedrockChatbot returns the response
   - API Server wraps it in JSON
   - Frontend receives and displays the message
8. **Chat history updated** for future context

## Session Management

- **Session Storage**: In-memory dictionary in API server
- **Session ID**: Defaults to `"default"`, can be customized
- **Conversation History**: Stored per session
- **Benefits**:
  - Multiple concurrent users
  - Context-aware responses
  - Conversation continuity
- **Limitations**:
  - Lost on server restart (not persisted to disk)
  - Memory usage grows with conversation length

## Configuration Files

### Python Dependencies
- `chatbot/api_requirements.txt` - FastAPI and API server deps
- Install with: `pip install -r api_requirements.txt`
- Main packages: `fastapi`, `uvicorn`, `pydantic`

### AWS Configuration
- Located in `chatbot/bedrock_chatbot.py`
- Lines 29-31: AWS credentials
- Line 50: Model ID selection
- Lines 53-56: Model parameters (temperature, max_tokens)
- Lines 98-124: System prompt customization

### Frontend Configuration
- API URL: `src/components/Chatbot.tsx` line 25
- Change if backend runs on different host/port
- CORS must be updated in both places

## Adding to Navigation

The chatbot was added to the dashboard navigation in two files:

1. **Route Configuration** (`src/App.tsx`):
   ```tsx
   import ChatbotPage from "./pages/ChatbotPage";
   // ...
   <Route path="/chatbot" element={<ChatbotPage />} />
   ```

2. **Sidebar Navigation** (`src/components/AppSidebar.tsx`):
   ```tsx
   import { Bot } from 'lucide-react';
   // ...
   { title: 'AI Assistant', url: '/chatbot', icon: Bot },
   ```

## Extending the Chatbot

### Adding Dashboard Data Context

To make the chatbot aware of dashboard data:

1. **In the parent component**, gather dashboard data:
   ```tsx
   const dashboardData = {
     summary: "Total hours: 1000, Resources: 50",
     violations: violationsList,
     // ... more data
   };
   ```

2. **Pass to Chatbot component**:
   ```tsx
   <Chatbot dataContext={JSON.stringify(dashboardData)} />
   ```

3. **Chatbot automatically includes** this context in every query

### Customizing System Prompt

Edit `chatbot/bedrock_chatbot.py` lines 98-124 to change:
- Chatbot personality
- Available data descriptions
- Response formatting guidelines
- Domain-specific knowledge

### Changing AI Model

Edit `chatbot/bedrock_chatbot.py` line 50:
```python
# Faster, cheaper option:
BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0"

# Current default (balanced):
BEDROCK_MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
```

### Adding Authentication

To secure the API:

1. **Install dependencies**:
   ```powershell
   pip install python-jose[cryptography] passlib[bcrypt]
   ```

2. **Add to `api_server.py`**:
   ```python
   from fastapi.security import HTTPBearer
   
   security = HTTPBearer()
   
   @app.post("/api/chat")
   async def chat(request: ChatRequest, token = Depends(security)):
       # Verify token
       # ... existing code
   ```

3. **Update frontend** to include auth token in requests

## Troubleshooting Integration

### Frontend can't connect to backend
- Check backend is running: `python chatbot/api_server.py`
- Verify port 8000 is available
- Check browser console for CORS errors
- Ensure API URL matches in `Chatbot.tsx`

### Messages not sending
- Check network tab in browser dev tools
- Verify request body format
- Check API server logs for errors
- Ensure AWS credentials are configured

### Responses are slow
- Claude Sonnet 4.5 can take 5-15 seconds
- Consider switching to Claude Haiku for faster responses
- Check AWS region latency
- Monitor token usage (affects speed)

### Chat history not working
- Verify session_id is consistent across requests
- Check server logs for session management
- Restart API server if sessions are corrupted
- Sessions are lost on server restart (expected)

## Security Considerations

### For Production
1. **Never commit AWS credentials** - use environment variables
2. **Add authentication** to API endpoints
3. **Implement rate limiting** to prevent abuse
4. **Use HTTPS** for all communications
5. **Validate all inputs** on backend
6. **Set up monitoring** and logging
7. **Consider using AWS IAM roles** instead of access keys

### Current Setup (Development Only)
- ⚠️ AWS credentials in source code (development only)
- ⚠️ No authentication required
- ⚠️ No rate limiting
- ⚠️ HTTP (not HTTPS)
- ✅ CORS configured for local development
- ✅ Input validation on backend

## Performance Optimization

### Backend
- Use async/await throughout
- Implement caching for repeated queries
- Add connection pooling for AWS
- Consider response streaming for long responses

### Frontend
- Debounce user input
- Implement virtual scrolling for long conversations
- Cache recent messages locally
- Add message pagination

### AWS Bedrock
- Use Claude Haiku for faster responses when appropriate
- Adjust max_tokens based on needs
- Monitor and optimize prompts for token efficiency
- Consider batch processing for multiple queries

## Future Enhancements

### Potential Features
- [ ] Message persistence (database)
- [ ] Multi-user support with proper auth
- [ ] Response streaming for real-time output
- [ ] File upload and analysis
- [ ] Chart/visualization generation
- [ ] Export conversation history
- [ ] Voice input/output
- [ ] Integration with dashboard filters
- [ ] Suggested questions based on current page
- [ ] Real-time data updates in chat context

### Technical Improvements
- [ ] WebSocket support for real-time updates
- [ ] Redis for session management
- [ ] Docker containerization
- [ ] Kubernetes deployment
- [ ] CI/CD pipeline
- [ ] Automated testing
- [ ] Performance monitoring
- [ ] Error tracking (Sentry, etc.)

## Support and Documentation

### Related Files
- `chatbot/README.md` - Detailed setup instructions
- `chatbot/BEDROCK_SETUP_GUIDE.md` - AWS Bedrock configuration
- `chatbot/BEDROCK_README.md` - Original chatbot documentation
- `RUNBOOK.md` - Main dashboard runbook (includes chatbot section)
- `README.md` - Main project readme (includes chatbot feature)

### Getting Help
- Check API docs: `http://localhost:8000/docs`
- Review browser console for frontend errors
- Check terminal for backend errors
- Test AWS connection: `python chatbot/test_bedrock_connection.py`
- Verify setup: `python chatbot/setup.ps1`

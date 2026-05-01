"""
FastAPI server for AWS Bedrock Chatbot
Exposes REST API endpoints for the React frontend to communicate with the chatbot.

Installation Requirements:
pip install fastapi uvicorn python-dotenv

Usage:
uvicorn api_server:app --reload --host 0.0.0.0 --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from bedrock_chatbot import BedrockChatbot
import traceback

app = FastAPI(title="Bedrock Chatbot API")

# Configure CORS to allow requests from the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize chatbot instance
# Store chatbot instances per session (simple in-memory storage)
chatbot_sessions: Dict[str, BedrockChatbot] = {}


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "default"
    data_context: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str


class ResetRequest(BaseModel):
    session_id: Optional[str] = "default"


def get_or_create_chatbot(session_id: str) -> BedrockChatbot:
    """Get existing chatbot or create a new one for the session."""
    if session_id not in chatbot_sessions:
        chatbot_sessions[session_id] = BedrockChatbot()
    return chatbot_sessions[session_id]


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "Bedrock Chatbot API is running"}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a message to the chatbot and get a response.
    
    Args:
        request: ChatRequest with message, optional session_id, and optional data_context
    
    Returns:
        ChatResponse with the chatbot's response
    """
    try:
        chatbot = get_or_create_chatbot(request.session_id)
        response = chatbot.chat(request.message, data_context=request.data_context)
        
        return ChatResponse(
            response=response,
            session_id=request.session_id
        )
    except Exception as e:
        print(f"Error in chat endpoint: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating response: {str(e)}")


@app.post("/api/chat/reset")
async def reset_chat(request: ResetRequest):
    """
    Reset the conversation history for a session.
    
    Args:
        request: ResetRequest with optional session_id
    
    Returns:
        Success message
    """
    try:
        session_id = request.session_id
        if session_id in chatbot_sessions:
            chatbot_sessions[session_id].reset_conversation()
        else:
            # Create a new chatbot for this session
            chatbot_sessions[session_id] = BedrockChatbot()
        
        return {"status": "success", "message": f"Conversation reset for session {session_id}"}
    except Exception as e:
        print(f"Error in reset endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error resetting conversation: {str(e)}")


@app.get("/api/sessions")
async def list_sessions():
    """List all active chat sessions."""
    return {
        "sessions": list(chatbot_sessions.keys()),
        "count": len(chatbot_sessions)
    }


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a specific chat session."""
    if session_id in chatbot_sessions:
        del chatbot_sessions[session_id]
        return {"status": "success", "message": f"Session {session_id} deleted"}
    else:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")


if __name__ == "__main__":
    import uvicorn
    print("Starting Bedrock Chatbot API server...")
    print("API will be available at http://localhost:8000")
    print("API documentation at http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)

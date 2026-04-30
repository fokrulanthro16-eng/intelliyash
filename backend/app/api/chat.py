import json
from typing import List, Literal

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.llm_service import service

router = APIRouter()


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


@router.get("/chat/ping")
def ping():
    return {"ok": True}


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    async def stream():
        async for event in service.chat_stream(messages):
            etype = event.get("type", "message")
            if etype == "meta":
                yield f"event: meta\ndata: {json.dumps(event)}\n\n"
            elif etype == "token":
                yield f"event: token\ndata: {json.dumps({'content': event.get('content', '')})}\n\n"
            elif etype == "error":
                yield f"event: error\ndata: {json.dumps({'error': event.get('error', 'unknown')})}\n\n"
            elif etype == "done":
                yield "event: done\ndata: {}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")

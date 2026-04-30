from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="Blog App  API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

posts = []

class PostCreate(BaseModel):
    title: str
    content: str
    author: str = "Anonymous"

@app.get("/")
def home(): return {"message": "blog-app- API running"}

@app.get("/posts")
def list_posts(): return {"posts": posts}

@app.post("/posts")
def create_post(data: PostCreate):
    post = {"id": len(posts)+1, "title": data.title,
             "content": data.content, "author": data.author}
    posts.append(post); return post

@app.get("/posts/{post_id}")
def get_post(post_id: int):
    for p in posts:
        if p["id"] == post_id: return p
    raise HTTPException(404, "Not found")

@app.delete("/posts/{post_id}")
def delete_post(post_id: int):
    global posts
    posts = [p for p in posts if p["id"] != post_id]
    return {"status": "deleted"}

if __name__ == "__main__": uvicorn.run(app, host="127.0.0.1", port=9100)

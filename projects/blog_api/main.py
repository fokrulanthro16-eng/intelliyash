from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="Blog API")

posts = []

class PostCreate(BaseModel):
    title: str
    content: str
    author: str = "anonymous"

@app.get("/")
def home():
    return {"message": "Blog API running"}

@app.get("/posts")
def list_posts():
    return {"posts": posts}

@app.post("/posts")
def create_post(data: PostCreate):
    post = {
        "id": len(posts) + 1,
        "title": data.title,
        "content": data.content,
        "author": data.author,
    }
    posts.append(post)
    return post

@app.get("/posts/{post_id}")
def get_post(post_id: int):
    for post in posts:
        if post["id"] == post_id:
            return post
    raise HTTPException(status_code=404, detail="Post not found")

@app.delete("/posts/{post_id}")
def delete_post(post_id: int):
    global posts
    before = len(posts)
    posts = [p for p in posts if p["id"] != post_id]
    if len(posts) == before:
        raise HTTPException(status_code=404, detail="Post not found")
    return {"status": "deleted", "id": post_id}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=9200)

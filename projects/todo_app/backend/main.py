from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Todo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

todos = []

@app.get("/")
def home():
    return {"message": "Todo API running"}

@app.get("/todos")
def list_todos():
    return {"todos": todos}

@app.post("/todos")
def create_todo(title: str):
    todo = {"id": len(todos) + 1, "title": title, "done": False}
    todos.append(todo)
    return todo

@app.put("/todos/{todo_id}")
def toggle_todo(todo_id: int):
    for todo in todos:
        if todo["id"] == todo_id:
            todo["done"] = not todo["done"]
            return todo
    return {"error": "Todo not found"}

@app.delete("/todos/{todo_id}")
def delete_todo(todo_id: int):
    global todos
    todos = [todo for todo in todos if todo["id"] != todo_id]
    return {"status": "deleted", "id": todo_id}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=9100)

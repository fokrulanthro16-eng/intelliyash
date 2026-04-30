from fastapi import FastAPI
import uvicorn

app = FastAPI(title="Generated App")

items = []

@app.get("/")
def home():
    return {"message": "Hello from generated project"}

@app.get("/items")
def list_items():
    return {"items": items}

@app.post("/items")
def add_item(name: str):
    item = {"id": len(items) + 1, "name": name}
    items.append(item)
    return item

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=9000)

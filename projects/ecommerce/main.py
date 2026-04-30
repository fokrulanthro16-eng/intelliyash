from fastapi import FastAPI
import uvicorn
from database import Base, engine
from routes import users, products, orders

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Ecommerce Ecommerce API")

app.include_router(users.router)
app.include_router(products.router)
app.include_router(orders.router)


@app.get("/")
def home():
    return {
        "message": "ecommerce ecommerce API running",
        "docs": "http://127.0.0.1:9400/docs"
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=9400)

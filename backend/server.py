"""CreatorForge backend — entrypoint with routers."""
import os
from pathlib import Path
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

from routers import auth, projects, brand_kits, assets, payments, ai_routes

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="CreatorForge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(brand_kits.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(ai_routes.router, prefix="/api")

@app.on_event("shutdown")
async def shutdown():
    client.close()

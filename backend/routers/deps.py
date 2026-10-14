"""Shared dependencies for routers."""
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import auth_utils as auth

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
get_current_user = auth.build_get_current_user(db)

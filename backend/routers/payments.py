"""Stripe and IAP payment routes."""
from fastapi import APIRouter, Depends, HTTPException, Request
from .deps import db, get_current_user
from models import *
from helpers import *

router = APIRouter()

# TODO: paste full implementation

"""Stripe and IAP payment routes."""
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional
from .deps import db, get_current_user
from models import *
from helpers import *
import os
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest

router = APIRouter()

STRIPE_API_KEY = os.environ["STRIPE_API_KEY"]

@router.get("/payments/packages")
async def packages():
    return {"packages": PACKAGES}


@router.post("/payments/checkout")
async def create_checkout(body: CheckoutIn, request: Request, user=Depends(get_current_user)):
    if body.plan not in PACKAGES:
        raise HTTPException(400, "Invalid plan")
    pkg = PACKAGES[body.plan]
    host = request.headers.get("host", "")
    scheme = request.headers.get("x-forwarded-proto", "https")
    host_url = f"{scheme}://{host}"
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    req = CheckoutSessionRequest(
        amount=pkg["amount"],
        currency=pkg["currency"],
        success_url=f"{body.origin_url}/payment-success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{body.origin_url}/payment-cancel",
        metadata={"user_id": user["user_id"], "plan": body.plan},
    )
    session = await stripe.create_checkout_session(req)
    return {"url": session.url, "session_id": session.session_id}


@router.get("/payments/status/{session_id}")
async def payment_status(session_id: str, user=Depends(get_current_user)):
    stripe = StripeCheckout(api_key=STRIPE_API_KEY)
    status = await stripe.get_checkout_status(session_id)
    return {"status": status.status, "payment_status": status.payment_status}


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("Stripe-Signature")
    stripe = StripeCheckout(api_key=STRIPE_API_KEY)
    try:
        event = await stripe.handle_webhook(payload, sig)
    except Exception:
        raise HTTPException(400, "Invalid webhook")
    if event.type == "checkout.session.completed":
        session = event.data.object
        user_id = session.metadata.get("user_id")
        plan = session.metadata.get("plan")
        if user_id and plan in PACKAGES:
            days = PACKAGES[plan]["days"]
            until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {"plan": "premium", "premium_until": until}},
            )
    return {"ok": True}


@router.get("/payments/iap/products")
async def iap_products():
    return {"products": IAP_PRODUCTS}


@router.post("/payments/iap/verify")
async def verify_iap(body: IAPVerifyIn, user=Depends(get_current_user)):
    if body.product_id not in IAP_PRODUCTS:
        raise HTTPException(400, "Unknown product")
    plan = IAP_PRODUCTS[body.product_id]
    if body.platform == "ios":
        info, err = await _verify_apple(body.receipt)
    else:
        if not body.purchase_token:
            raise HTTPException(400, "Missing purchase token")
        info, err = await _verify_google(body.product_id, body.purchase_token)
    if err:
        raise HTTPException(400 if "not_configured" not in err else 503, err)
    # grant premium (idempotent)
    txn_key = info.get("transaction_id")
    existing = await db.iap_transactions.find_one({"transaction_id": txn_key})
    if not existing:
        await db.iap_transactions.insert_one({
            "transaction_id": txn_key,
            "user_id": user["user_id"],
            "product_id": body.product_id,
            "platform": body.platform,
            "created_at": now_iso(),
        })
        days = PACKAGES[plan]["days"]
        until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"plan": "premium", "premium_until": until}},
        )
    return {"ok": True, "plan": plan}

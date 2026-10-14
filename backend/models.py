"""Pydantic models for CreatorForge."""
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleIn(BaseModel):
    session_id: str


class RefineIn(BaseModel):
    raw_idea: str
    mode: str = "plan"


class ProjectIn(BaseModel):
    title: str
    summary: str = ""
    pitch: str = ""
    target_audience: str = ""
    value_prop: str = ""
    tasks: List[str] = []
    brand_keywords: List[str] = []
    source_idea: str = ""


class ProjectPatch(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    status: Optional[str] = None
    tasks: Optional[list] = None
    brand_kit_id: Optional[str] = None


class RefineProjectIn(BaseModel):
    project_id: str
    message: str


class TaglineIn(BaseModel):
    context: str


class BrandKitIn(BaseModel):
    project_id: Optional[str] = None
    name: Optional[str] = None
    context: str = ""
    auto_generate: bool = True
    colors: Optional[list] = None
    fonts: Optional[dict] = None
    style_rules: Optional[list] = None


class BrandKitPatch(BaseModel):
    name: Optional[str] = None
    colors: Optional[list] = None
    fonts: Optional[dict] = None
    style_rules: Optional[list] = None


class AssetIn(BaseModel):
    prompt: str
    type: str = "social"
    project_id: Optional[str] = None
    brand_kit_id: Optional[str] = None


class RegenerateIn(BaseModel):
    prompt: Optional[str] = None


class PackagingIn(BaseModel):
    brand_kit_id: str
    style: str = "box"
    images: List[str] = []


class RevertIn(BaseModel):
    version_id: str


class PublishIn(BaseModel):
    public: bool
    alias: Optional[str] = None


class ReportIn(BaseModel):
    reason: Optional[str] = None


class CheckoutIn(BaseModel):
    plan: str
    origin_url: str


class IAPVerifyIn(BaseModel):
    platform: str
    product_id: str
    transaction_id: Optional[str] = None
    purchase_token: Optional[str] = None
    receipt: Optional[str] = None


class FlagsPatch(BaseModel):
    beta_premium_enabled: Optional[bool] = None
    demo_account_visible: Optional[bool] = None
    allow_new_signups: Optional[bool] = None


class AdmtOptOutIn(BaseModel):
    opt_out: bool

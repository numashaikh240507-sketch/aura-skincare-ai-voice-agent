import os
import re
import time
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Form

from pydantic import BaseModel, Field
from groq import Groq
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://aura-skincare-ai-voice-agent-1-rxtq.onrender.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"

# Load local .env when present; Render uses dashboard environment variables.
if ENV_FILE.is_file():
    load_dotenv(dotenv_path=ENV_FILE, override=False)

GROQ_API_KEY = (os.getenv("GROQ_API_KEY") or "").strip()
GROQ_MODEL = (os.getenv("GROQ_MODEL") or "openai/gpt-oss-20b").strip()

if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is missing. Configure it in Render Environment settings or backend/.env.")

client = Groq(
    api_key=GROQ_API_KEY,
    timeout=25.0,
    max_retries=0,
)

UPLOAD_DIR = BASE_DIR / "private_damage_uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_IMAGE_SIZE = 5 * 1024 * 1024

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="Aura Skincare AI Voice Agent",
    description="Aura customer support, AI chat and damage-photo uploads",
    version="2.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# ASSESSMENT MOCK ORDER DATABASE
# ============================================================

ORDERS = {
    "ORD-101": {
        "order_id": "ORD-101",
        "customer_name": "Priya Sharma",
        "product": "Vitamin C Serum (30ml)",
        "status": "Out for Delivery",
        "courier": "BlueDart",
        "tracking_number": "BD-982103",
        "expected_delivery": "Today by 6 PM",
        "payment_method": "Not specified in assessment",
        "amount": 699,
        "notes": "Expected by 6 PM today.",
    },
    "ORD-102": {
        "order_id": "ORD-102",
        "customer_name": "Rahul Verma",
        "product": "Hydrating Sunscreen SPF 50",
        "status": "Delivered",
        "courier": "Delhivery",
        "tracking_number": "DL-441029",
        "expected_delivery": "Delivered 14 days ago",
        "payment_method": "Not specified in assessment",
        "amount": 499,
        "notes": "Delivered 14 days ago.",
    },
    "ORD-103": {
        "order_id": "ORD-103",
        "customer_name": "Ananya Patel",
        "product": "Green Tea Face Wash + Toner",
        "status": "Processing",
        "courier": "Not assigned",
        "tracking_number": "Not available",
        "expected_delivery": "Not specified in assessment",
        "payment_method": "Not specified in assessment",
        "amount": 850,
        "notes": (
            "Ordered 3 hours ago. Eligible for cancellation "
            "while the order status remains Processing."
        ),
    },
}


# ============================================================
# AURA SKINCARE POLICIES
# ============================================================

POLICIES = {
    "brand": (
        "Aura Skincare is a premium organic Indian skincare brand "
        "focused on simple, effective skincare products made with "
        "thoughtfully selected ingredients."
    ),
    "shipping": (
        "Free delivery applies to orders above ₹499. Orders below ₹499 "
        "have a ₹50 shipping fee. Standard delivery takes 3–5 business "
        "days. The assessment does not specify the shipping fee for an "
        "order of exactly ₹499, so do not invent a special rule for it. "
        "Use the order record for current status and tracking details."
    ),
    "returns": (
        "Returns are accepted within 7 days of delivery only for "
        "unopened, unused products in original packaging. A product "
        "delivered 14 days ago is outside the 7-day return window. "
        "Opened or used products do not meet the stated return conditions. "
        "Never promise a return or refund outside this policy."
    ),
    "refunds": (
        "Refund requests must follow the return policy and any required "
        "support review. Never claim a refund has been approved, initiated "
        "or completed unless the system explicitly confirms it."
    ),
    "damaged": (
        "Damaged or defective products must be reported within 48 hours "
        "of delivery with photos for replacement. Ask for the order ID, "
        "clear photos and a description. The support team must review the "
        "evidence; never promise a replacement before confirmation."
    ),
    "cancellation": (
        "Orders can be cancelled only while their status is Processing. "
        "Once an order is Shipped or Out for Delivery, it cannot be "
        "cancelled. Customers may refuse delivery at the doorstep. "
        "Check the order record before explaining eligibility."
    ),
    "cod": (
        "Cash on Delivery is available for orders up to ₹2,500. Customers "
        "can pay by cash or UPI at the doorstep. Do not assume an order's "
        "payment method unless its record confirms it."
    ),
    "skincare": (
        "Provide general skincare information, not a medical diagnosis. "
        "Recommend following product labels, introducing active ingredients "
        "gradually, patch testing new products, and using broad-spectrum "
        "sunscreen during the day. Do not invent product ingredients or "
        "guarantee results. Persistent or severe skin problems should be "
        "discussed with a qualified healthcare professional. Severe swelling "
        "or difficulty breathing requires emergency medical care."
    ),
}


# ============================================================
# AI INSTRUCTIONS
# ============================================================

SYSTEM_INSTRUCTION = """
You are Aria, the friendly, professional and concise Indian customer
support specialist for Aura Skincare.

SCOPE:
- Help with Aura Skincare products, general skincare information,
  order tracking, shipping, returns, refunds, damaged products,
  cancellations and payments.
- If asked to do something unrelated to Aura Skincare, politely explain
  that you can only help with Aura Skincare customer support.
- Do not claim to have performed an action unless a tool or system
  confirms it.

VOICE AND RESPONSE STYLE:
- Sound natural, warm, calm and conversational.
- For voice answers, normally use 1–4 concise sentences.
- Answer the customer's actual question first.
- Avoid unnecessary repetition and long awkward explanations.
- Finish with a complete sentence.
- Maintain context from the conversation.

ORDER ACCURACY:
- Use the supplied order record and policy information.
- Never invent order details, tracking links, ingredients, delivery dates,
  refunds, cancellations or completed support actions.
- If the order record is missing, say you could not locate the order and
  ask the customer to verify the order ID.
- Distinguish estimates from confirmed facts.
- Do not assume a payment method if it is not specified in the order record.

POLICY GUARDRAILS:
- Returns: within 7 days of delivery, for unopened and unused products
  in original packaging.
- Damaged or defective products: report within 48 hours of delivery with
  photos for replacement; support review is required.
- Cancellation: only while Processing. Shipped or Out for Delivery orders
  cannot be cancelled; customers may refuse delivery at the doorstep.
- Shipping: free above ₹499; orders below ₹499 have a ₹50 fee; standard
  delivery takes 3–5 business days. The exact ₹499 fee boundary is not
  specified; do not invent a rule.
- COD: available for orders up to ₹2,500, payable by cash or UPI at
  the doorstep.
- Do not simply agree to a customer's request if it violates policy.
- Never promise a refund, replacement, cancellation or exception that
  the policy or system does not authorize.

SKINCARE SAFETY:
- Provide general educational information, not a medical diagnosis.
- Do not invent product ingredients or guarantee results.
- Suggest patch testing and following product labels.
- Recommend a qualified healthcare professional for persistent or severe
  symptoms.

Be accurate, helpful and honest about information you do not have.
"""


# ============================================================
# REQUEST MODELS AND IN-MEMORY DEMO LOGS
# ============================================================

class SupportRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[dict[str, Any]] = Field(default_factory=list)


class CallLogRequest(BaseModel):
    message: str = ""
    response: str = ""
    order_id: str | None = None
    channel: str = "text"
    duration_seconds: float | None = None
    status: str = "completed"
    transcript: list[dict[str, Any]] = Field(default_factory=list)
    summary: dict[str, Any] | None = None


CALL_LOGS: list[dict[str, Any]] = []
DAMAGE_REPORTS: list[dict[str, Any]] = []


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def find_order_id(message: str) -> str | None:
    match = re.search(r"\bORD[- ]?\d{3,}\b", message, re.IGNORECASE)
    if not match:
        return None

    value = match.group(0).upper().replace(" ", "-")
    if not value.startswith("ORD-"):
        value = "ORD-" + value[3:]
    return value


def get_order(order_id: str | None) -> dict[str, Any] | None:
    if not order_id:
        return None
    return ORDERS.get(order_id.strip().upper())


def infer_intent(message: str) -> str:
    text = message.lower()

    if any(word in text for word in [
        "refund", "money back", "reimbursement"
    ]):
        return "refunds"

    if any(word in text for word in [
        "return", "exchange"
    ]):
        return "returns"

    if any(word in text for word in [
        "damaged", "broken", "leaking", "defective", "arrived damaged",
        "product damage"
    ]):
        return "damaged"

    if any(word in text for word in [
        "cancel", "cancellation"
    ]):
        return "cancellation"

    if any(word in text for word in [
        "cash on delivery", "cod", "payment", "pay at the door"
    ]):
        return "cod"

    if any(word in text for word in [
        "delivery", "tracking", "shipped", "dispatch", "order", "where is"
    ]):
        return "shipping"

    if any(word in text for word in [
        "skin", "serum", "acne", "pimple", "moisturizer", "moisturiser",
        "cleanser", "sunscreen", "sensitive", "vitamin c", "routine",
        "dry skin", "oily skin", "dark spots", "ingredients", "irritation",
        "pigmentation", "blackheads", "whiteheads"
    ]):
        return "skincare"

    return "general"


def build_prompt(
    message: str,
    history: list[dict[str, Any]],
    order: dict[str, Any] | None,
    intent: str,
) -> str:
    relevant_policies = {
        "brand": POLICIES["brand"],
        "skincare": POLICIES["skincare"],
    }

    if intent in POLICIES:
        relevant_policies[intent] = POLICIES[intent]

    recent_history = []
    for item in history[-8:]:
        role = str(item.get("role", "user")).lower()
        content = str(item.get("content", item.get("text", ""))).strip()

        if role in ("user", "assistant") and content:
            recent_history.append({
                "role": role,
                "content": content[:700],
            })

    return f"""
CUSTOMER MESSAGE:
{message}

DETECTED INTENT:
{intent}

MATCHING ORDER RECORD:
{order if order else "No matching order record was found."}

RELEVANT AURA POLICIES:
{relevant_policies}

RECENT CONVERSATION:
{recent_history if recent_history else "No previous messages."}

Instructions:
Answer directly and naturally. Use only the supplied order record and
policies. If an order ID was mentioned but no record was found, ask the
customer to verify it. If the question is outside Aura Skincare support,
politely explain the scope. Never invent facts or claim an action occurred
without confirmation.
"""


# ============================================================
# BASIC ROUTES
# ============================================================

@app.get("/")
def home():
    return {
        "app": "Aura Skincare AI Voice Agent",
        "assistant": "Aria",
        "status": "running",
        "provider": "Groq",
        "model": GROQ_MODEL,
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "provider": "Groq",
        "model": GROQ_MODEL,
    }


@app.get("/api-info")
def api_info():
    return {
        "name": "Aura Skincare AI Voice Agent API",
        "version": "2.3.0",
        "provider": "Groq",
        "model": GROQ_MODEL,
        "routes": [
            "/", "/health", "/api-info", "/orders",
            "/orders/{order_id}", "/tool/get_order_details",
            "/policies", "/support/check", "/support/damaged-photo",
            "/damage-reports", "/call-logs",
        ],
    }


# ============================================================
# ORDER LOOKUP ROUTES
# ============================================================

@app.get("/orders")
def list_orders():
    return {
        "count": len(ORDERS),
        "orders": list(ORDERS.values()),
    }


@app.get("/orders/{order_id}")
def order_details(order_id: str):
    order = get_order(order_id)
    if not order:
        raise HTTPException(
            status_code=404,
            detail=f"No order was found for {order_id}.",
        )
    return order


@app.get("/tool/get_order_details")
def tool_get_order_details(order_id: str):
    order = get_order(order_id)
    if not order:
        return {
            "success": False,
            "message": f"No order found for {order_id}.",
            "order": None,
        }
    return {"success": True, "order": order}


# ============================================================
# POLICY ROUTE
# ============================================================

@app.get("/policies")
def get_policies():
    return POLICIES


# ============================================================
# GROQ AI SUPPORT ROUTE
# ============================================================

@app.post("/support/check")
def support_check(request: SupportRequest):
    start_time = time.perf_counter()
    message = request.message.strip()

    if not message:
        raise HTTPException(status_code=400, detail="Please enter a message.")

    order_id = find_order_id(message)
    order = get_order(order_id)
    intent = infer_intent(message)

    prompt = build_prompt(
        message=message,
        history=request.history,
        order=order,
        intent=intent,
    )

    try:
        completion = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_INSTRUCTION},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_completion_tokens=700,
        )

        answer = completion.choices[0].message.content
        if not answer or not answer.strip():
            raise HTTPException(
                status_code=502,
                detail="The AI returned an empty answer. Please try again.",
            )

        elapsed = round(time.perf_counter() - start_time, 2)
        return {
            "success": True,
            "answer": answer.strip(),
            "provider": "Groq",
            "model": GROQ_MODEL,
            "response_time_seconds": elapsed,
            "order_id": order_id,
            "order": order,
            "intent": intent,
        }

    except HTTPException:
        raise
    except Exception as exc:
        elapsed = round(time.perf_counter() - start_time, 2)
        error_text = str(exc).lower()

        print(
            f"[Aura Groq ERROR] Model={GROQ_MODEL} "
            f"Time={elapsed}s Error={type(exc).__name__}: {exc}"
        )

        if any(term in error_text for term in [
            "401", "authentication", "invalid_api_key", "unauthorized"
        ]):
            detail = (
                "Groq authentication failed. Check GROQ_API_KEY "
                "in the backend .env file."
            )
            status_code = 503
        elif any(term in error_text for term in [
            "model_not_found", "model not found", "does not exist", "404"
        ]):
            detail = (
                f"The Groq model '{GROQ_MODEL}' is unavailable. "
                "Check GroqCloud for a supported model ID."
            )
            status_code = 503
        elif any(term in error_text for term in [
            "rate_limit", "rate limit", "429", "quota"
        ]):
            detail = (
                "The Groq usage limit has been reached. "
                "Wait and try again, or check your account limits."
            )
            status_code = 503
        elif any(term in error_text for term in ["timeout", "timed out"]):
            detail = "The AI request timed out. Please try again."
            status_code = 504
        else:
            detail = (
                "Aura could not get a response from Groq. "
                "Check the backend terminal for the error."
            )
            status_code = 502

        raise HTTPException(status_code=status_code, detail=detail)


# ============================================================
# DAMAGED PRODUCT PHOTO UPLOAD
# ============================================================

@app.post("/support/damaged-photo")
async def upload_damaged_product_photo(
    photo: UploadFile = File(...),
    order_id: str = Form(default=""),
    description: str = Form(default=""),
):
    order_id = order_id.strip().upper()
    description = description.strip()

    if len(order_id) > 50:
        raise HTTPException(status_code=400, detail="The order ID is too long.")

    if len(description) > 1000:
        raise HTTPException(
            status_code=400,
            detail="The description must be 1000 characters or fewer.",
        )

    if order_id and not re.fullmatch(r"ORD-\d{3,}", order_id):
        raise HTTPException(
            status_code=400,
            detail="Enter a valid order ID, for example ORD-101.",
        )

    if order_id and not get_order(order_id):
        raise HTTPException(
            status_code=404,
            detail=(
                "This demo could not find that order. "
                "Check the order ID before submitting the photo."
            ),
        )

    content_type = (photo.content_type or "").lower().strip()
    if content_type not in ALLOWED_IMAGE_TYPES:
        await photo.close()
        raise HTTPException(
            status_code=415,
            detail="Upload a JPG, PNG or WEBP image.",
        )

    try:
        image_bytes = await photo.read(MAX_IMAGE_SIZE + 1)
    finally:
        await photo.close()

    if not image_bytes:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")

    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="The image exceeds the 5 MB upload limit.",
        )

    if content_type == "image/jpeg":
        valid_signature = image_bytes.startswith(b"\xff\xd8\xff")
    elif content_type == "image/png":
        valid_signature = image_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    else:
        valid_signature = (
            len(image_bytes) >= 12
            and image_bytes[:4] == b"RIFF"
            and image_bytes[8:12] == b"WEBP"
        )

    if not valid_signature:
        raise HTTPException(
            status_code=400,
            detail="The file does not appear to be a valid JPG, PNG or WEBP image.",
        )

    report_id = str(uuid.uuid4())
    saved_filename = f"{report_id}{ALLOWED_IMAGE_TYPES[content_type]}"
    saved_path = UPLOAD_DIR / saved_filename

    try:
        saved_path.write_bytes(image_bytes)
    except OSError:
        raise HTTPException(
            status_code=500,
            detail="Aura could not save the image. Please try again.",
        )

    report = {
        "report_id": report_id,
        "order_id": order_id or None,
        "description": description or "No description provided.",
        "filename": saved_filename,
        "content_type": content_type,
        "size_bytes": len(image_bytes),
        "status": "submitted_for_support_review",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    DAMAGE_REPORTS.append(report)

    print(
        f"[Aura Damage Report] Report={report_id} "
        f"Order={order_id or 'not provided'} Image={saved_filename}"
    )

    return {
        "success": True,
        "message": (
            "Your damage photo has been received. Aura support can review "
            "the submitted evidence. Please keep the product and packaging "
            "until support responds."
        ),
        "report": report,
    }


@app.get("/damage-reports")
def get_damage_reports():
    return {
        "count": len(DAMAGE_REPORTS),
        "reports": DAMAGE_REPORTS,
        "note": (
            "Demo metadata is held in memory and resets when the backend "
            "restarts. Uploaded images are stored in a private folder and "
            "are not served publicly. Protect this endpoint before production."
        ),
    }


# ============================================================
# CALL LOG ROUTES
# ============================================================

@app.post("/call-logs")
def create_call_log(log: CallLogRequest):
    entry = log.model_dump()
    entry["id"] = len(CALL_LOGS) + 1
    entry["created_at"] = datetime.now(timezone.utc).isoformat()
    CALL_LOGS.append(entry)

    return {
        "success": True,
        "message": "Call log saved.",
        "log": entry,
    }


@app.get("/call-logs")
def get_call_logs():
    return {
        "count": len(CALL_LOGS),
        "logs": CALL_LOGS,
    }

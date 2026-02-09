from fastapi import FastAPI, APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import json
import asyncio
import secrets
import hashlib
from collections import defaultdict
import time
from integrations.llm.chat import LlmChat, UserMessage
from integrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'talknow_secret_key_2025')
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY')

# Create the main app
app = FastAPI(title="TalkNow API")
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== RATE LIMITING & ABUSE DETECTION ====================

class RateLimiter:
    def __init__(self):
        self.requests: Dict[str, List[float]] = defaultdict(list)
        self.blocked_ips: Dict[str, float] = {}
        self.abuse_scores: Dict[str, float] = defaultdict(float)
        
    def get_client_id(self, request: Request) -> str:
        """Get unique client identifier from IP + fingerprint"""
        forwarded = request.headers.get("X-Forwarded-For")
        ip = forwarded.split(",")[0] if forwarded else request.client.host
        user_agent = request.headers.get("User-Agent", "")
        fingerprint = hashlib.md5(f"{ip}:{user_agent}".encode()).hexdigest()[:16]
        return f"{ip}:{fingerprint}"
    
    def is_blocked(self, client_id: str) -> bool:
        """Check if client is temporarily blocked"""
        if client_id in self.blocked_ips:
            if time.time() < self.blocked_ips[client_id]:
                return True
            del self.blocked_ips[client_id]
        return False
    
    def block_client(self, client_id: str, duration_seconds: int = 300):
        """Block client for specified duration"""
        self.blocked_ips[client_id] = time.time() + duration_seconds
        logger.warning(f"Blocked client {client_id} for {duration_seconds}s")
    
    def check_rate_limit(self, client_id: str, limit: int = 60, window: int = 60) -> bool:
        """Check if client exceeds rate limit (requests per window)"""
        now = time.time()
        window_start = now - window
        
        # Clean old requests
        self.requests[client_id] = [t for t in self.requests[client_id] if t > window_start]
        
        # Check limit
        if len(self.requests[client_id]) >= limit:
            self.abuse_scores[client_id] += 1
            if self.abuse_scores[client_id] >= 5:
                self.block_client(client_id, 600)  # 10 min block
            return False
        
        self.requests[client_id].append(now)
        return True
    
    def record_suspicious_activity(self, client_id: str, severity: float = 1.0):
        """Record suspicious activity for abuse detection"""
        self.abuse_scores[client_id] += severity
        if self.abuse_scores[client_id] >= 10:
            self.block_client(client_id, 3600)  # 1 hour block
            self.abuse_scores[client_id] = 0

rate_limiter = RateLimiter()

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path in ["/api/", "/api/health"]:
            return await call_next(request)
        
        client_id = rate_limiter.get_client_id(request)
        
        # Check if blocked
        if rate_limiter.is_blocked(client_id):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again later."}
            )
        
        # Apply different limits based on endpoint
        if "/auth/" in request.url.path:
            limit, window = 20, 60  # 20 auth requests per minute
        elif "/chat/" in request.url.path:
            limit, window = 100, 60  # 100 chat requests per minute
        elif "/admin/" in request.url.path:
            limit, window = 200, 60  # 200 admin requests per minute
        else:
            limit, window = 60, 60  # Default: 60 per minute
        
        if not rate_limiter.check_rate_limit(client_id, limit, window):
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please slow down."}
            )
        
        return await call_next(request)

# ==================== TURN/STUN CONFIGURATION ====================

# Production-ready ICE servers with TURN support
ICE_SERVERS = [
    {"urls": "stun:stun.l.google.com:19302"},
    {"urls": "stun:stun1.l.google.com:19302"},
    {"urls": "stun:stun2.l.google.com:19302"},
    {"urls": "stun:stun3.l.google.com:19302"},
    {"urls": "stun:stun4.l.google.com:19302"},
    # OpenRelay TURN servers (free tier)
    {
        "urls": "turn:openrelay.metered.ca:80",
        "username": "openrelayproject",
        "credential": "openrelayproject"
    },
    {
        "urls": "turn:openrelay.metered.ca:443",
        "username": "openrelayproject",
        "credential": "openrelayproject"
    },
    {
        "urls": "turn:openrelay.metered.ca:443?transport=tcp",
        "username": "openrelayproject",
        "credential": "openrelayproject"
    }
]

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    username: Optional[str] = None
    gender: Optional[str] = None  # male, female, other, prefer_not_to_say

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    username: str
    gender: Optional[str] = None  # male, female, other, prefer_not_to_say
    is_premium: bool = False
    is_admin: bool = False
    premium_tier: Optional[str] = None
    interests: List[str] = []
    total_chats: int = 0
    reports_received: int = 0
    is_banned: bool = False
    is_verified: bool = False
    has_used_trial: bool = False
    created_at: str

class AnonymousToken(BaseModel):
    token: str
    session_id: str
    created_at: str

class ChatSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user1_id: str
    user2_id: str
    user1_anonymous: bool = True
    user2_anonymous: bool = True
    status: str = "active"
    started_at: str
    ended_at: Optional[str] = None
    chat_type: str = "text"

class ChatMessage(BaseModel):
    session_id: str
    sender_id: str
    content: str
    message_type: str = "text"
    is_flagged: bool = False
    moderation_score: Optional[float] = None

class ReportCreate(BaseModel):
    session_id: str
    reported_user_id: str
    reason: str
    description: Optional[str] = None

class ModerationResult(BaseModel):
    is_safe: bool
    confidence: float
    categories: Dict[str, float]
    action: str

class PaymentTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: Optional[str] = None
    session_id: str
    amount: float
    currency: str
    status: str
    package_id: str
    created_at: str
    updated_at: str

class EmailVerificationRequest(BaseModel):
    email: EmailStr

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

# SaaS Settings Model
class SystemSettings(BaseModel):
    # SMTP
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@talknow.com"
    
    # Feature Flags
    enable_registrations: bool = True
    enable_email_verification: bool = True
    maintenance_mode: bool = False
    
    # Third Party Keys
    stripe_public_key: str = ""
    stripe_secret_key: str = ""
    openai_api_key: str = ""
    
    # Global SEO
    site_title: str = "TalkNow - Random Video Chat"
    site_description: str = "Connect with strangers instantly via HD video chat."
    site_keywords: str = "video chat, random chat, talk to strangers"
    og_image_url: str = ""

class SystemSettingsUpdate(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    enable_registrations: Optional[bool] = None
    enable_email_verification: Optional[bool] = None
    maintenance_mode: Optional[bool] = None
    stripe_public_key: Optional[str] = None
    stripe_secret_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    site_title: Optional[str] = None
    site_description: Optional[str] = None
    site_keywords: Optional[str] = None
    og_image_url: Optional[str] = None

class ContentPage(BaseModel):
    id: str
    slug: str     # e.g., "privacy-policy", "about"
    title: str
    content: str  # HTML/Markdown
    published: bool = True
    
    # Page-Specific SEO
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    meta_keywords: Optional[str] = None
    updated_at: str

# ... (Auth Helpers) ...

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_jwt_token(user_id: str, is_anonymous: bool = False, token_type: str = "access") -> str:
    if token_type == "verification":
        exp = datetime.now(timezone.utc) + timedelta(hours=24)
    elif token_type == "reset":
        exp = datetime.now(timezone.utc) + timedelta(hours=1)
    else:
        exp = datetime.now(timezone.utc) + timedelta(days=7)
    
    payload = {
        "user_id": user_id,
        "is_anonymous": is_anonymous,
        "type": token_type,
        "exp": exp
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def decode_jwt_token(token: str, expected_type: str = "access") -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if expected_type and payload.get("type", "access") != expected_type:
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(request: Request) -> Optional[Dict]:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ")[1]
    payload = decode_jwt_token(token)
    return payload

async def get_admin_user(user: Dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_doc = await db.users.find_one({"id": user["user_id"]}, {"_id": 0})
    if not user_doc or not user_doc.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin privileges required")
    
    return user

def generate_verification_code() -> str:
    """Generate a 6-digit verification code"""
    return ''.join([str(secrets.randbelow(10)) for _ in range(6)])

# ==================== EMAIL SIMULATION ====================
# Note: In production, integrate with SendGrid/Resend for real emails

async def send_verification_email(email: str, code: str, token: str):
    """Simulate sending verification email - logs to console"""
    logger.info(f"📧 VERIFICATION EMAIL to {email}")
    logger.info(f"   Code: {code}")
    logger.info(f"   Token: {token[:20]}...")
    # Store in DB for verification
    await db.email_verifications.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "code": code,
            "token": token,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "used": False
        }},
        upsert=True
    )

async def send_password_reset_email(email: str, token: str):
    """Simulate sending password reset email - logs to console"""
    logger.info(f"📧 PASSWORD RESET EMAIL to {email}")
    logger.info(f"   Reset Token: {token[:20]}...")
    # Store in DB
    await db.password_resets.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "token": token,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "used": False
        }},
        upsert=True
    )

# ==================== AI MODERATION ====================

async def moderate_content(content: str) -> ModerationResult:
    """Use GPT-5.2 to moderate chat content"""
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"mod-{uuid.uuid4()}",
            system_message="""You are a content moderation AI. Analyze the message for:
- Toxicity (harassment, hate speech)
- Sexual content
- Violence
- Spam/scam
- Personal info sharing

Respond ONLY with valid JSON:
{"is_safe": true/false, "confidence": 0.0-1.0, "categories": {"toxicity": 0.0-1.0, "sexual": 0.0-1.0, "violence": 0.0-1.0, "spam": 0.0-1.0}, "action": "allow/warn/block"}"""
        ).with_model("openai", "gpt-5.2")
        
        message = UserMessage(text=f"Moderate this message: {content}")
        response = await chat.send_message(message)
        
        # Parse JSON response
        result = json.loads(response)
        return ModerationResult(**result)
    except Exception as e:
        logger.error(f"Moderation error: {e}")
        return ModerationResult(is_safe=True, confidence=0.5, categories={}, action="allow")

# ==================== MATCHMAKING ====================

matchmaking_queue: Dict[str, Dict] = {}
active_sessions: Dict[str, Dict] = {}
websocket_connections: Dict[str, WebSocket] = {}

class MatchmakingManager:
    def __init__(self):
        self.queue: Dict[str, Dict] = {}
        self.lock = asyncio.Lock()
    
    async def add_to_queue(self, user_id: str, interests: List[str] = [], prefer_video: bool = False, 
                           is_premium: bool = False, is_trial: bool = False,
                           gender: Optional[str] = None, gender_preference: Optional[str] = None):
        async with self.lock:
            self.queue[user_id] = {
                "user_id": user_id,
                "interests": interests,
                "prefer_video": prefer_video,
                "is_premium": is_premium,
                "is_trial": is_trial,
                "gender": gender,
                "gender_preference": gender_preference,  # Only works for premium users
                "joined_at": datetime.now(timezone.utc).isoformat()
            }
    
    async def remove_from_queue(self, user_id: str):
        async with self.lock:
            if user_id in self.queue:
                del self.queue[user_id]
    
    async def find_match(self, user_id: str) -> Optional[str]:
        async with self.lock:
            if user_id not in self.queue:
                return None
            
            user_data = self.queue[user_id]
            best_match = None
            best_score = -1
            
            for other_id, other_data in self.queue.items():
                if other_id == user_id:
                    continue
                
                # Gender filter - PREMIUM ONLY feature
                # If premium user has gender preference, filter by it
                if user_data["is_premium"] and user_data.get("gender_preference"):
                    if other_data.get("gender") != user_data["gender_preference"]:
                        continue  # Skip users that don't match gender preference
                
                # If other user is premium with gender preference, check if we match
                if other_data["is_premium"] and other_data.get("gender_preference"):
                    if user_data.get("gender") != other_data["gender_preference"]:
                        continue  # Skip if we don't match their preference
                
                score = 0
                
                # Interest matching - FREE for everyone
                common_interests = set(user_data["interests"]) & set(other_data["interests"])
                score += len(common_interests) * 10
                
                # Same chat type preference
                if user_data["prefer_video"] == other_data["prefer_video"]:
                    score += 5
                
                # Premium users get slight priority in queue
                if other_data["is_premium"] or other_data.get("is_trial"):
                    score += 3
                
                if score > best_score:
                    best_score = score
                    best_match = other_id
            
            logger.info(f"Match found for {user_id}: {best_match} (Score: {best_score})")
            return best_match

matchmaking_manager = MatchmakingManager()

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(user: UserCreate, background_tasks: BackgroundTasks):
    existing = await db.users.find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    verification_code = generate_verification_code()
    verification_token = create_jwt_token(user_id, token_type="verification")
    
    user_doc = {
        "id": user_id,
        "email": user.email,
        "username": user.username or user.email.split("@")[0],
        "password_hash": hash_password(user.password),
        "gender": user.gender,
        "is_premium": False,
        "premium_tier": None,
        "interests": [],
        "total_chats": 0,
        "reports_received": 0,
        "is_banned": False,
        "is_verified": False,
        "has_used_trial": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    
    # Send verification email in background
    background_tasks.add_task(send_verification_email, user.email, verification_code, verification_token)
    
    token = create_jwt_token(user_id)
    return {
        "token": token, 
        "user": UserProfile(**user_doc),
        "message": "Please check your email to verify your account"
    }

@api_router.post("/auth/verify-email")
async def verify_email(code: str, user: Dict = Depends(get_current_user)):
    """Verify email with 6-digit code"""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_doc = await db.users.find_one({"id": user["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check verification record
    verification = await db.email_verifications.find_one({
        "email": user_doc["email"],
        "code": code,
        "used": False
    })
    
    if not verification:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    
    # Mark as verified
    await db.users.update_one(
        {"id": user["user_id"]},
        {"$set": {"is_verified": True}}
    )
    await db.email_verifications.update_one(
        {"email": user_doc["email"]},
        {"$set": {"used": True}}
    )
    
    return {"success": True, "message": "Email verified successfully"}

@api_router.post("/auth/resend-verification")
async def resend_verification(background_tasks: BackgroundTasks, user: Dict = Depends(get_current_user)):
    """Resend verification email"""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_doc = await db.users.find_one({"id": user["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_doc.get("is_verified"):
        raise HTTPException(status_code=400, detail="Email already verified")
    
    verification_code = generate_verification_code()
    verification_token = create_jwt_token(user["user_id"], token_type="verification")
    
    background_tasks.add_task(send_verification_email, user_doc["email"], verification_code, verification_token)
    
    return {"success": True, "message": "Verification email sent"}

@api_router.post("/auth/forgot-password")
async def forgot_password(request: PasswordResetRequest, background_tasks: BackgroundTasks):
    """Request password reset"""
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    # Always return success to prevent email enumeration
    if user:
        reset_token = create_jwt_token(user["id"], token_type="reset")
        background_tasks.add_task(send_password_reset_email, request.email, reset_token)
    
    return {"success": True, "message": "If the email exists, a reset link has been sent"}

@api_router.post("/auth/reset-password")
async def reset_password(request: PasswordResetConfirm):
    """Reset password with token"""
    try:
        payload = decode_jwt_token(request.token, expected_type="reset")
    except HTTPException:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    # Check if token was used
    reset_record = await db.password_resets.find_one({
        "token": request.token,
        "used": False
    })
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    # Update password
    new_hash = hash_password(request.new_password)
    await db.users.update_one(
        {"id": payload["user_id"]},
        {"$set": {"password_hash": new_hash}}
    )
    
    # Mark token as used
    await db.password_resets.update_one(
        {"token": request.token},
        {"$set": {"used": True}}
    )
    
    return {"success": True, "message": "Password reset successfully"}

@api_router.post("/auth/login")
async def login(credentials: UserLogin, request: Request):
    # Check for abuse
    client_id = rate_limiter.get_client_id(request)
    
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        rate_limiter.record_suspicious_activity(client_id, 0.5)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if user.get("is_banned"):
        raise HTTPException(status_code=403, detail="Account banned")
    
    token = create_jwt_token(user["id"])
    return {"token": token, "user": UserProfile(**user)}

@api_router.post("/auth/anonymous")
async def create_anonymous_session():
    session_id = str(uuid.uuid4())
    token = create_jwt_token(session_id, is_anonymous=True)
    
    return AnonymousToken(
        token=token,
        session_id=session_id,
        created_at=datetime.now(timezone.utc).isoformat()
    )

@api_router.get("/auth/me")
async def get_me(user: Dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.get("is_anonymous"):
        return {"is_anonymous": True, "session_id": user["user_id"]}
    
    user_doc = await db.users.find_one({"id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserProfile(**user_doc)

# ==================== PROFILE ROUTES ====================

@api_router.put("/profile/interests")
async def update_interests(interests: List[str], user: Dict = Depends(get_current_user)):
    if not user or user.get("is_anonymous"):
        raise HTTPException(status_code=401, detail="Must be logged in")
    
    await db.users.update_one(
        {"id": user["user_id"]},
        {"$set": {"interests": interests[:10]}}
    )
    return {"success": True}

@api_router.put("/profile/gender")
async def update_gender(gender: str, user: Dict = Depends(get_current_user)):
    """Update user's gender"""
    if not user or user.get("is_anonymous"):
        raise HTTPException(status_code=401, detail="Must be logged in")
    
    valid_genders = ["male", "female", "other", "prefer_not_to_say"]
    if gender not in valid_genders:
        raise HTTPException(status_code=400, detail=f"Gender must be one of: {valid_genders}")
    
    await db.users.update_one(
        {"id": user["user_id"]},
        {"$set": {"gender": gender}}
    )
    return {"success": True, "gender": gender}

# ==================== PREMIUM TRIAL ====================

@api_router.post("/trial/activate")
async def activate_premium_trial(user: Dict = Depends(get_current_user)):
    """Activate one-time premium trial for HD video"""
    if not user or user.get("is_anonymous"):
        raise HTTPException(status_code=401, detail="Must be logged in to use trial")
    
    user_doc = await db.users.find_one({"id": user["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_doc.get("has_used_trial"):
        raise HTTPException(status_code=400, detail="Trial already used")
    
    if user_doc.get("is_premium"):
        raise HTTPException(status_code=400, detail="Already a premium user")
    
    # Mark trial as used and set temporary premium
    await db.users.update_one(
        {"id": user["user_id"]},
        {"$set": {
            "has_used_trial": True,
            "trial_activated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create trial session record
    await db.trial_sessions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "activated_at": datetime.now(timezone.utc).isoformat(),
        "status": "active"
    })
    
    return {
        "success": True,
        "message": "Premium trial activated! Enjoy one HD video chat.",
        "features": ["hd_video", "priority_matching"]
    }

@api_router.get("/trial/status")
async def get_trial_status(user: Dict = Depends(get_current_user)):
    """Check trial status"""
    if not user or user.get("is_anonymous"):
        return {"eligible": False, "reason": "Must be logged in"}
    
    user_doc = await db.users.find_one({"id": user["user_id"]}, {"_id": 0})
    if not user_doc:
        return {"eligible": False, "reason": "User not found"}
    
    if user_doc.get("is_premium"):
        return {"eligible": False, "reason": "Already premium"}
    
    if user_doc.get("has_used_trial"):
        return {"eligible": False, "reason": "Trial already used", "used_at": user_doc.get("trial_activated_at")}
    
    return {"eligible": True, "message": "You can activate a free premium trial!"}

# ==================== CHAT ROUTES ====================

@api_router.post("/chat/join-queue")
async def join_queue(
    interests: List[str] = [],
    prefer_video: bool = False,
    use_trial: bool = False,
    gender_preference: Optional[str] = None,  # Premium only - male, female, other
    user: Dict = Depends(get_current_user)
):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_id = user["user_id"]
    is_premium = False
    is_trial = False
    user_gender = None
    actual_gender_preference = None
    
    if not user.get("is_anonymous"):
        user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user_doc:
            is_premium = user_doc.get("is_premium", False)
            user_gender = user_doc.get("gender")
            
            # Gender filter is PREMIUM ONLY
            if gender_preference and is_premium:
                actual_gender_preference = gender_preference
            elif gender_preference and not is_premium:
                # Non-premium users can't use gender filter
                actual_gender_preference = None
            
            # Check for active trial
            if use_trial and not is_premium:
                trial = await db.trial_sessions.find_one({
                    "user_id": user_id,
                    "status": "active"
                })
                if trial:
                    is_trial = True
    
    await matchmaking_manager.add_to_queue(
        user_id, interests, prefer_video, is_premium, is_trial,
        gender=user_gender, gender_preference=actual_gender_preference
    )
    
    return {
        "status": "queued", 
        "user_id": user_id, 
        "is_premium": is_premium, 
        "is_trial": is_trial,
        "gender_filter_active": actual_gender_preference is not None
    }

@api_router.post("/chat/leave-queue")
async def leave_queue(user: Dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    await matchmaking_manager.remove_from_queue(user["user_id"])
    return {"status": "left"}

@api_router.get("/chat/queue-status")
async def queue_status(user: Dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    queue_count = len(matchmaking_manager.queue)
    in_queue = user["user_id"] in matchmaking_manager.queue
    
    return {"queue_count": queue_count, "in_queue": in_queue}

    return {"queue_count": queue_count, "in_queue": in_queue}

# ==================== SETTINGS HELPER ====================

async def get_system_settings() -> SystemSettings:
    """Get settings from DB, falling back to ENV"""
    settings_doc = await db.settings.find_one({"_id": "global_settings"})
    
    # Defaults from ENV if not in DB
    defaults = {
        "smtp_host": os.environ.get("SMTP_HOST", ""),
        "smtp_port": int(os.environ.get("SMTP_PORT", 587)),
        "smtp_user": os.environ.get("SMTP_USER", ""),
        "smtp_password": os.environ.get("SMTP_PASSWORD", ""),
        "stripe_public_key": os.environ.get("STRIPE_API_KEY", ""), # Using STRIPE_API_KEY as public for default if needed, or split logic
        "openai_api_key": os.environ.get("OPENAI_API_KEY", "")
    }
    
    if not settings_doc:
        # Create initial settings doc with defaults
        initial_settings = SystemSettings(**defaults)
        await db.settings.update_one(
            {"_id": "global_settings"},
            {"$set": initial_settings.model_dump()},
            upsert=True
        )
        return initial_settings
        
    return SystemSettings(**settings_doc)

# ==================== ADMIN ROUTES ====================

@api_router.get("/public/pages/{slug}")
async def get_public_page(slug: str):
    """Get public page content"""
    page = await db.pages.find_one({"slug": slug, "published": True}, {"_id": 0})
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return ContentPage(**page)

@api_router.get("/admin/pages")
async def get_admin_pages(admin: Dict = Depends(get_admin_user)):
    """List all pages"""
    cursor = db.pages.find({}, {"_id": 0}).sort("updated_at", -1)
    return [ContentPage(**doc) async for doc in cursor]

@api_router.post("/admin/pages")
async def save_admin_page(page: ContentPage, admin: Dict = Depends(get_admin_user)):
    """Create or update a page"""
    if not page.id:
        page.id = str(uuid.uuid4())
    
    page.updated_at = datetime.now(timezone.utc).isoformat()
    await db.pages.update_one(
        {"id": page.id},
        {"$set": page.model_dump()},
        upsert=True
    )
    return {"success": True, "page": page}

@api_router.delete("/admin/pages/{page_id}")
async def delete_admin_page(page_id: str, admin: Dict = Depends(get_admin_user)):
    """Delete a page"""
    result = await db.pages.delete_one({"id": page_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"success": True}

@api_router.get("/admin/settings")
async def get_admin_settings(admin: Dict = Depends(get_admin_user)):
    """Get system settings (secrets masked)"""
    settings = await get_system_settings()
    settings_dict = settings.model_dump()
    
    # Mask secrets
    if settings_dict["smtp_password"]:
        settings_dict["smtp_password"] = "********"
    if settings_dict["stripe_secret_key"]:
        settings_dict["stripe_secret_key"] = "********"
    if settings_dict["openai_api_key"]:
        settings_dict["openai_api_key"] = "********"
        
    return settings_dict

@api_router.put("/admin/settings")
async def update_admin_settings(update: SystemSettingsUpdate, admin: Dict = Depends(get_admin_user)):
    """Update system settings"""
    current = await get_system_settings()
    update_data = update.model_dump(exclude_unset=True)
    
    # Don't overwrite secrets if they are passed as masks or empty
    if "smtp_password" in update_data and (update_data["smtp_password"] == "********" or not update_data["smtp_password"]):
        del update_data["smtp_password"]
    if "stripe_secret_key" in update_data and (update_data["stripe_secret_key"] == "********" or not update_data["stripe_secret_key"]):
        del update_data["stripe_secret_key"]
    if "openai_api_key" in update_data and (update_data["openai_api_key"] == "********" or not update_data["openai_api_key"]):
        del update_data["openai_api_key"]
        
    await db.settings.update_one(
        {"_id": "global_settings"},
        {"$set": update_data},
        upsert=True
    )
    
    return {"success": True, "message": "Settings updated"}

@api_router.post("/chat/moderate")
async def moderate_message(message: ChatMessage, request: Request):
    # Track moderation requests for abuse detection
    client_id = rate_limiter.get_client_id(request)
    
    result = await moderate_content(message.content)
    
    # If content is blocked, record suspicious activity
    if result.action == "block":
        rate_limiter.record_suspicious_activity(client_id, 2.0)
    
    await db.moderation_logs.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": message.session_id,
        "sender_id": message.sender_id,
        "content_preview": message.content[:100],
        "result": result.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return result

@api_router.get("/chat/ice-servers")
async def get_ice_servers(user: Dict = Depends(get_current_user)):
    """Get TURN/STUN server configuration"""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    return {"ice_servers": ICE_SERVERS}

# ==================== REPORT ROUTES ====================

@api_router.post("/report")
async def create_report(report: ReportCreate, request: Request, user: Dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Record report activity
    client_id = rate_limiter.get_client_id(request)
    
    report_doc = {
        "id": str(uuid.uuid4()),
        "reporter_id": user["user_id"],
        "reported_user_id": report.reported_user_id,
        "session_id": report.session_id,
        "reason": report.reason,
        "description": report.description,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.reports.insert_one(report_doc)
    
    await db.users.update_one(
        {"id": report.reported_user_id},
        {"$inc": {"reports_received": 1}}
    )
    
    return {"success": True, "report_id": report_doc["id"]}

# ==================== PAYMENT ROUTES ====================

PREMIUM_PACKAGES = {
    "basic": {
        "price": 9.99, 
        "name": "Basic Premium", 
        "features": ["gender_filter", "priority_matching", "no_ads"],
        "description": "Filter by gender + priority queue"
    },
    "pro": {
        "price": 19.99, 
        "name": "Pro Premium", 
        "features": ["gender_filter", "priority_matching", "no_ads", "hd_video", "reconnect_history"],
        "description": "All Basic features + HD video + reconnect"
    },
    "vip": {
        "price": 49.99, 
        "name": "VIP Premium", 
        "features": ["gender_filter", "priority_matching", "no_ads", "hd_video", "reconnect_history", "verified_badge", "extended_sessions"],
        "description": "All Pro features + verified badge + longer sessions"
    }
}

@api_router.post("/payments/checkout")
async def create_checkout(
    request: Request,
    package_id: str,
    user: Dict = Depends(get_current_user)
):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if package_id not in PREMIUM_PACKAGES:
        raise HTTPException(status_code=400, detail="Invalid package")
    
    package = PREMIUM_PACKAGES[package_id]
    
    origin = request.headers.get("origin", request.headers.get("referer", ""))
    if not origin:
        origin = str(request.base_url).rstrip("/")
    
    success_url = f"{origin}/payment-success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/premium"
    
    webhook_url = f"{str(request.base_url).rstrip('/')}/api/webhook/stripe"
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    checkout_request = CheckoutSessionRequest(
        amount=float(package["price"]),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user["user_id"],
            "package_id": package_id,
            "is_anonymous": str(user.get("is_anonymous", False))
        }
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    transaction_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"] if not user.get("is_anonymous") else None,
        "session_id": session.session_id,
        "amount": float(package["price"]),
        "currency": "usd",
        "status": "pending",
        "payment_status": "initiated",
        "package_id": package_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.payment_transactions.insert_one(transaction_doc)
    
    return {"url": session.url, "session_id": session.session_id}

@api_router.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str, request: Request):
    webhook_url = f"{str(request.base_url).rstrip('/')}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    status = await stripe_checkout.get_checkout_status(session_id)
    
    transaction = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    
    if transaction and transaction.get("payment_status") != "paid":
        new_status = "completed" if status.payment_status == "paid" else status.status
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": new_status,
                "payment_status": status.payment_status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        if status.payment_status == "paid" and status.metadata:
            user_id = status.metadata.get("user_id")
            package_id = status.metadata.get("package_id")
            
            if user_id and not status.metadata.get("is_anonymous") == "True":
                await db.users.update_one(
                    {"id": user_id},
                    {"$set": {
                        "is_premium": True,
                        "premium_tier": package_id,
                        "premium_activated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
    
    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency
    }

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    
    webhook_url = f"{str(request.base_url).rstrip('/')}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    try:
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        if webhook_response.payment_status == "paid":
            await db.payment_transactions.update_one(
                {"session_id": webhook_response.session_id},
                {"$set": {
                    "status": "completed",
                    "payment_status": "paid",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        
        return {"received": True}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"received": True}

@api_router.get("/packages")
async def get_packages():
    return PREMIUM_PACKAGES

# ==================== ADMIN ROUTES ====================

@api_router.get("/admin/stats")
async def get_admin_stats(user: Dict = Depends(get_admin_user)):
    total_users = await db.users.count_documents({})
    premium_users = await db.users.count_documents({"is_premium": True})
    verified_users = await db.users.count_documents({"is_verified": True})
    total_sessions = await db.chat_sessions.count_documents({})
    active_queue = len(matchmaking_manager.queue)
    pending_reports = await db.reports.count_documents({"status": "pending"})
    total_revenue = 0
    
    paid_transactions = await db.payment_transactions.find({"payment_status": "paid"}, {"_id": 0}).to_list(1000)
    total_revenue = sum(t.get("amount", 0) for t in paid_transactions)
    
    recent_flags = await db.moderation_logs.count_documents({
        "result.is_safe": False
    })
    
    # Rate limit stats
    blocked_clients = len(rate_limiter.blocked_ips)
    
    return {
        "total_users": total_users,
        "premium_users": premium_users,
        "verified_users": verified_users,
        "total_sessions": total_sessions,
        "active_queue": active_queue,
        "pending_reports": pending_reports,
        "total_revenue": total_revenue,
        "flagged_content": recent_flags,
        "online_now": len(websocket_connections),
        "blocked_clients": blocked_clients
    }

@api_router.get("/admin/reports")
async def get_reports(status: str = "pending", limit: int = 50, user: Dict = Depends(get_admin_user)):
    reports = await db.reports.find({"status": status}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return reports

@api_router.post("/admin/reports/{report_id}/resolve")
async def resolve_report(report_id: str, action: str, notes: str = "", user: Dict = Depends(get_admin_user)):
    report = await db.reports.find_one({"id": report_id}, {"_id": 0})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    await db.reports.update_one(
        {"id": report_id},
        {"$set": {
            "status": "resolved",
            "resolution_action": action,
            "resolution_notes": notes,
            "resolved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if action == "ban":
        await db.users.update_one(
            {"id": report["reported_user_id"]},
            {"$set": {"is_banned": True}}
        )
    
    return {"success": True}

@api_router.get("/admin/moderation-logs")
async def get_moderation_logs(limit: int = 100, user: Dict = Depends(get_admin_user)):
    logs = await db.moderation_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return logs

@api_router.get("/admin/abuse-stats")
async def get_abuse_stats(user: Dict = Depends(get_admin_user)):
    """Get abuse detection statistics"""
    return {
        "blocked_ips": len(rate_limiter.blocked_ips),
        "tracked_clients": len(rate_limiter.abuse_scores),
        "high_risk_clients": sum(1 for score in rate_limiter.abuse_scores.values() if score >= 5)
    }

# ==================== WEBSOCKET SIGNALING ====================

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await websocket.accept()
    websocket_connections[user_id] = websocket
    logger.info(f"WebSocket connected: {user_id}")
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "find_match":
                interests = message.get("interests", [])
                prefer_video = message.get("prefer_video", False)
                use_trial = message.get("use_trial", False)
                
                await matchmaking_manager.add_to_queue(user_id, interests, prefer_video, False, use_trial)
                
                match_id = await matchmaking_manager.find_match(user_id)
                
                if match_id:
                    session_id = str(uuid.uuid4())
                    session_doc = {
                        "id": session_id,
                        "user1_id": user_id,
                        "user2_id": match_id,
                        "status": "active",
                        "chat_type": "video" if prefer_video else "text",
                        "started_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.chat_sessions.insert_one(session_doc)
                    
                    await matchmaking_manager.remove_from_queue(user_id)
                    await matchmaking_manager.remove_from_queue(match_id)
                    
                    active_sessions[session_id] = {"user1": user_id, "user2": match_id}
                    
                    # Send ICE servers config with match notification
                    match_message = json.dumps({
                        "type": "matched",
                        "session_id": session_id,
                        "partner_id": match_id,
                        "chat_type": session_doc["chat_type"],
                        "ice_servers": ICE_SERVERS
                    })
                    await websocket.send_text(match_message)
                    
                    if match_id in websocket_connections:
                        partner_message = json.dumps({
                            "type": "matched",
                            "session_id": session_id,
                            "partner_id": user_id,
                            "chat_type": session_doc["chat_type"],
                            "ice_servers": ICE_SERVERS
                        })
                        await websocket_connections[match_id].send_text(partner_message)
                else:
                    await websocket.send_text(json.dumps({"type": "waiting", "queue_size": len(matchmaking_manager.queue)}))
            
            elif message["type"] in ["offer", "answer", "ice-candidate"]:
                partner_id = message.get("partner_id")
                if partner_id and partner_id in websocket_connections:
                    forward_message = json.dumps({
                        "type": message["type"],
                        "data": message.get("data"),
                        "from": user_id
                    })
                    await websocket_connections[partner_id].send_text(forward_message)
            
            elif message["type"] == "chat_message":
                session_id = message.get("session_id")
                content = message.get("content", "")
                partner_id = message.get("partner_id")
                
                moderation = await moderate_content(content)
                
                if moderation.action == "block":
                    await websocket.send_text(json.dumps({
                        "type": "message_blocked",
                        "reason": "Content violates guidelines"
                    }))
                else:
                    msg_doc = {
                        "id": str(uuid.uuid4()),
                        "session_id": session_id,
                        "sender_id": user_id,
                        "content": content,
                        "is_flagged": not moderation.is_safe,
                        "moderation_score": moderation.confidence,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.chat_messages.insert_one(msg_doc)
                    
                    if partner_id and partner_id in websocket_connections:
                        await websocket_connections[partner_id].send_text(json.dumps({
                            "type": "chat_message",
                            "content": content,
                            "from": user_id,
                            "is_warned": moderation.action == "warn"
                        }))
            
            elif message["type"] in ["skip", "disconnect"]:
                session_id = message.get("session_id")
                partner_id = message.get("partner_id")
                
                if session_id:
                    await db.chat_sessions.update_one(
                        {"id": session_id},
                        {"$set": {
                            "status": "ended",
                            "ended_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                    
                    if session_id in active_sessions:
                        del active_sessions[session_id]
                
                if partner_id and partner_id in websocket_connections:
                    await websocket_connections[partner_id].send_text(json.dumps({
                        "type": "partner_disconnected"
                    }))
                
                if message["type"] == "skip":
                    await websocket.send_text(json.dumps({"type": "ready_to_match"}))
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {user_id}")
    except Exception as e:
        logger.error(f"WebSocket error for {user_id}: {e}")
    finally:
        if user_id in websocket_connections:
            del websocket_connections[user_id]
        await matchmaking_manager.remove_from_queue(user_id)

# ==================== BASIC ROUTES ====================

@app.on_event("startup")
async def startup_db_client():
    # Create default admin user if not exists
    admin_email = "admin@talknow.com"
    existing_admin = await db.users.find_one({"username": "admin"})
    
    if not existing_admin:
        admin_id = str(uuid.uuid4())
        admin_doc = {
            "id": admin_id,
            "email": admin_email,
            "username": "admin",
            "password_hash": hash_password("admin1234"),
            "gender": "other",
            "is_premium": True,
            "is_admin": True,
            "premium_tier": "vip",
            "interests": [],
            "total_chats": 0,
            "reports_received": 0,
            "is_banned": False,
            "is_verified": True,
            "has_used_trial": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_doc)
        logger.info("Admin user created: admin / admin1234")
    else:
        # Ensure existing admin has is_admin=True
        await db.users.update_one(
            {"username": "admin"},
            {"$set": {"is_admin": True}}
        )

@api_router.get("/")
async def root():
    return {"message": "TalkNow API v1.0", "status": "running"}

@api_router.get("/health")
async def health():
    try:
        # Check DB connection
        await client.admin.command('ping')
        db_status = "connected"
    except Exception as e:
        db_status = f"disconnected: {str(e)}"
        
    return {
        "status": "healthy" if db_status == "connected" else "unhealthy", 
        "database": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# Include the router
app.include_router(api_router)

# Add rate limiting middleware
app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

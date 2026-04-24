"""
Authentication endpoints — Register, Login, Logout, Token Refresh.
Uses Supabase Auth for user management + JWT for API access.
"""
from fastapi import APIRouter, HTTPException, Depends, status, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timedelta
import jwt

from app.core.config import settings
from app.core.database import get_supabase
from app.schemas.schemas import UserCreate, UserLogin, UserResponse, TokenResponse, UserRole, SocialLoginRequest

router = APIRouter()
security = HTTPBearer()


def create_access_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        print(f"DEBUG: get_current_user called for sub: {payload.get('sub')}")
        user_id = payload.get("sub")
        
        # Ensure user exists in public.users (Self-healing for DB resets)
        supabase = get_supabase()
        user_res = supabase.table("users").select("id").eq("id", user_id).execute()
        if not user_res.data:
            print(f"DEBUG: Syncing missing user {user_id} to public.users")
            role = payload.get("role", "candidate")
            # We don't have email in the JWT payload by default in this implementation, 
            # but we can try to get it if needed or just use dummy/placeholder if not critical for FK.
            # In this app, email is in users table.
            supabase.table("users").upsert({
                "id": user_id,
                "email": f"user_{user_id[:8]}@restored.com", # Fallback email
                "role": role
            }).execute()
            supabase.table("profiles").upsert({
                "id": user_id,
                "full_name": "Restored User"
            }).execute()

        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        print(f"DEBUG: Auth sync warning: {e}")
        return payload # Continue even if sync fails (risky but avoids blocking if JWT is valid)


async def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False))):
    if not credentials:
        return None
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return payload
    except:
        return None


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate):
    """Register a new candidate or recruiter with profile separation."""
    import asyncio
    supabase = get_supabase()

    # 1. Create Supabase Auth user (must finish before inserts)
    try:
        auth_response = await asyncio.to_thread(
            supabase.auth.sign_up,
            {
                "email": data.email,
                "password": data.password,
                "options": {"data": {"full_name": data.full_name, "role": data.role.value}},
            },
        )
        user_id = auth_response.user.id
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Registration failed: {str(e)}")

    profile_data = {
        "id": user_id,
        "full_name": data.full_name,
        "phone": data.phone,
        "skills": [],
    }
    if data.role == UserRole.RECRUITER:
        profile_data["company_name"] = data.company_name

    # 2. Insert users + profiles in parallel (non-fatal if either fails)
    async def _insert_user():
        try:
            await asyncio.to_thread(
                lambda: supabase.table("users").insert({
                    "id": user_id,
                    "email": data.email,
                    "role": data.role.value,
                }).execute()
            )
        except Exception as e:
            print(f"users insert warning: {e}")

    async def _insert_profile():
        try:
            await asyncio.to_thread(
                lambda: supabase.table("profiles").insert(profile_data).execute()
            )
        except Exception as e:
            print(f"profiles insert warning: {e}")

    await asyncio.gather(_insert_user(), _insert_profile())

    token = create_access_token(user_id, data.role.value)

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            email=data.email,
            role=data.role,
            profile=profile_data,
            created_at=datetime.utcnow(),
        ),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin):
    """Login with email & password, fetching complete profile."""
    print(f"DEBUG: Login attempt for {data.email}")
    supabase = get_supabase()

    import asyncio
    try:
        auth_response = await asyncio.to_thread(
            supabase.auth.sign_in_with_password,
            {"email": data.email, "password": data.password},
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    user = auth_response.user

    # Fetch users + profiles in parallel
    try:
        user_res, profile_res = await asyncio.gather(
            asyncio.to_thread(lambda: supabase.table("users").select("*").eq("id", user.id).single().execute()),
            asyncio.to_thread(lambda: supabase.table("profiles").select("*").eq("id", user.id).single().execute()),
        )
        user_data = user_res.data
        profile_data = profile_res.data
    except Exception as e:
        # Self-healing: restore missing rows from Auth metadata
        meta = getattr(user, 'user_metadata', {}) or getattr(user, 'raw_user_meta_data', {}) or {}
        role = meta.get("role", "candidate")
        name = meta.get("full_name", "User")
        try:
            await asyncio.gather(
                asyncio.to_thread(lambda: supabase.table("users").upsert({"id": user.id, "email": user.email, "role": role}).execute()),
                asyncio.to_thread(lambda: supabase.table("profiles").upsert({"id": user.id, "full_name": name}).execute()),
            )
        except Exception:
            pass
        user_data = {"email": user.email, "role": role, "created_at": datetime.utcnow()}
        profile_data = {"id": user.id, "full_name": name, "skills": []}

    token = create_access_token(user.id, user_data.get("role", "candidate"))

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            email=user_data.get("email", user.email),
            role=user_data.get("role", "candidate"),
            profile=profile_data,
            created_at=user_data.get("created_at", datetime.utcnow()),
        ),
    )


@router.post("/social-login", response_model=TokenResponse)
async def social_login(data: SocialLoginRequest):
    """
    Exchange a Supabase OAuth access token for a custom HireAI JWT.
    Enables Google, LinkedIn, etc.
    """
    supabase = get_supabase()
    
    try:
        # Verify token and get user from Supabase
        user_response = supabase.auth.get_user(data.access_token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid social session")
            
        user = user_response.user
    except Exception as e:
        print(f"DEBUG: Social login verification failed: {e}")
        raise HTTPException(status_code=401, detail=f"Social authentication failed: {str(e)}")

    user_id = user.id
    email = user.email
    
    # Sync to public schema (users & profiles)
    try:
        user_res = supabase.table("users").select("*").eq("id", user_id).single().execute()
        if not user_res.data:
            print(f"DEBUG: Creating new social user record for {email}")
            meta = user.user_metadata if hasattr(user, 'user_metadata') else {}
            if not meta:
                meta = getattr(user, 'raw_user_meta_data', {})
                
            full_name = meta.get("full_name") or meta.get("name") or "Social User"
            
            supabase.table("users").upsert({"id": user_id, "email": email, "role": data.role.value}).execute()
            supabase.table("profiles").upsert({"id": user_id, "full_name": full_name}).execute()
            
            user_data = {"email": email, "role": data.role.value, "created_at": datetime.utcnow()}
            profile_data = {"id": user_id, "full_name": full_name, "skills": []}
        else:
            user_data = user_res.data
            profile_res = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
            profile_data = profile_res.data
    except Exception as e:
        print(f"DEBUG: Social sync error: {e}")
        user_data = {"email": email, "role": data.role.value, "created_at": datetime.utcnow()}
        profile_data = {"id": user_id, "full_name": "User", "skills": []}

    token = create_access_token(user_id, user_data.get("role", data.role.value))
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            email=email,
            role=user_data.get("role", data.role.value),
            profile=profile_data,
            created_at=user_data.get("created_at", datetime.utcnow()),
        ),
    )


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Logout current user."""
    return {"message": "Logged out successfully"}


@router.post("/forgot-password")
async def forgot_password(email: str):
    """
    Send a password reset email via Supabase Auth.
    Always returns 200 to prevent email enumeration.
    """
    try:
        supabase = get_supabase()
        supabase.auth.reset_password_email(email)
        print(f"DEBUG: Password reset email sent to {email}")
    except Exception as e:
        # Silently log — don't reveal if email exists or not
        print(f"DEBUG: Password reset attempt for {email}: {e}")
    return {"message": "If an account exists with that email, a password reset link has been sent."}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(current_user: dict = Depends(get_current_user)):
    """
    Issue a fresh JWT for an authenticated user.
    Call this before the current token expires to extend the session silently.
    """
    supabase = get_supabase()
    user_id = current_user["sub"]
    role = current_user.get("role", "candidate")

    try:
        user_res = supabase.table("users").select("*").eq("id", user_id).single().execute()
        profile_res = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
        user_data = user_res.data
        profile_data = profile_res.data
    except Exception:
        user_data = {"email": "", "role": role, "created_at": datetime.utcnow()}
        profile_data = {"id": user_id, "full_name": "User", "skills": []}

    new_token = create_access_token(user_id, role)
    return TokenResponse(
        access_token=new_token,
        user=UserResponse(
            id=user_id,
            email=user_data.get("email", ""),
            role=user_data.get("role", role),
            profile=profile_data,
            created_at=user_data.get("created_at", datetime.utcnow()),
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Restore session - return full user and profile data from database."""
    user_id = current_user["sub"]
    supabase = get_supabase()
    
    try:
        user_res = supabase.table("users").select("*").eq("id", user_id).single().execute()
        profile_res = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
        user_data = user_res.data
        profile_data = profile_res.data
        
        if not user_data:
            # Self-healing for session restoration
            role = current_user.get("role", "candidate")
            email = current_user.get("email", f"user_{user_id[:8]}@restored.com")
            supabase.table("users").upsert({"id": user_id, "email": email, "role": role}).execute()
            supabase.table("profiles").upsert({"id": user_id, "full_name": "Restored User"}).execute()
            user_data = {"email": email, "role": role, "created_at": datetime.utcnow()}
            profile_data = {"id": user_id, "full_name": "Restored User", "skills": []}
    except Exception as e:
        print(f"DEBUG: get_me sync warning: {e}")
        role = current_user.get("role", "candidate")
        user_data = {"email": "", "role": role, "created_at": datetime.utcnow()}
        profile_data = {"id": user_id, "full_name": "User", "skills": []}

    return UserResponse(
        id=user_id,
        email=user_data.get("email", ""),
        role=user_data.get("role", "candidate"),
        profile=profile_data,
        created_at=user_data.get("created_at", datetime.utcnow())
    )

from pydantic import BaseModel
class InviteRequest(BaseModel):
    name: str
    email: str

@router.get("/team")
async def get_team_members(current_user: dict = Depends(get_current_user)):
    """Fetch all recruiters (simplified team fetching)."""
    supabase = get_supabase()
    try:
        users_res = supabase.table("users").select("id, email").eq("role", "recruiter").execute()
        recruiter_users = users_res.data
        user_ids = [u["id"] for u in recruiter_users]
        
        if not user_ids:
            return []
            
        profiles_res = supabase.table("profiles").select("id, full_name, avatar_url, headline").in_("id", user_ids).execute()
        profiles_map = {p["id"]: p for p in profiles_res.data}
        
        team = []
        for u in recruiter_users:
            prof = profiles_map.get(u["id"], {})
            name = prof.get("full_name") or "User"
            team.append({
                "id": u["id"],
                "email": u["email"],
                "name": name,
                "role": prof.get("headline") or "Recruiter",
                "avatar_url": prof.get("avatar_url") or "",
                "initials": name.split(" ")[0][0] + (name.split(" ")[1][0] if len(name.split(" ")) > 1 else ""),
                "online": True
            })
            
        return team
    except Exception as e:
        print(f"DEBUG: Error fetching team: {e}")
        return []

@router.post("/invite")
async def invite_team_member(data: InviteRequest, current_user: dict = Depends(get_current_user)):
    """Mock sending invite, create an account proxy."""
    if current_user.get("role") not in ["recruiter", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    supabase = get_supabase()
    
    existing = supabase.table("users").select("id").eq("email", data.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="User already exists")
        
    import uuid
    new_id = str(uuid.uuid4())
    
    try:
        supabase.table("users").insert({
            "id": new_id,
            "email": data.email,
            "role": "recruiter"
        }).execute()
        
        supabase.table("profiles").insert({
            "id": new_id,
            "full_name": data.name,
            "headline": "Recruiter"
        }).execute()
    except Exception as e:
        print(f"DEBUG: Error inviting {data.email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to invite member")
        
    return {"message": "Invite sent successfully"}

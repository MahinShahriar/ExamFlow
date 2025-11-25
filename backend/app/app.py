from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Depends

from .routers import question_bank, auth, exam_routers, student_routers, result_routers
from contextlib import asynccontextmanager
from .db import create_db_and_tables
from .security import auth_backend, app_users
from .dependencies import users_router_permission
from .schemas.user_schema import UserCreate, UserRead, UserUpdate


from fastapi.staticfiles import StaticFiles
import os


@asynccontextmanager
async def lifespan(app: FastAPI):
    # run once when app starts. Make DB and media folder.
    await create_db_and_tables()
    media_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'media')
    media_dir = os.path.abspath(media_dir)
    os.makedirs(media_dir, exist_ok=True)
    yield

app = FastAPI(lifespan=lifespan)


# NOTE: include the exact origins used by the frontend dev server (no trailing slash)
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # which sites can call this API
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# mount media static files at /media (frontend may request /media/...)
media_path = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'media'))
os.makedirs(media_path, exist_ok=True)
app.mount("/media", StaticFiles(directory=media_path), name="media")

# Attach users router with small permission check. This router provides /users and /users/me
app.include_router(
    app_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(users_router_permission)],
)


app.include_router(question_bank.router, prefix="/api")
app.include_router(exam_routers.router, prefix="/api")
app.include_router(student_routers.router, prefix="/api", tags=["Student"])
app.include_router(result_routers.router, prefix="/api")

# Auth routers
app.include_router(app_users.get_auth_router(auth_backend), prefix="/auth/jwt", tags=["auth"])
app.include_router(auth.router)
app.include_router(app_users.get_register_router(UserRead, UserCreate), prefix="/auth", tags=["auth"])
app.include_router(app_users.get_verify_router(UserRead), prefix="/auth", tags=["auth"])

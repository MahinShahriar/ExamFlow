#  custom login route for the app
from fastapi import APIRouter
from ..security import get_jwt_strategy
from fastapi import Depends, HTTPException, status
from ..db import get_user_db
from ..schemas.user_schema import LoginRequest, UserRead
from fastapi_users.password import PasswordHelper

import asyncio

router = APIRouter(prefix='/auth', tags=['auth'])


@router.post("/login")
async def login(payload: LoginRequest, user_db = Depends(get_user_db)):

    user = await user_db.get_by_email(payload.email)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid credentials")

    pwd_helper = PasswordHelper()
    valid, new_hash = pwd_helper.verify_and_update(payload.password, user.hashed_password)

    if not valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid credentials")

    if new_hash:
        user.hashed_password = new_hash
        await user_db.update(user)

    #  JWT token
    strategy = get_jwt_strategy()
    maybe_token = strategy.write_token(user)

    if asyncio.iscoroutine(maybe_token):
        access_token = await maybe_token
    else:
        access_token = maybe_token

    # ORM user to schema for JSON
    user_out = UserRead.from_orm(user)

    # user and token
    return {"user": user_out, "token": access_token}

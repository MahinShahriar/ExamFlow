from fastapi import Depends, HTTPException, status, Request
from app.models.user_model import User, UserRole
from .security import current_active_user


def current_user_has_role(required_role: UserRole):
    async def current_user_contains_role(user: User = Depends(current_active_user)):
        if user.role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted",
            )
        return user
    return current_user_contains_role


current_admin = current_user_has_role(UserRole.ADMIN)
current_student = current_user_has_role(UserRole.STUDENT)


async def users_router_permission(request: Request, user: User = Depends(current_active_user)):
    method = request.method.upper()
    # Admin-only methods
    if method in ("POST", "PUT", "PATCH", "DELETE"):
        if user.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operation not permitted")
        return True

    # # GET requests: either admin or own-resource
    # if method == "GET":
    #     # Normalize path and split
    #     path = request.url.path
    #     # remove prefix and trailing slash
    #     parts = [p for p in path.split("/") if p != ""]
    #     # parts like ['users'] or ['users','<id>']
    #     if len(parts) == 1:
    #         # GET /users -> list; allow only admin
    #         if user.role != UserRole.ADMIN:
    #             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operation not permitted")
    #         return True
    #     elif len(parts) >= 2 and parts[0] == 'users':
    #         target = parts[1]
    #         if target == 'me':
    #             return True
    #         # if target is a UUID string matching current user id
    #         if str(user.id) == target:
    #             return True
    #         # admin allowed
    #         if user.role == UserRole.ADMIN:
    #             return True
    #         raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operation not permitted")

    # return True

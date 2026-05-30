from fastapi import HTTPException, Request, status

USERNAME = "user"
PASSWORD = "password"


def check_credentials(username: str, password: str) -> bool:
    return username == USERNAME and password == PASSWORD


def current_user(request: Request) -> str:
    username = request.session.get("username")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return username

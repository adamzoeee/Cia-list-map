"""Pydantic 请求/响应模型。"""
from pydantic import BaseModel, Field
from typing import Optional


class CreateTeamRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    creator_user_id: str
    creator_nickname: str = Field(..., min_length=1, max_length=30)


class JoinTeamRequest(BaseModel):
    invite_code: str = Field(..., min_length=6, max_length=6)
    user_id: str = Field(..., min_length=1)
    nickname: str = Field(..., min_length=1, max_length=30)


class LeaveTeamRequest(BaseModel):
    user_id: str = Field(..., min_length=1)


class DeleteTeamRequest(BaseModel):
    user_id: str = Field(..., min_length=1)


class CreateTaskRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    urgency: float = Field(default=0, ge=-5, le=5)
    importance: float = Field(default=0, ge=-5, le=5)
    quadrant: int = Field(default=1, ge=1, le=4)
    created_by: str


class UpdateTaskRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    version: int
    title: Optional[str] = None
    description: Optional[str] = None
    urgency: Optional[float] = Field(default=None, ge=-5, le=5)
    importance: Optional[float] = Field(default=None, ge=-5, le=5)
    quadrant: Optional[int] = Field(default=None, ge=1, le=4)
    completed: Optional[bool] = None
    assigned_to: Optional[str] = None


class DeleteTaskRequest(BaseModel):
    user_id: str = Field(..., min_length=1)

"""Pydantic models for Cases & Ownership."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class CaseBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    status: str = Field(default="open", pattern="^(open|in_progress|resolved|closed)$")
    priority: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    owner: Optional[str] = None


class CaseCreate(CaseBase):
    pass


class CaseUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(open|in_progress|resolved|closed)$")
    priority: Optional[str] = Field(None, pattern="^(low|medium|high|critical)$")
    owner: Optional[str] = None


class Case(CaseBase):
    id: int
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CaseNoteBase(BaseModel):
    body: str = Field(..., min_length=1)


class CaseNoteCreate(CaseNoteBase):
    pass


class CaseNote(CaseNoteBase):
    id: int
    case_id: int
    author: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AssignAlertsRequest(BaseModel):
    alert_ids: List[int] = Field(..., min_items=1)

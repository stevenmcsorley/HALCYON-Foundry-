"""Pydantic models for Cases & Ownership."""
from pydantic import BaseModel, Field, ConfigDict
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
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    
    id: int
    created_by: Optional[str] = Field(None, alias="createdBy", serialization_alias="createdBy")
    created_at: datetime = Field(..., alias="createdAt", serialization_alias="createdAt")
    updated_at: datetime = Field(..., alias="updatedAt", serialization_alias="updatedAt")
    resolved_at: Optional[datetime] = Field(None, alias="resolvedAt", serialization_alias="resolvedAt")
    priority_suggestion: Optional[str] = Field(None, alias="prioritySuggestion", serialization_alias="prioritySuggestion")
    owner_suggestion: Optional[str] = Field(None, alias="ownerSuggestion", serialization_alias="ownerSuggestion")
    similar_case_ids: Optional[List[int]] = Field(None, alias="similarCaseIds", serialization_alias="similarCaseIds")
    ml_version: Optional[str] = Field(None, alias="mlVersion", serialization_alias="mlVersion")


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

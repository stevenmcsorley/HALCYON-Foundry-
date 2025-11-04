from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
from datetime import datetime
from uuid import UUID


class SavedQuery(BaseModel):
    id: UUID
    name: str
    owner: str
    gql: str
    created_at: datetime
    updated_at: datetime


class SavedQueryCreate(BaseModel):
    name: str
    gql: str


class SavedQueryUpdate(BaseModel):
    name: Optional[str] = None
    gql: Optional[str] = None


class Dashboard(BaseModel):
    id: UUID
    name: str
    owner: str
    created_at: datetime
    updated_at: datetime


class DashboardCreate(BaseModel):
    name: str


class DashboardUpdate(BaseModel):
    name: Optional[str] = None


class DashboardPanel(BaseModel):
    id: UUID
    dashboard_id: UUID
    title: str
    type: str  # map, graph, list, timeline, metric
    config_json: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    position: int = 0


class DashboardPanelCreate(BaseModel):
    dashboard_id: UUID
    title: str
    type: str
    config_json: Dict[str, Any] = Field(default_factory=dict)
    position: int = 0


class DashboardPanelUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    config_json: Optional[Dict[str, Any]] = None
    position: Optional[int] = None


class DashboardWithPanels(BaseModel):
    id: UUID
    name: str
    owner: str
    created_at: datetime
    updated_at: datetime
    panels: List[DashboardPanel] = Field(default_factory=list)

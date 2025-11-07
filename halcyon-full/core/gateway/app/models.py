from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List, Literal
from datetime import datetime
from uuid import UUID


class SavedQuery(BaseModel):
    id: UUID
    name: str
    owner: str
    gql: str
    shape_hint: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SavedQueryCreate(BaseModel):
    name: str
    gql: str
    shape_hint: Optional[str] = None


class SavedQueryUpdate(BaseModel):
    name: Optional[str] = None
    gql: Optional[str] = None
    shape_hint: Optional[str] = None


class Dashboard(BaseModel):
    id: UUID
    name: str
    owner: str
    created_at: datetime
    updated_at: datetime
    config: Dict[str, Any] = Field(default_factory=dict)
    is_default: bool = False


class DashboardCreate(BaseModel):
    name: str
    config: Optional[Dict[str, Any]] = None
    is_default: bool = False


class DashboardUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_default: Optional[bool] = None


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
    config: Dict[str, Any] = Field(default_factory=dict)
    is_default: bool = False
    panels: List[DashboardPanel] = Field(default_factory=list)


# Alert types and models
Severity = Literal["low", "medium", "high"]
Status = Literal["open", "ack", "resolved"]  # Note: using "open" instead of "new" per Phase 6A+


class ActionConfig(BaseModel):
    type: str
    config: Dict[str, Any]


class AlertRuleIn(BaseModel):
    name: str
    description: Optional[str] = None
    condition_json: Dict[str, Any]
    severity: Severity = "medium"
    actions_json: Optional[List[ActionConfig]] = None
    enabled: bool = True
    # Phase 6A+ fields
    fingerprint_template: Optional[str] = None
    correlation_keys: Optional[List[str]] = None
    mute_seconds: int = 0
    route: Optional[Dict[str, Any]] = None


class AlertRule(AlertRuleIn):
    id: int
    created_at: str
    created_by: Optional[str] = None
    route: Optional[Dict[str, Any]] = None  # Phase 6B: route JSONB field


class Alert(BaseModel):
    id: int
    rule_id: int
    entity_id: Optional[str] = None
    message: str
    severity: Severity
    status: Status
    created_at: str
    acknowledged_at: Optional[str] = None
    resolved_at: Optional[str] = None
    acknowledged_by: Optional[str] = None
    resolved_by: Optional[str] = None

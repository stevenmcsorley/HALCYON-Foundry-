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


DatasourceStatus = Literal["draft", "active", "disabled", "error"]
DatasourceVersionState = Literal["draft", "published", "archived"]
WorkerStatus = Literal["starting", "running", "stopped", "error"]


class Datasource(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    type: str
    owner_id: Optional[str] = None
    org_id: Optional[UUID] = None
    project_id: Optional[UUID] = None
    tags: List[str] = Field(default_factory=list)
    status: DatasourceStatus = "draft"
    created_at: datetime
    created_by: Optional[str] = None
    updated_at: datetime
    updated_by: Optional[str] = None
    archived_at: Optional[datetime] = None
    current_version: Optional[int] = None


class DatasourceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    type: str
    owner_id: Optional[str] = None
    org_id: Optional[UUID] = None
    project_id: Optional[UUID] = None
    tags: List[str] = Field(default_factory=list)


class DatasourceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    owner_id: Optional[str] = None
    org_id: Optional[UUID] = None
    project_id: Optional[UUID] = None
    tags: Optional[List[str]] = None
    status: Optional[DatasourceStatus] = None


class DatasourceVersion(BaseModel):
    id: UUID
    datasource_id: UUID
    version: int
    state: DatasourceVersionState
    config_json: Dict[str, Any]
    summary: Optional[str] = None
    created_at: datetime
    created_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None


class DatasourceVersionCreate(BaseModel):
    config_json: Dict[str, Any]
    summary: Optional[str] = None


class DatasourceState(BaseModel):
    datasource_id: UUID
    current_version: Optional[int] = None
    worker_status: WorkerStatus = "stopped"
    last_heartbeat_at: Optional[datetime] = None
    last_event_at: Optional[datetime] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    metrics_snapshot: Dict[str, Any] = Field(default_factory=dict)
    updated_at: datetime


class DatasourceSecret(BaseModel):
    id: UUID
    datasource_id: UUID
    key: str
    encrypted_value: bytes
    version: int
    created_at: datetime
    created_by: Optional[str] = None
    rotated_at: Optional[datetime] = None
    rotated_by: Optional[str] = None


class DatasourceEvent(BaseModel):
    id: int
    datasource_id: UUID
    version: Optional[int] = None
    event_type: str
    actor: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


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

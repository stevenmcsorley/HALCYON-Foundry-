from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Literal


class AttributeDef(BaseModel):
    name: str
    type: Literal["string", "number", "integer", "boolean", "datetime", "geo", "json"]
    required: bool = False
    description: Optional[str] = None


class EntityType(BaseModel):
    name: str
    attributes: List[AttributeDef] = Field(default_factory=list)
    description: Optional[str] = None
    version: str = "v1"


class RelationshipType(BaseModel):
    name: str
    from_entity: str
    to_entity: str
    directed: bool = True
    attributes: List[AttributeDef] = Field(default_factory=list)
    description: Optional[str] = None
    version: str = "v1"


class OntologyPatch(BaseModel):
    add_entities: List[EntityType] = Field(default_factory=list)
    add_relationships: List[RelationshipType] = Field(default_factory=list)
    remove_entities: List[str] = Field(default_factory=list)
    remove_relationships: List[str] = Field(default_factory=list)


class EntityInstance(BaseModel):
    type: str
    id: str
    attrs: Dict[str, object]


class RelationshipInstance(BaseModel):
    type: str
    from_id: str
    to_id: str
    attrs: Dict[str, object] = Field(default_factory=dict)

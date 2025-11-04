from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    app_host: str = "0.0.0.0"
    app_port: int = 8088
    ontology_base_url: str
    policy_base_url: str
    service_name: str = "halcyon-gateway"
    default_roles: List[str] = ["analyst"]

    class Config:
        env_prefix = ""
        case_sensitive = False

settings = Settings()

from pydantic_settings import BaseSettings
from typing import List
import os

class Settings(BaseSettings):
    app_host: str = "0.0.0.0"
    app_port: int = 8088
    ontology_base_url: str
    policy_base_url: str
    registry_base_url: str = "http://registry:8090"
    pg_dsn: str = os.getenv("PG_DSN", "postgresql://postgres:dev@postgres:5432/halcyon")
    service_name: str = "halcyon-gateway"
    default_roles: List[str] = ["analyst"]
    keycloak_url: str = "http://localhost:8089"
    keycloak_realm: str = "halcyon-dev"
    keycloak_client_id: str = "halcyon-gateway"
    oidc_discovery_url: str = ""
    jwt_algorithm: str = "RS256"
    dev_mode: bool = True
    alerts_pubsub_channel: str = os.getenv("ALERTS_PUBSUB_CHANNEL", "halcyon.alerts")
    actions_enable: bool = os.getenv("ACTIONS_ENABLE", "true").lower() == "true"
    slack_webhook_url: str = os.getenv("SLACK_WEBHOOK_URL", "")
    email_smtp_url: str = os.getenv("EMAIL_SMTP_URL", "")

    class Config:
        env_prefix = ""
        case_sensitive = False

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Auto-generate discovery URL if not provided
        if not self.oidc_discovery_url:
            self.oidc_discovery_url = f"{self.keycloak_url}/realms/{self.keycloak_realm}/.well-known/openid-configuration"

settings = Settings()

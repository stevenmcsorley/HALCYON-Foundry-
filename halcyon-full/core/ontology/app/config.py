from pydantic_settings import BaseSettings
from pydantic import AnyUrl


class Settings(BaseSettings):
    app_host: str = "0.0.0.0"
    app_port: int = 8081
    pg_dsn: AnyUrl
    neo4j_uri: AnyUrl
    neo4j_user: str
    neo4j_pass: str
    service_name: str = "halcyon-ontology"

    class Config:
        env_prefix = ""
        case_sensitive = False


settings = Settings()

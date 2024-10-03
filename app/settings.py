from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        arbitrary_types_allowed=True,
        case_sensitive=False,
        extra="ignore",
    )

    server_host: Optional[str] = None
    anova_server_port: Optional[int] = None

    frontend_dist_dir: Optional[str] = None

    admin_username: Optional[str] = None
    admin_password: Optional[str] = None

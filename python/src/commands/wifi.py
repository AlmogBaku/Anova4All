from .common import AnovaCommand


class GetSecretKey(AnovaCommand):
    def supports_wifi(self) -> bool: return True

    def encode(self) -> str:
        return "get number"

    def decode(self, response: str) -> str:
        return response.strip()

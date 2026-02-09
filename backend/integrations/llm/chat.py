from pydantic import BaseModel

class UserMessage(BaseModel):
    text: str

class LlmChat:
    def __init__(self, api_key: str, session_id: str, system_message: str):
        pass

    def with_model(self, provider: str, model: str):
        return self

    async def send_message(self, message: UserMessage) -> str:
        # Return a dummy JSON response expected by the moderation logic
        # expected format: {"is_safe": true/false, "confidence": 0.0-1.0, "categories": {...}, "action": "allow/warn/block"}
        return '{"is_safe": true, "confidence": 1.0, "categories": {}, "action": "allow"}'

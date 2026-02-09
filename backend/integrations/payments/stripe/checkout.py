from pydantic import BaseModel

class CheckoutSessionResponse(BaseModel):
    url: str

class CheckoutStatusResponse(BaseModel):
    status: str

class CheckoutSessionRequest(BaseModel):
    price_id: str

class StripeCheckout:
    def __init__(self, api_key: str):
        pass
        
    async def create_session(self, request: CheckoutSessionRequest) -> CheckoutSessionResponse:
        return CheckoutSessionResponse(url="http://mock-stripe-url.com")

import os

from openai import OpenAI

MODEL = "openai/gpt-oss-120b"
BASE_URL = "https://openrouter.ai/api/v1"


class AIConfigError(RuntimeError):
    """Raised when AI configuration (API key, etc.) is missing or invalid."""


def _client() -> OpenAI:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise AIConfigError("OPENROUTER_API_KEY is not set")
    return OpenAI(api_key=api_key, base_url=BASE_URL)


def ping() -> str:
    """Send a trivial prompt to OpenRouter and return the raw reply text."""
    response = _client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "user", "content": "What is 2+2? Reply with only the number."},
        ],
    )
    return response.choices[0].message.content or ""

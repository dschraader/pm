import json
import os
from typing import Annotated, Any, Literal

from openai import OpenAI
from pydantic import BaseModel, Field

MODEL = "openai/gpt-oss-120b"
BASE_URL = "https://openrouter.ai/api/v1"


class AIConfigError(RuntimeError):
    """Raised when AI configuration (API key, etc.) is missing or invalid."""


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: str | None = None


class RenameColumnMutation(BaseModel):
    type: Literal["rename_column"]
    column_id: str
    title: str


class CreateCardMutation(BaseModel):
    type: Literal["create_card"]
    column_id: str
    title: str
    details: str


class EditCardMutation(BaseModel):
    type: Literal["edit_card"]
    card_id: str
    title: str
    details: str


class DeleteCardMutation(BaseModel):
    type: Literal["delete_card"]
    card_id: str


class MoveCardMutation(BaseModel):
    type: Literal["move_card"]
    card_id: str
    to_column_id: str
    to_index: int


Mutation = Annotated[
    RenameColumnMutation
    | CreateCardMutation
    | EditCardMutation
    | DeleteCardMutation
    | MoveCardMutation,
    Field(discriminator="type"),
]


class AIResponse(BaseModel):
    reply: str
    mutations: list[Mutation]


SYSTEM_PROMPT_TEMPLATE = """\
You are an AI assistant helping a user manage their Kanban board.

The current board state (JSON):
{board_json}

You can issue zero or more mutations on the board:
- rename_column: change a column's title.
- create_card: add a new card to a column (the server assigns the card id).
- edit_card: change a card's title and details.
- delete_card: remove a card.
- move_card: move a card to a column at an index (0-based; an index past the end
  pins the card to the end of the target column).

Use mutations only when the user explicitly asks for board changes. For
questions or discussion, return an empty `mutations` list and put your answer
in `reply`.

Always refer to existing columns and cards by the IDs shown in the board state.
Do not invent IDs - the server creates new card IDs for you when you use
`create_card`.
"""


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


def chat(
    board_state: dict[str, Any],
    history: list[ChatMessage],
    user_message: str,
) -> AIResponse:
    """Send a chat turn (board + history + new message) and parse the response."""
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        board_json=json.dumps(board_state, indent=2)
    )
    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for m in history:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": user_message})

    completion = _client().chat.completions.parse(
        model=MODEL,
        messages=messages,
        response_format=AIResponse,
    )
    parsed = completion.choices[0].message.parsed
    if parsed is None:
        raise RuntimeError("AI response could not be parsed against AIResponse schema")
    return parsed

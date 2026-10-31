"""Studio: run a profession playbook's crew of agents to write a whole document."""
from fastapi import APIRouter, Depends, HTTPException

from ..agents.harness.playbooks import PLAYBOOKS
from ..db import documents
from ..deps import Services, ai_target, get_current_user, get_services
from ..models.schemas import StudioRunRequest
from ..models.user import UserResponse
from ..services import billing
from ..services.llm import ModelTarget
from ..sse import sse_response

router = APIRouter(prefix="/api/studio", tags=["studio"])


def _brief(playbook, request: StudioRunRequest) -> str:
    """Turn the form into the brief every agent reads; rejects missing required answers and unknown choices."""
    answers = {key: value.strip() for key, value in request.fields.items() if value and value.strip()}
    missing = [f.label for f in playbook.fields if f.required and f.id not in answers]
    if missing:
        raise HTTPException(status_code=400, detail=f"Please fill in: {', '.join(missing)}")
    lines = []
    for f in playbook.fields:
        value = answers.get(f.id)
        if not value:
            continue
        if f.options and value not in f.options:
            raise HTTPException(status_code=400, detail=f"{f.label} must be one of: {', '.join(f.options)}")
        lines.append(f"- {f.label}: {value}")
    notes = f"\nNOTES FROM THE WRITER:\n{request.brief.strip()}" if request.brief.strip() else ""
    return "BRIEF:\n" + ("\n".join(lines) or "- (no form answers)") + notes


@router.get("/playbooks")
async def list_playbooks(_: UserResponse = Depends(get_current_user)):
    return {"playbooks": [playbook.public() for playbook in PLAYBOOKS.values()]}


@router.post("/run")
async def run(request: StudioRunRequest, user: UserResponse = Depends(get_current_user),
              target: ModelTarget = Depends(ai_target), services: Services = Depends(get_services)):
    playbook = PLAYBOOKS.get(request.playbook)
    if not playbook:
        raise HTTPException(status_code=404, detail="Unknown playbook")
    brief = _brief(playbook, request)
    document_ids = (await documents.owned_ids(user.id, request.document_ids, len(request.document_ids))
                    if request.document_ids else [])

    async def charge() -> bool:
        return await billing.charge_extra(user, target)

    return sse_response(services.harness.run(playbook, playbook.format(request.format), brief, request.depth == "thorough",
                                             user.id, document_ids, target, charge))

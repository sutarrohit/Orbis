from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from schemas.saved_result import (SavedResultDetail, SavedResultMeta,
                                  SaveResultRequest)
from services.result_service.save_results import SavedResultService

router = APIRouter()

saved_result_service = SavedResultService()


@router.post("/saved-results", response_model=SavedResultDetail, status_code=201)
def save_result(request: SaveResultRequest) -> SavedResultDetail:
    """Persist a prediction result to the local SQLite database."""
    return saved_result_service.save(
        result_type=request.type,
        data=request.data,
        label=request.label,
    )


@router.get("/saved-results", response_model=list[SavedResultMeta])
def list_saved_results() -> list[SavedResultMeta]:
    """Return metadata for all saved results, newest first."""
    return saved_result_service.list_all()


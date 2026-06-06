import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from scalar_fastapi import get_scalar_api_reference

from agents.lib.auth import require_service_auth
from agents.lib.config import settings
from agents.scheduler import shutdown_scheduler, start_scheduler
from errors.errors import PredictionAPIError
from routers import accounts, agents, scheduler as scheduler_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # The clock (§10): fire the Leader + follow-up sweep on an interval.
    # Off unless SCHEDULER_ENABLED=true, so importing the app never starts timers.
    if settings.scheduler_enabled:
        start_scheduler()
    yield
    if settings.scheduler_enabled:
        shutdown_scheduler()


app = FastAPI(
    title="PostPilot Agents API",
    description="Agent layer for PostPilot — the five-agent squad + Leader, gateway, accounts.",
    version="0.1.0",
    lifespan=lifespan,
)

# Include Routers — all guarded by the shared-secret service JWT from Hono.
_auth = [Depends(require_service_auth)]
app.include_router(agents.router, prefix="/api", tags=["Agents"], dependencies=_auth)
app.include_router(accounts.router, prefix="/api", tags=["Accounts"], dependencies=_auth)
app.include_router(scheduler_router.router, prefix="/api", tags=["Scheduler"], dependencies=_auth)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


logger = logging.getLogger(__name__)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content=jsonable_encoder(
            {
                "error": {
                    "code": "REQUEST_VALIDATION_ERROR",
                    "message": "Invalid prediction request. Please check the submitted fields.",
                    "details": {"fields": exc.errors()},
                }
            }
        ),
    )


@app.exception_handler(PredictionAPIError)
async def prediction_api_exception_handler(request: Request, exc: PredictionAPIError):
    return JSONResponse(status_code=exc.status_code, content=exc.to_response())


@app.exception_handler(Exception)
async def unexpected_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled prediction server error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Prediction failed because of an unexpected server error.",
            }
        },
    )


@app.get("/", include_in_schema=False)
def root():
    """Land on the Swagger UI."""
    return RedirectResponse(url="/docs")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/scalar", include_in_schema=False)
async def scalar_html():
    return get_scalar_api_reference(
        openapi_url=app.openapi_url,  # Your OpenAPI document
        scalar_proxy_url="https://proxy.scalar.com",  # Avoid CORS issues (optional)
    )

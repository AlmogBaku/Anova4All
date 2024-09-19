import asyncio
from contextlib import asynccontextmanager
from typing import Never, AsyncGenerator

import uvicorn
from anova_wifi.manager import AnovaManager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import router as anova_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, Never]:
    # Startup
    app.state.anova_manager = AnovaManager(host="0.0.0.0", port=8080)
    startup_task = asyncio.create_task(app.state.anova_manager.start())
    print("Starting up... Manager initialization started in background.")

    yield  # The FastAPI application runs here

    # Shutdown
    if app.state.anova_manager:
        await app.state.anova_manager.stop()
    startup_task.cancel()
    print("Shutdown complete")


app = FastAPI(lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Include the Anova API router
app.include_router(anova_router, prefix="/api/v1")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

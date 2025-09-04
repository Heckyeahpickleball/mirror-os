from __future__ import annotations

import json
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Body, HTTPException, Header
from pydantic import BaseModel, Field

# ---- simple local "storage" + "db" -----------------------------------------

ROOT = Path(__file__).resolve().parent.parent  # backend/
DATA_DIR = ROOT / "data"
TMP_DIR = DATA_DIR / "tmp"
SESS_DIR = DATA_DIR / "sessions"
DB_PATH = DATA_DIR / "db.json"

for d in (DATA_DIR, TMP_DIR, SESS_DIR):
    d.mkdir(parents=True, exist_ok=True)

def _load_db() -> dict:
    if not DB_PATH.exists():
        return {"sessions": {}}
    return json.loads(DB_PATH.read_text("utf-8"))

def _save_db(db: dict) -> None:
    DB_PATH.write_text(json.dumps(db, indent=2), encoding="utf-8")

# ---- FastAPI app ------------------------------------------------------------

app = FastAPI(title="Mirror OS API", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}


# --------- schemas ---------

class StartReq(BaseModel):
    filename: str = Field(..., description="Client's preferred final filename, e.g. 20250904_123456_session.mp4")
    size: Optional[int] = Field(None, description="Total size in bytes if known")
    mime: Optional[str] = Field(None, description="e.g. video/mp4")

class StartResp(BaseModel):
    session_id: str
    upload_id: str
    tmp_path: str

class FinalizeResp(BaseModel):
    session_id: str
    final_path: str
    size: int


# --------- endpoints ---------

@app.post("/v1/sessions/start", response_model=StartResp)
def start_session(req: StartReq):
    session_id = uuid.uuid4().hex
    upload_id = uuid.uuid4().hex

    tmp_file = TMP_DIR / f"{session_id}.part"
    tmp_file.write_bytes(b"")  # create/empty

    # write DB row (WIP status)
    db = _load_db()
    db["sessions"][session_id] = {
        "id": session_id,
        "upload_id": upload_id,
        "filename": req.filename,
        "size": req.size,
        "mime": req.mime,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "status": "uploading",
        "tmp_path": str(tmp_file),
        "final_path": None,
        "bytes_received": 0,
    }
    _save_db(db)

    return StartResp(session_id=session_id, upload_id=upload_id, tmp_path=str(tmp_file))


@app.post("/v1/sessions/{session_id}/upload-chunk")
def upload_chunk(
    session_id: str,
    data: bytes = Body(..., media_type="application/octet-stream"),
    content_range: Optional[str] = Header(default=None, convert_underscores=False),
    upload_id: Optional[str] = Header(default=None, convert_underscores=False),
):
    db = _load_db()
    row = db["sessions"].get(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="session not found")
    if upload_id and upload_id != row["upload_id"]:
        raise HTTPException(status_code=409, detail="upload_id mismatch")

    tmp_file = Path(row["tmp_path"])
    if not tmp_file.parent.exists():
        tmp_file.parent.mkdir(parents=True, exist_ok=True)

    # Append raw bytes
    with tmp_file.open("ab") as f:
        f.write(data)

    row["bytes_received"] = tmp_file.stat().st_size
    _save_db(db)
    return {"ok": True, "bytes_received": row["bytes_received"], "content_range": content_range}


@app.post("/v1/sessions/{session_id}/finalize", response_model=FinalizeResp)
def finalize(session_id: str):
    db = _load_db()
    row = db["sessions"].get(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="session not found")

    tmp_file = Path(row["tmp_path"])
    if not tmp_file.exists():
        raise HTTPException(status_code=400, detail="no tmp file to finalize")

    final_name = row["filename"] or f"{session_id}.mp4"
    final_path = SESS_DIR / final_name

    # If file with same name exists, make it unique
    if final_path.exists():
        stem, ext = os.path.splitext(final_name)
        final_path = SESS_DIR / f"{stem}_{session_id}{ext}"

    shutil.move(str(tmp_file), final_path)

    row["final_path"] = str(final_path)
    row["status"] = "complete"
    row["size"] = Path(final_path).stat().st_size
    _save_db(db)

    return FinalizeResp(session_id=session_id, final_path=str(final_path), size=row["size"])

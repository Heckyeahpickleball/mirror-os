import os
import io
import json
from pathlib import Path

from fastapi.testclient import TestClient
from app.main import app, DATA_DIR, SESS_DIR

client = TestClient(app)

def test_chunked_upload_5mb(tmp_path):
    # make a ~5MB buffer
    payload = os.urandom(5 * 1024 * 1024)

    # start
    r = client.post("/v1/sessions/start", json={
        "filename": "dummy_5mb.mp4",
        "size": len(payload),
        "mime": "video/mp4"
    })
    assert r.status_code == 200
    info = r.json()
    sid = info["session_id"]
    upid = info["upload_id"]

    # upload in two chunks
    mid = len(payload) // 2
    chunk1 = payload[:mid]
    chunk2 = payload[mid:]

    r1 = client.post(f"/v1/sessions/{sid}/upload-chunk",
                     data=chunk1,
                     headers={"Upload-Id": upid,
                              "Content-Range": f"bytes 0-{mid-1}/{len(payload)}",
                              "Content-Type": "application/octet-stream"})
    assert r1.status_code == 200

    r2 = client.post(f"/v1/sessions/{sid}/upload-chunk",
                     data=chunk2,
                     headers={"Upload-Id": upid,
                              "Content-Range": f"bytes {mid}-{len(payload)-1}/{len(payload)}",
                              "Content-Type": "application/octet-stream"})
    assert r2.status_code == 200

    # finalize
    r = client.post(f"/v1/sessions/{sid}/finalize")
    assert r.status_code == 200
    fin = r.json()
    final_path = Path(fin["final_path"])
    assert final_path.exists()
    assert fin["size"] == len(payload)
    # clean up test artifact
    final_path.unlink(missing_ok=True)

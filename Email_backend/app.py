import os
import json

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from typing import List
import pandas as pd
from utils import send_email_smtp, validate_columns, render_email_template, LOG_FILE

app = FastAPI()


def _save_df(df, file_path: str) -> str:
    """Save df back to file_path. If the file is locked (e.g. open in Excel),
    save to a *_status copy and return that path instead."""
    try:
        if file_path.endswith(".csv"):
            df.to_csv(file_path, index=False)
        else:
            df.to_excel(file_path, index=False)
        return file_path
    except PermissionError:
        # File is open in another application (e.g. Excel) — save to a fallback copy
        base, ext = os.path.splitext(file_path)
        fallback = f"{base}_status{ext}"
        if file_path.endswith(".csv"):
            df.to_csv(fallback, index=False)
        else:
            df.to_excel(fallback, index=False)
        return fallback


# ✅ CORS (required for React + Swagger)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://172.16.0.163:5173", "http://127.0.0.1:8000", "http://172.16.0.163:8000"],   # change in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "Email Automation API Running"}


# ✅ FILE UPLOAD TEST ENDPOINT

@app.post("/api/get-headers")
async def demo(file_path: str = Form(None)):
    print("Received file path:", file_path)

    try:
        # ❌ Case 1: No input
        if not file_path:
            raise HTTPException(status_code=400, detail="file_path is required")

        # ❌ Case 2: Invalid path
        if not os.path.exists(file_path):
            raise HTTPException(status_code=400, detail="File not found")

        # ✅ Read file
        if file_path.endswith(".csv"):
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path)

        # Use pandas JSON serializer to safely handle NaN/Infinity → null
        rows = json.loads(df.to_json(orient="records"))

        return {
            "file_path": file_path,
            "headers": list(df.columns),
            "rows": rows,
            "row_count": len(df)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ✅ MAIN EMAIL API
@app.post("/api/send-emails/")
async def send_emails(
    file_path: str = Form(...),
    sender_email: str = Form(...),
    smtp_password: str = Form(...),
    smtp_host: str = Form("zimsmtp.logix.in"),
    smtp_port: int = Form(587),
    sender_name: str = Form(""),
    sender_position: str = Form(""),
    sender_phone: str = Form(""),
    cc_emails: str = Form(""),
    selected_indices: str = Form(...),   # comma-separated row indices e.g. "0,1,3"
    subject: str = Form(...),
    body: str = Form(...),
    attachments: List[UploadFile] = File(default=[]),
):
    try:
        if not os.path.exists(file_path):
            raise HTTPException(status_code=400, detail="File not found at given path")

        # ✅ Read file from path
        if file_path.endswith(".csv"):
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path)

        # ✅ Validate required columns
        validate_columns(df)

        # ✅ Keep full df for writing back; work on selected rows only
        indices = [int(i) for i in selected_indices.split(",") if i.strip().isdigit()]
        selected_df = df.iloc[indices]

        # Ensure the status column exists
        if "Email_Status" not in df.columns:
            df["Email_Status"] = ""

        # ✅ Read attachment bytes once (reused for every recipient)
        attachment_data = []
        for upload in attachments:
            content = await upload.read()
            attachment_data.append({"filename": upload.filename, "content": content, "content_type": upload.content_type})

        results = []
        saved_path = file_path

        for original_idx, row in selected_df.iterrows():
            # ✅ Skip rows already successfully sent
            if str(row.get("Email_Status", "")).strip().lower() == "sent":
                results.append({
                    "email": row.get("Email", ""),
                    "status": "skipped",
                    "detail": "Already sent — skipped",
                })
                continue

            try:
                final_subject = subject.format(**row)

                # Per-row CC: prefer Excel "CC" column, fall back to form-level cc_emails
                row_cc = str(row.get("CC", "")).strip()
                effective_cc = row_cc if row_cc and row_cc.lower() not in ("nan", "none") else cc_emails

                # Per-row Greeting: prefer Excel "Greeting" column
                row_greeting = str(row.get("Greeting", "")).strip()
                effective_greeting = row_greeting if row_greeting and row_greeting.lower() not in ("nan", "none") else ""

                html_body = render_email_template(
                    name=row.get("Name", ""),
                    subject=final_subject,
                    body=body.format(**row),
                    sender_name=sender_name,
                    sender_position=sender_position,
                    sender_phone=sender_phone,
                    sender_email=sender_email,
                    greeting=effective_greeting,
                    to_email=row["Email"],
                    cc_email=effective_cc,
                )

                used_port = send_email_smtp(
                    to_email=row["Email"],
                    from_email=sender_email,
                    smtp_password=smtp_password,
                    subject=final_subject,
                    body=html_body,
                    smtp_host=smtp_host,
                    smtp_port=smtp_port,
                    cc_emails=effective_cc,
                    attachments=attachment_data,
                )

                df.at[original_idx, "Email_Status"] = "Sent"
                results.append({
                    "email": row["Email"],
                    "status": "sent",
                    "detail": f"Accepted by SMTP server via {used_port}",
                })

            except Exception as e:
                df.at[original_idx, "Email_Status"] = "Failed"
                results.append({"email": row.get("Email", "unknown"), "status": "failed", "error": str(e)})

            # ✅ Save after every email so partial progress is never lost
            saved_path = _save_df(df, file_path)

        warning = (
            f"Original file was open/locked. Status saved to: {saved_path}"
            if saved_path != file_path else None
        )
        return {"status": "completed", "results": results, "warning": warning}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Email log viewer ──────────────────────────────────────────────────────────
@app.get("/api/email-logs", response_class=PlainTextResponse)
def get_email_logs(lines: int = 100):
    """Return the last N lines of the email send log."""
    if not os.path.exists(LOG_FILE):
        return "No log file found yet."
    with open(LOG_FILE, encoding="utf-8") as f:
        all_lines = f.readlines()
    return "".join(all_lines[-lines:])
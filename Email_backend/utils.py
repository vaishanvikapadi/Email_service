import smtplib
import ssl
import errno
import socket
import logging
import os
import re
import base64
import mimetypes
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email import encoders
import time
from jinja2 import Environment, FileSystemLoader

# ── Logging setup ──────────────────────────────────────────────────────────────
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "email_log.txt")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),          # also prints to terminal
    ],
)
logger = logging.getLogger("email_service")


def validate_columns(df):
    required_columns = ["Email"]
    for col in required_columns:
        if col not in df.columns:
            raise Exception(f"Missing required column: {col}")


def render_email_template(name: str, subject: str, body: str,
                          sender_name: str = "", sender_position: str = "",
                          sender_phone: str = "", sender_email: str = "",
                          greeting: str = "", to_email: str = "",
                          cc_email: str = "") -> str:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    env = Environment(loader=FileSystemLoader(base_dir))
    template = env.get_template("email_template.html")
    return template.render(
        Name=name,
        subject=subject,
        body=body,
        sender_name=sender_name,
        sender_position=sender_position,
        sender_phone=sender_phone,
        sender_email=sender_email,
        greeting=greeting,
        to_email=to_email,
        cc_email=cc_email,
    )


def extract_inline_images(html_body: str):
    """
    Find all data: URI <img> sources in the HTML body, replace them with
    cid: references, and return (modified_html, list_of_MIMEImage_parts).
    """
    inline_images = []

    def replace_data_uri(match):
        full_src = match.group(1)
        m = re.match(r'data:([^;]+);base64,(.+)', full_src, re.DOTALL)
        if not m:
            return match.group(0)

        mime_type = m.group(1)           # e.g. image/png
        b64_data  = m.group(2).strip()
        img_data  = base64.b64decode(b64_data)
        subtype   = mime_type.split('/')[-1].lower()   # png, jpeg, gif …

        cid = f"inline_img_{len(inline_images)}"
        part = MIMEImage(img_data, _subtype=subtype)
        part.add_header('Content-ID', f'<{cid}>')
        part.add_header('Content-Disposition', 'inline', filename=f'image_{len(inline_images)}.{subtype}')
        inline_images.append(part)
        return f'src="cid:{cid}"'

    modified_html = re.sub(r'src="(data:[^"]+)"', replace_data_uri, html_body)
    return modified_html, inline_images


def _do_send(server, from_email, smtp_password, msg, to_email, port_label, all_recipients=None):
    """Login, send, and check for refused recipients. Returns detail string."""
    logger.info("  Attempting login as %s via %s", from_email, port_label)
    server.login(from_email, smtp_password)
    logger.info("  Login OK — sending to %s", to_email)

    # Pass recipients explicitly so CC addresses are included in SMTP RCPT TO
    rcpt_list = all_recipients if all_recipients else [to_email]
    logger.info("  RCPT TO list: %s", rcpt_list)
    refused = server.send_message(msg, to_addrs=rcpt_list)
    if refused:
        details = "; ".join(
            f"{addr}: {code} {msg_.decode()}"
            for addr, (code, msg_) in refused.items()
        )
        raise RuntimeError(f"SMTP server refused recipients: {details}")

    logger.info("  SMTP accepted message for %s via %s", to_email, port_label)
    return port_label


def send_email_smtp(to_email, from_email, smtp_password, subject, body,
                    smtp_host: str = "zimsmtp.logix.in", smtp_port: int = 587,
                    cc_emails: str = "", attachments: list = None):

    cc_list = [addr.strip() for addr in cc_emails.split(",") if addr.strip()]
    attachments = attachments or []

    # Extract base64 data: URI images from the body and convert to CID parts
    modified_body, inline_images = extract_inline_images(body)

    # Build MIME structure:
    #   inline images present  → multipart/related wraps alt + image parts
    #   file attachments present → multipart/mixed wraps related/alt + file parts
    html_part = MIMEText(modified_body, "html")

    if inline_images:
        related = MIMEMultipart("related", type="text/html")
        alt = MIMEMultipart("alternative")
        alt.attach(html_part)
        related.attach(alt)
        for img in inline_images:
            related.attach(img)
        inner = related
    else:
        inner = MIMEMultipart("alternative")
        inner.attach(html_part)

    if attachments:
        msg = MIMEMultipart("mixed")
        msg.attach(inner)
    else:
        msg = inner

    msg["Subject"] = subject
    msg["From"]    = from_email
    msg["To"]      = to_email
    if cc_list:
        msg["Cc"] = ", ".join(cc_list)

    # Attach each file
    for att in attachments:
        maintype, subtype = (att.get("content_type") or "application/octet-stream").split("/", 1)
        part = MIMEBase(maintype, subtype)
        part.set_payload(att["content"])
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", "attachment", filename=att["filename"])
        msg.attach(part)
        logger.info("  Attached file: %s (%d bytes)", att["filename"], len(att["content"]))

    # Build the explicit RCPT TO list: primary recipient + all CC addresses
    all_recipients = [to_email] + cc_list

    logger.info(
        "── Sending email ──  to=%s  cc=%s  from=%s  subject=%r  host=%s  port=%s",
        to_email, cc_list or "none", from_email, subject, smtp_host, smtp_port,
    )

    used_port = None
    try:
        if smtp_port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as server:
                used_port = _do_send(server, from_email, smtp_password, msg, to_email, f"SSL:{smtp_port}", all_recipients)
        else:
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                used_port = _do_send(server, from_email, smtp_password, msg, to_email, f"STARTTLS:{smtp_port}", all_recipients)

    except (OSError, socket.error) as e:
        if hasattr(e, 'winerror') and e.winerror == 10013 or getattr(e, 'errno', None) in (errno.EACCES, errno.EPERM):
            logger.error("  Firewall blocked port %s for %s: %s", smtp_port, to_email, e)
            raise RuntimeError(
                f"SMTP port {smtp_port} is blocked by the firewall or OS. "
                "Run the server as Administrator or allow the port in Windows Firewall."
            ) from e

        logger.warning("  Port %s failed (%s) — falling back to SSL:465", smtp_port, e)
        try:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(smtp_host, 465, context=context) as server:
                used_port = _do_send(server, from_email, smtp_password, msg, to_email, "SSL:465(fallback)", all_recipients)
        except (OSError, socket.error) as e2:
            if hasattr(e2, 'winerror') and e2.winerror == 10013 or getattr(e2, 'errno', None) in (errno.EACCES, errno.EPERM):
                logger.error("  Firewall also blocked port 465 for %s: %s", to_email, e2)
                raise RuntimeError(
                    "SMTP ports 587 and 465 are both blocked. "
                    "Run the server as Administrator or whitelist these ports in Windows Firewall."
                ) from e2
            logger.error("  Fallback SSL:465 also failed for %s: %s", to_email, e2)
            raise

    logger.info("  SUCCESS  to=%s  port=%s", to_email, used_port)
    time.sleep(5)
    return used_port

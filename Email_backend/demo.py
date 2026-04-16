import smtplib
from email.mime.text import MIMEText

# 🔹 Your email credentials
SMTP_SERVER = "zimsmtp.logix.in"   # 🔁 change this
SMTP_PORT = 465                        # 465 = SSL, 587 = TLS
EMAIL = "vaishnavi.kapadi@quantafic.com"
PASSWORD = "VDK_26@ka"         # use app password

# 🔹 Receiver
TO_EMAIL = "vaishnavikapadi7028@gmail.com"

# 🔹 Email content
subject = "Test Email"
body = """
Hi,

This is a test email sent from Python.

Thanks,
Sales Team
"""

# 🔹 Create message
msg = MIMEText(body, "plain")
msg["Subject"] = subject
msg["From"] = EMAIL
msg["To"] = TO_EMAIL

# 🔹 Send email
try:
    with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
        server.login(EMAIL, PASSWORD)
        server.send_message(msg)

    print("✅ Email sent successfully!")

except Exception as e:
    print("❌ Error:", e)
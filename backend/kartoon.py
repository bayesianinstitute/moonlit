from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
import smtplib
from pydantic import BaseModel
import json
from generate_panels import generate_panels
from stability_ai import text_to_image
from add_text import add_text_to_panel
from create_strip import create_strip
from typing import List
from PIL import Image
from io import BytesIO
import os
import uvicorn
import uuid  # Import the uuid module

# Initialize the FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust as needed for your production environment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define the request body model
class ScenarioRequest(BaseModel):
    scenario: str
    style: str
    email: str 

# Define the API endpoint for generating the comic strip
# @app.post("/generate-comic/")
# async def generate_comic(request: ScenarioRequest):
#     # Extract scenario and style from the request
#     SCENARIO = request.scenario
#     STYLE = request.style

#     # Generate panels from the scenario
#     print(f"Generate panels with style '{STYLE}' for this scenario: \n {SCENARIO}")
#     panels = generate_panels(SCENARIO)

#     # Generate images for each panel and add text
#     panel_images = []
#     for panel in panels:
#         panel_prompt = panel["description"] + ", cartoon box, " + STYLE
#         print(f"Generate panel {panel['number']} with prompt: {panel_prompt}")
#         panel_image = text_to_image(panel_prompt)  # Assume this function returns an image
#         panel_image_with_text = add_text_to_panel(panel["text"], panel_image)
#         panel_images.append(panel_image_with_text)

#     # Create the comic strip from the generated panels
#     comic_strip = create_strip(panel_images)

#     # Generate a unique filename using UUID
#     unique_filename = f"comic_strip_{uuid.uuid4()}.pdf"
#     pdf_filename = os.path.join("output", unique_filename)

#     # Save the PDF to disk
#     comic_strip.save(pdf_filename, format="PDF")
#     print(f"Comic strip saved to {pdf_filename}")

#     # Return a download link
#     return {"download_url": f"/download/{unique_filename}", "view_url": f"/view/{unique_filename}"}

# Define a route for downloading the PDF
@app.get("/download/{filename}")
async def download_pdf(filename: str):
    file_path = os.path.join("output", filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="application/pdf", filename=filename)
    raise HTTPException(status_code=404, detail="File not found")

# Define a route for viewing the PDF
@app.get("/view/{filename}")
async def view_pdf(filename: str):
    file_path = os.path.join("output", filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="application/pdf", headers={"Content-Disposition": "inline; filename=" + filename})
    raise HTTPException(status_code=404, detail="File not found")

# Email sending function
def send_email_with_attachment(to_email: str, pdf_file_path: str):
    EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
    EMAIL_PORT = int(os.getenv("EMAIL_PORT", 587))
    EMAIL_USER = os.getenv("EMAIL_USER")
    EMAIL_PASS = os.getenv("EMAIL_PASS")

    msg = MIMEMultipart()
    msg['From'] = EMAIL_USER
    msg['To'] = to_email
    msg['Subject'] = "Your Comic Book from ComicDreams"

    body = MIMEText("Here is your comic book. Enjoy!")
    msg.attach(body)

    with open(pdf_file_path, 'rb') as f:
        part = MIMEApplication(f.read(), _subtype="pdf")
        part.add_header('Content-Disposition', 'attachment', filename=os.path.basename(pdf_file_path))
        msg.attach(part)

    try:
        server = smtplib.SMTP(EMAIL_HOST, EMAIL_PORT)
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASS)
        server.sendmail(EMAIL_USER, to_email, msg.as_string())
        server.quit()
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False


# Define an API endpoint to send the comic via email
@app.post("/send_comic_email/")
async def send_comic_email(request: ScenarioRequest):
    SCENARIO = request.scenario
    STYLE = request.style
    EMAIL = request.email  # Email address to send the comic to

    # Generate panels from the scenario (same as in generate-comic)
    print(f"Generate panels with style '{STYLE}' for this scenario: \n {SCENARIO}")
    panels = generate_panels(SCENARIO)

    # Generate images for each panel and add text
    panel_images = []
    for panel in panels:
        panel_prompt = panel["description"] + ", cartoon box, " + STYLE
        print(f"Generate panel {panel['number']} with prompt: {panel_prompt}")
        panel_image = text_to_image(panel_prompt)  # Assume this function returns an image
        panel_image_with_text = add_text_to_panel(panel["text"], panel_image)
        panel_images.append(panel_image_with_text)

    # Create the comic strip from the generated panels
    comic_strip = create_strip(panel_images)

    # Generate a unique filename using UUID
    unique_filename = f"comic_strip_{uuid.uuid4()}.pdf"
    pdf_filename = os.path.join("output", unique_filename)

    # Save the PDF to disk
    comic_strip.save(pdf_filename, format="PDF")
    print(f"Comic strip saved to {pdf_filename}")

    # Send the PDF as an email attachment
    if not send_email_with_attachment(EMAIL, pdf_filename):
        raise HTTPException(status_code=500, detail="Failed to send email")

    # Return message with download URL and view URL
    return {
        "message": "Comic generated and sent to your email!",
        "download_url": f"/download/{unique_filename}",
        "view_url": f"/view/{unique_filename}"
    }


# Run the app with Uvicorn (Optional: You can run this command in the terminal)
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
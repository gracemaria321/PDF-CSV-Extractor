import os
import sys
import shutil
import urllib.request
import zipfile
import pytesseract
from typing import Optional

EXACT_POPPLER_BIN = r"D:\Poppler-Release-26.09.0-0\poppler-26.09.0\Library\bin"
EXACT_TESSERACT_DIR = r"D:\Tesseract-OCR"
TESSERACT_EXE = os.path.join(EXACT_TESSERACT_DIR, "tesseract.exe")

def bundled_path(relative_path):
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))

    return os.path.join(base_path, relative_path)


BUNDLED_POPPLER_BIN = bundled_path("poppler")
BUNDLED_TESSERACT_DIR = bundled_path("tesseract")
BUNDLED_TESSERACT_EXE = os.path.join(
    BUNDLED_TESSERACT_DIR, "tesseract.exe"
)

def get_poppler_path() -> Optional[str]:

    if os.path.isfile(
    os.path.join(BUNDLED_POPPLER_BIN, "pdftoppm.exe")
):
        return BUNDLED_POPPLER_BIN

    """Verifies and returns the exact Poppler path on D:\\ drive."""
    # 1. Check specified D:\ path
    if os.path.exists(os.path.join(EXACT_POPPLER_BIN, "pdftoppm.exe")) or \
       os.path.exists(os.path.join(EXACT_POPPLER_BIN, "pdftoppm")):
        return EXACT_POPPLER_BIN

    # 2. Check system PATH fallback
    if shutil.which("pdftoppm"):
        return None

    raise FileNotFoundError(
        f"Poppler binary not found at '{EXACT_POPPLER_BIN}'.\n"
        "Please verify that Poppler is extracted to this exact location."
    )


def setup_tesseract():
    if os.path.isfile(BUNDLED_TESSERACT_EXE):
        pytesseract.pytesseract.tesseract_cmd = BUNDLED_TESSERACT_EXE

        # The bundled directory contains the tessdata folder.
        os.environ["TESSDATA_PREFIX"] = BUNDLED_TESSERACT_DIR
        return

    """Configures pytesseract with the executable at D:\\Tesseract-OCR."""
    # 1. Check exact executable on D:\ drive
    if os.path.exists(TESSERACT_EXE):
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_EXE
        return

    # 2. Check system PATH fallback
    if shutil.which("tesseract"):
        return

    # 3. Check D:\ Windows installer location fallback
    win_default = r"D:\Tesseract-OCR\tesseract.exe"
    if os.path.exists(win_default):
        pytesseract.pytesseract.tesseract_cmd = win_default
        return

    # 4. Auto-download portable release directly into D:\Tesseract-OCR if missing
    if sys.platform == "win32" or sys.platform == "win64":
        os.makedirs(EXACT_TESSERACT_DIR, exist_ok=True)
        zip_path = os.path.join(EXACT_TESSERACT_DIR, "tesseract.zip")
        
        url = "https://github.com/UB-Mannheim/tesseract/releases/download/v5.3.3.20231005/tesseract-ocr-w64-v5.3.3.20231005.zip"
        print(f"[*] Downloading portable Tesseract to '{EXACT_TESSERACT_DIR}'...")
        
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req) as response, open(zip_path, 'wb') as out_file:
            shutil.copyfileobj(response, out_file)

        print("[*] Extracting Tesseract...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(EXACT_TESSERACT_DIR)

        if os.path.exists(zip_path):
            os.remove(zip_path)

        if os.path.exists(TESSERACT_EXE):
            pytesseract.pytesseract.tesseract_cmd = TESSERACT_EXE
            return

    raise FileNotFoundError(
        f"Tesseract executable not found at '{TESSERACT_EXE}'.\n"
        "Please place tesseract.exe directly inside 'D:\\Tesseract-OCR'."
    )


def ensure_dependencies() -> dict:
    """Call this at application startup to verify and set binary paths."""
    poppler_path = get_poppler_path()
    setup_tesseract()

    return {
        "poppler_path": poppler_path
    }
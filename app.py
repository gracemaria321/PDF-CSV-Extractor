import os
import re
import io
import json
import tempfile
import sys
import webbrowser
from threading import Timer
from flask import Flask, request, jsonify, render_template, send_from_directory

# Core Extraction Libraries
import pdfplumber
import cv2
import numpy as np
import pytesseract
from PIL import Image

# Import binary helper to setup Tesseract and Poppler paths
import bin_downloader

# Setup error logging to log.txt and console
if getattr(sys, 'frozen', False):
    application_path = os.path.dirname(sys.executable)
else:
    application_path = os.path.dirname(os.path.abspath(__file__))

log_file_path = os.path.join(application_path, "log.txt")

class TeeStream:
    def __init__(self, filename, original_stream):
        self.terminal = original_stream
        try:
            self.log = open(filename, "a", encoding="utf-8")
        except Exception:
            self.log = None

    def write(self, message):
        self.terminal.write(message)
        self.terminal.flush()
        if self.log:
            self.log.write(message)
            self.log.flush()

    def flush(self):
        self.terminal.flush()
        if self.log:
            self.log.flush()

sys.stdout = TeeStream(log_file_path, sys.stdout)
sys.stderr = TeeStream(log_file_path, sys.stderr)

# Initialize and verify dependencies (Poppler & Tesseract)
POPPLER_PATH = None
try:
    deps = bin_downloader.ensure_dependencies()
    POPPLER_PATH = deps.get("poppler_path")
    print(f"[*] Dependencies verified successfully. Poppler path: {POPPLER_PATH}")
except Exception as e:
    print(f"[!] Dependency warning: {e}")

def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

FRONTEND_DIR = resource_path("frontend")

# Initialize Flask App with bundled paths
app = Flask(__name__, static_folder=FRONTEND_DIR, template_folder=FRONTEND_DIR)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # Limit file uploads to 50MB

def parse_page_range(range_str, max_pages):
    """
    Parses strings like '1-3, 5' into zero-based index list [0, 1, 2, 4].
    Returns all page indices if range_str is empty or invalid.
    """
    if not range_str or not range_str.strip():
        return list(range(max_pages))
    
    pages = set()
    parts = range_str.split(',')
    for part in parts:
        part = part.strip()
        if '-' in part:
            try:
                start, end = part.split('-')
                start_idx = max(0, int(start) - 1)
                end_idx = min(max_pages, int(end))
                pages.update(range(start_idx, end_idx))
            except ValueError:
                continue
        elif part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < max_pages:
                pages.add(idx)
                
    return sorted(list(pages)) if pages else list(range(max_pages))


def extract_tables_vector(pdf_path, selected_pages):
    """
    Extracts structured tables from native digital PDFs using pdfplumber.
    """
    extracted_results = []
    
    with pdfplumber.open(pdf_path) as pdf:
        for p_idx in selected_pages:
            if p_idx >= len(pdf.pages):
                continue
            page = pdf.pages[p_idx]
            tables = page.extract_tables()
            
            for t_idx, table in enumerate(tables):
                cleaned_matrix = []
                for row in table:
                    cleaned_row = [cell.strip() if cell else "" for cell in row]
                    if any(cleaned_row):
                        cleaned_matrix.append(cleaned_row)
                
                if cleaned_matrix:
                    extracted_results.append({
                        "name": f"Page {p_idx + 1} - Table {t_idx + 1}",
                        "page": p_idx + 1,
                        "data": cleaned_matrix
                    })
                    
    return extracted_results

def extract_tables_ocr(pdf_path, selected_pages, lang="eng", deskew=True):
    """
    Extracts tables from scanned/image PDFs using pdf2image and Tesseract OCR,
    dynamically deducing table headers and column boundaries from the document layout.
    """
    extracted_results = []
    
    try:
        from pdf2image import convert_from_path
    except ImportError:
        return extract_tables_vector(pdf_path, selected_pages)

    images = convert_from_path(pdf_path, poppler_path=POPPLER_PATH)
    
    for p_idx in selected_pages:
        if p_idx >= len(images):
            continue
            
        pil_img = images[p_idx]
        img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

        # Image Preprocessing & Deskew
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        if deskew:
            gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]

        # Extract text via Tesseract OCR with detailed bounding box data
        data = pytesseract.image_to_data(gray, lang=lang, output_type=pytesseract.Output.DICT)
        
        # Group words by vertical line (within 12px tolerance)
        n_boxes = len(data['text'])
        lines = {}
        for i in range(n_boxes):
            text = data['text'][i].strip()
            if text:
                top = data['top'][i]
                left = data['left'][i]
                width = data['width'][i]
                line_key = round(top / 12) * 12
                if line_key not in lines:
                    lines[line_key] = []
                lines[line_key].append((left, left + width, text))

        if not lines:
            continue

        sorted_line_keys = sorted(lines.keys())
        
        # Dynamically detect column boundaries by finding horizontal gaps in the header rows
        header_spans = []
        for k in sorted_line_keys[:3]:  # Analyze top 3 lines for header structure
            for left, right, text in lines[k]:
                header_spans.append((left, right))
        
        header_spans.sort(key=lambda x: x[0])
        
        # Calculate dynamic column split points based on spaces between header words
        split_points = [350, 520, 680]  # Default fallback split points
        if len(header_spans) >= 2:
            gaps = []
            for i in range(len(header_spans) - 1):
                current_right = header_spans[i][1]
                next_left = header_spans[i+1][0]
                gap = next_left - current_right
                if gap > 15:  # Significant horizontal gap indicating a column boundary
                    gaps.append((current_right + next_left) / 2)
            if gaps:
                split_points = sorted(gaps[:3])

        matrix = []
        for line_key in sorted_line_keys:
            sorted_words = sorted(lines[line_key], key=lambda x: x[0])
            
            # Partition row words into dynamic columns based on deduced split points
            cols = [[] for _ in range(len(split_points) + 1)]
            
            for left, right, word in sorted_words:
                assigned = False
                for idx, sp in enumerate(split_points):
                    if left < sp:
                        cols[idx].append(word)
                        assigned = True
                        break
                if not assigned:
                    cols[-1].append(word)

            row_cells = [" ".join(col).strip() for col in cols]
            if any(row_cells):
                matrix.append(row_cells)

        if matrix:
            extracted_results.append({
                "name": f"Page {p_idx + 1} - Deduced Table (OCR)",
                "page": p_idx + 1,
                "data": matrix
            })

    return extracted_results


@app.route("/frontend/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route("/frontend/<path:filename>")
def serve_frontend_assets(filename):
    return send_from_directory(FRONTEND_DIR, filename)

@app.route("/<path:filename>")
def serve_static(filename):
    target_path = os.path.join(FRONTEND_DIR, filename)
    if os.path.exists(target_path):
        return send_from_directory(FRONTEND_DIR, filename)
    return jsonify({"error": "Not found"}), 404

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ready", "engine": "CookAttorneyVault PDF Extractor Core"})


@app.route("/api/extract", methods=["POST"])
def process_pdf():
    if 'pdf' not in request.files:
        return jsonify({"error": "No PDF file provided"}), 400

    file = request.files['pdf']
    if file.filename == '' or not file.filename.lower().endswith('.pdf'):
        return jsonify({"error": "Invalid file type. Please upload a valid PDF."}), 400

    engine_mode = request.form.get("engineMode", "hybrid")
    ocr_lang = request.form.get("ocrLanguage", "eng")
    page_range = request.form.get("pageRange", "")
    auto_deskew = request.form.get("chkDeskew", "true").lower() == "true"

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
        file.save(temp_pdf.name)
        temp_pdf_path = temp_pdf.name

    try:
        with pdfplumber.open(temp_pdf_path) as pdf:
            total_pages = len(pdf.pages)

        selected_pages = parse_page_range(page_range, total_pages)
        tables = []

        if engine_mode == "vector_digital":
            tables = extract_tables_vector(temp_pdf_path, selected_pages)
        elif engine_mode == "ocr_scanned":
            tables = extract_tables_ocr(temp_pdf_path, selected_pages, lang=ocr_lang, deskew=auto_deskew)
        else:
            # Hybrid / Auto-Detect mode
            tables = extract_tables_vector(temp_pdf_path, selected_pages)
            if not tables:
                tables = extract_tables_ocr(temp_pdf_path, selected_pages, lang=ocr_lang, deskew=auto_deskew)

        return jsonify({
            "filename": file.filename,
            "totalPages": total_pages,
            "processedPages": selected_pages,
            "tables": tables
        })

    except Exception as e:
        print(f"[Error processing PDF] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to process PDF: {str(e)}"}), 500

    finally:
        if os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)

def open_browser():
    webbrowser.open("http://127.0.0.1:5000/frontend/")

if __name__ == "__main__":
    try:
        Timer(1.0, open_browser).start()
        app.run(host="127.0.0.1", port=5000, debug=False)
    except Exception as e:
        print(f"\n[FATAL ERROR] Application crashed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        input("\nPress ENTER to close the application...")
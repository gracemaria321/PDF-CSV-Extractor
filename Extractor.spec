
# -*- mode: python ; coding: utf-8 -*-

import os
import sys

# Python 3.15 ABI compatibility DLL required by cryptography's Rust extension.
python3t_dll = os.path.join(
    sys.base_prefix,
    "abi3t-compat",
    "python3t.dll",
)

if not os.path.isfile(python3t_dll):
    raise FileNotFoundError(
        f"Required Python compatibility DLL not found: {python3t_dll}"
    )

a = Analysis(
    ["app.py"],
    pathex=[],

    binaries=[
        (python3t_dll, "abi3t-compat"),
    ],

    datas=[
        ("frontend", "frontend"),
        (r"D:\Tesseract-OCR", "tesseract"),
        (
            r"D:\Poppler-Release-26.09.0-0\poppler-26.09.0\Library\bin",
            "poppler",
        ),
    ],

    hiddenimports=["pdf2image"],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

# No COLLECT step: build a single-file executable.
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="Extractor",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

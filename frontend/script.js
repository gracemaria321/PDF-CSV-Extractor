document.addEventListener("DOMContentLoaded", () => {

  // State Management
  let currentFile = null;
  let extractedTables = [];
  let activeTableIndex = 0;

  // UI Elements
  const dropZone = document.getElementById("dropZone");
  const pdfFileInput = document.getElementById("pdfFileInput");
  const fileMetaCard = document.getElementById("fileMetaCard");
  const fileName = document.getElementById("fileName");
  const fileSize = document.getElementById("fileSize");
  const removeFileBtn = document.getElementById("removeFileBtn");
  const processPdfBtn = document.getElementById("processPdfBtn");

  const tableSelect = document.getElementById("tableSelect");
  const editableDataTable = document.getElementById("editableDataTable");
  const tableHeader = document.getElementById("tableHeader");
  const tableBody = document.getElementById("tableBody");
  const tablePlaceholder = document.getElementById("tablePlaceholder");
  const rowCountText = document.getElementById("rowCountText");
  const tableSearchInput = document.getElementById("tableSearchInput");

  const exportCurrentBtn = document.getElementById("exportCurrentBtn");
  const exportAllZipBtn = document.getElementById("exportAllZipBtn");
  const addRowBtn = document.getElementById("addRowBtn");
  const addColBtn = document.getElementById("addColBtn");
  const cleanEmptyBtn = document.getElementById("cleanEmptyBtn");

  const processingModal = document.getElementById("processingModal");
  const progressFill = document.getElementById("progressFill");
  const progressPercent = document.getElementById("progressPercent");
  const modalStatusTitle = document.getElementById("modalStatusTitle");
  const modalStatusDetail = document.getElementById("modalStatusDetail");

  const viewerPlaceholder = document.getElementById("viewerPlaceholder");
  const pdfPagePreview = document.getElementById("pdfPagePreview");
  const pageBadge = document.getElementById("pageBadge");
  const pageControls = document.getElementById("pageControls");

  // File Upload Handlers
  dropZone.addEventListener("click", () => pdfFileInput.click());

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });

  pdfFileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  });

  function handleFileSelection(file) {
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      alert("Please select a valid PDF file.");
      return;
    }

    currentFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB • PDF Document`;

    dropZone.classList.add("hidden");
    fileMetaCard.classList.remove("hidden");
    processPdfBtn.disabled = false;

    viewerPlaceholder.classList.add("hidden");
    pdfPagePreview.classList.remove("hidden");
    pageBadge.textContent = `File Ready`;
    pageControls.style.display = "flex";
  }

  removeFileBtn.addEventListener("click", () => {
    currentFile = null;
    pdfFileInput.value = "";
    dropZone.classList.remove("hidden");
    fileMetaCard.classList.add("hidden");
    processPdfBtn.disabled = true;

    resetWorkspace();
  });

  function resetWorkspace() {
    extractedTables = [];
    tableSelect.innerHTML = '<option>No document processed yet</option>';
    tableSelect.disabled = true;
    editableDataTable.classList.add("hidden");
    tablePlaceholder.classList.remove("hidden");
    
    exportCurrentBtn.disabled = true;
    exportAllZipBtn.disabled = true;
    addRowBtn.disabled = true;
    addColBtn.disabled = true;
    cleanEmptyBtn.disabled = true;
    tableSearchInput.disabled = true;

    viewerPlaceholder.classList.remove("hidden");
    pdfPagePreview.classList.add("hidden");
    pageBadge.textContent = "Page - / -";
    pageControls.style.display = "none";
    rowCountText.textContent = "0 rows, 0 columns";
  }

  // Real Backend API Processing
  processPdfBtn.addEventListener("click", () => {
    if (!currentFile) return;

    processingModal.classList.remove("hidden");
    updateProgress(20, "Uploading PDF to Server...", "Sending document to Flask backend...");

    const formData = new FormData();
    formData.append("pdf", currentFile);
    formData.append("engineMode", document.getElementById("engineModeSelect").value);
    formData.append("ocrLanguage", document.getElementById("ocrLanguageSelect").value);
    formData.append("chkDeskew", document.getElementById("chkDeskew").checked);
    formData.append("pageRange", document.getElementById("pageRangeInput").value);
    formData.append("customColumns", document.getElementById("customColumnsInput").value);

    updateProgress(50, "Running OCR & Layout Extraction...", "Analyzing tables via Tesseract & Poppler...");

    fetch("/api/extract", {
      method: "POST",
      body: formData
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(err => { throw new Error(err.error || "Server extraction failed"); });
      }
      return response.json();
    })
    .then(data => {
      updateProgress(100, "Extraction Complete!", "Formatting table matrix...");
      setTimeout(() => {
        processingModal.classList.add("hidden");
        extractedTables = data.tables || [];
        
        if (extractedTables.length === 0) {
          alert("No tables were detected in the PDF. Try switching the recognition engine mode.");
          resetWorkspace();
          return;
        }

        populateTableDropdown();
        renderActiveTable(0);
      }, 500);
    })
    .catch(error => {
      processingModal.classList.add("hidden");
      alert("Error: " + error.message);
      console.error(error);
    });
  });

  function updateProgress(percent, title, detail) {
    progressFill.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    modalStatusTitle.textContent = title;
    modalStatusDetail.textContent = detail;
  }

  function populateTableDropdown() {
    tableSelect.innerHTML = "";
    extractedTables.forEach((t, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = t.name;
      tableSelect.appendChild(opt);
    });
    tableSelect.disabled = false;
  }

  tableSelect.addEventListener("change", (e) => {
    renderActiveTable(parseInt(e.target.value));
  });

  // Render Table to DOM
  function renderActiveTable(index) {
    activeTableIndex = index;
    const tableObj = extractedTables[index];
    if (!tableObj || !tableObj.data.length) return;

    const data = tableObj.data;
    tableHeader.innerHTML = "";
    tableBody.innerHTML = "";

    // Header Row
    const headerRow = document.createElement("tr");
    data[0].forEach((colText, colIdx) => {
      const th = document.createElement("th");
      th.textContent = colText;
      th.contentEditable = "true";
      th.addEventListener("input", (e) => {
        extractedTables[activeTableIndex].data[0][colIdx] = e.target.textContent;
      });
      headerRow.appendChild(th);
    });
    tableHeader.appendChild(headerRow);

    // Body Rows
    for (let r = 1; r < data.length; r++) {
      const tr = document.createElement("tr");
      data[r].forEach((cellText, c) => {
        const td = document.createElement("td");
        td.textContent = cellText;
        td.contentEditable = "true";
        td.addEventListener("input", (e) => {
          extractedTables[activeTableIndex].data[r][c] = e.target.textContent;
        });
        tr.appendChild(td);
      });
      tableBody.appendChild(tr);
    }

    tablePlaceholder.classList.add("hidden");
    editableDataTable.classList.remove("hidden");

    // Enable Editing & Export Tools
    exportCurrentBtn.disabled = false;
    exportAllZipBtn.disabled = false;
    addRowBtn.disabled = false;
    addColBtn.disabled = false;
    cleanEmptyBtn.disabled = false;
    tableSearchInput.disabled = false;

    updateRowCount();
  }

  function updateRowCount() {
    const data = extractedTables[activeTableIndex]?.data || [];
    const rows = Math.max(0, data.length - 1);
    const cols = data[0] ? data[0].length : 0;
    rowCountText.textContent = `${rows} data row(s), ${cols} column(s)`;
  }

  // Row / Column Operations
  addRowBtn.addEventListener("click", () => {
    const data = extractedTables[activeTableIndex].data;
    const cols = data[0].length;
    const newRow = new Array(cols).fill("New Value");
    data.push(newRow);
    renderActiveTable(activeTableIndex);
  });

  addColBtn.addEventListener("click", () => {
    const data = extractedTables[activeTableIndex].data;
    data[0].push("New Column");
    for (let r = 1; r < data.length; r++) {
      data[r].push("");
    }
    renderActiveTable(activeTableIndex);
  });

  cleanEmptyBtn.addEventListener("click", () => {
    let data = extractedTables[activeTableIndex].data;
    const filtered = [data[0]];

    for (let r = 1; r < data.length; r++) {
      const isNotEmpty = data[r].some((cell) => cell.trim() !== "");
      if (isNotEmpty) filtered.push(data[r]);
    }

    extractedTables[activeTableIndex].data = filtered;
    renderActiveTable(activeTableIndex);
  });

  // Cell Filter
  tableSearchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    const rows = tableBody.querySelectorAll("tr");

    rows.forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? "" : "none";
    });
  });

  // CSV Generation Engine
  function matrixToCSV(matrix) {
    return matrix
      .map((row) =>
        row
          .map((cell) => {
            const escaped = ("" + cell).replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(",")
      )
      .join("\n");
  }

  function downloadCSVFile(csvContent, filename) {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  exportCurrentBtn.addEventListener("click", () => {
    const activeTable = extractedTables[activeTableIndex];
    if (!activeTable) return;

    const csvContent = matrixToCSV(activeTable.data);
    const safeName = activeTable.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    downloadCSVFile(csvContent, `${safeName}.csv`);
  });

  exportAllZipBtn.addEventListener("click", () => {
    if (typeof JSZip === "undefined") {
      alert("ZIP library failed to load.");
      return;
    }

    const zip = new JSZip();

    extractedTables.forEach((tbl) => {
      const csvData = matrixToCSV(tbl.data);
      const filename = `${tbl.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.csv`;
      zip.file(filename, csvData);
    });

    zip.generateAsync({ type: "blob" }).then((content) => {
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = "extracted_pdf_tables.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  });
});

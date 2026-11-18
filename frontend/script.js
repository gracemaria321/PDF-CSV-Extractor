document.addEventListener("DOMContentLoaded", () => {
  // State Management
  let currentFiles = [];
  let extractedTables = [];      // All tables across all files
  let filteredTableIndices = []; // Indices in extractedTables matching current docSelect filter
  let activeTableIndex = -1;     // Global index inside extractedTables
  let selectedRowIndex = -1;
  let selectedColIndex = -1;
  const undoStack = [];

  // Upload UI Elements
  const dropZone = document.getElementById("dropZone");
  const selectSingleBtn = document.getElementById("selectSingleBtn");
  const selectFolderBtn = document.getElementById("selectFolderBtn");
  const singlePdfInput = document.getElementById("singlePdfInput");
  const folderPdfInput = document.getElementById("folderPdfInput");
  const fileMetaCard = document.getElementById("fileMetaCard");
  const fileName = document.getElementById("fileName");
  const fileSize = document.getElementById("fileSize");
  const removeFileBtn = document.getElementById("removeFileBtn");
  const processPdfBtn = document.getElementById("processPdfBtn");

  // Workspace UI Elements
  const docSelect = document.getElementById("docSelect");
  const tableSelect = document.getElementById("tableSelect");
  const editableDataTable = document.getElementById("editableDataTable");
  const tableHeader = document.getElementById("tableHeader");
  const tableBody = document.getElementById("tableBody");
  const tablePlaceholder = document.getElementById("tablePlaceholder");
  const rowCountText = document.getElementById("rowCountText");
  const tableSearchInput = document.getElementById("tableSearchInput");

  // Export & Edit Buttons
  const exportCurrentBtn = document.getElementById("exportCurrentBtn");
  const exportDocBtn = document.getElementById("exportDocBtn");
  const exportAllMergedBtn = document.getElementById("exportAllMergedBtn");
  const exportAllZipBtn = document.getElementById("exportAllZipBtn");

  const addRowBtn = document.getElementById("addRowBtn");
  const addColBtn = document.getElementById("addColBtn");
  const remRowBtn = document.getElementById("remRowBtn");
  const remColBtn = document.getElementById("remColBtn");
  const undoBtn = document.getElementById("undoBtn");
  const cleanEmptyBtn = document.getElementById("cleanEmptyBtn");

  const processingModal = document.getElementById("processingModal");
  const progressFill = document.getElementById("progressFill");
  const progressPercent = document.getElementById("progressPercent");
  const modalStatusTitle = document.getElementById("modalStatusTitle");
  const modalStatusDetail = document.getElementById("modalStatusDetail");

  // --- 1. Single File & Folder Upload Handlers ---
  selectSingleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    singlePdfInput.click();
  });

  selectFolderBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    folderPdfInput.click();
  });

  // Default click on dropzone opens single file picker
  dropZone.addEventListener("click", () => singlePdfInput.click());

  singlePdfInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) handleFileSelection(e.target.files, false);
  });

  folderPdfInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) handleFileSelection(e.target.files, true);
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));

  // Supports dropping either a single PDF or an entire folder
  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const files = [];
      let isFolder = false;

      async function traverseEntry(entry) {
        if (entry.isFile) {
          const file = await new Promise((resolve) => entry.file(resolve));
          files.push(file);
        } else if (entry.isDirectory) {
          isFolder = true;
          const reader = entry.createReader();
          const entries = await new Promise((resolve) => reader.readEntries(resolve));
          for (const child of entries) {
            await traverseEntry(child);
          }
        }
      }

      for (const item of items) {
        const entry = item.webkitGetAsEntry();
        if (entry) await traverseEntry(entry);
      }

      handleFileSelection(files, isFolder);
    } else if (e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files, e.dataTransfer.files.length > 1);
    }
  });

  function handleFileSelection(fileList, isFolder) {
    const pdfs = Array.from(fileList).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );

    if (pdfs.length === 0) {
      alert("No valid PDF files found.");
      return;
    }

    currentFiles = pdfs;
    const totalMB = (pdfs.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(2);

    if (isFolder || pdfs.length > 1) {
      const folderName = pdfs[0].webkitRelativePath
        ? pdfs[0].webkitRelativePath.split("/")[0]
        : "Selected Folder";
      fileName.textContent = `${folderName} (${pdfs.length} PDFs)`;
      fileSize.textContent = `${totalMB} MB Total • Batch Mode`;
    } else {
      fileName.textContent = pdfs[0].name;
      fileSize.textContent = `${totalMB} MB • Single PDF`;
    }

    dropZone.classList.add("hidden");
    fileMetaCard.classList.remove("hidden");
    processPdfBtn.disabled = false;
  }

  removeFileBtn.addEventListener("click", () => {
    currentFiles = [];
    singlePdfInput.value = "";
    folderPdfInput.value = "";
    dropZone.classList.remove("hidden");
    fileMetaCard.classList.add("hidden");
    processPdfBtn.disabled = true;
    resetWorkspace();
  });

  function resetWorkspace() {
    extractedTables = [];
    filteredTableIndices = [];
    activeTableIndex = -1;

    docSelect.innerHTML = '<option value="ALL">All Documents (Collective)</option>';
    docSelect.disabled = true;
    tableSelect.innerHTML = "<option>No document processed yet</option>";
    tableSelect.disabled = true;

    editableDataTable.classList.add("hidden");
    tablePlaceholder.classList.remove("hidden");

    exportCurrentBtn.disabled = true;
    exportDocBtn.disabled = true;
    exportAllMergedBtn.disabled = true;
    exportAllZipBtn.disabled = true;

    addRowBtn.disabled = true;
    remRowBtn.disabled = true;
    addColBtn.disabled = true;
    remColBtn.disabled = true;
    undoBtn.disabled = true;
    cleanEmptyBtn.disabled = true;
    tableSearchInput.disabled = true;
    rowCountText.textContent = "0 rows, 0 columns";
  }

  // --- 2. Process PDFs via Backend ---
  processPdfBtn.addEventListener("click", () => {
    if (currentFiles.length === 0) return;

    processingModal.classList.remove("hidden");
    updateProgress(25, "Uploading Files...", `Sending ${currentFiles.length} PDF(s) to server...`);

    const formData = new FormData();
    currentFiles.forEach((file) => formData.append("pdfs", file));
    formData.append("engineMode", document.getElementById("engineModeSelect").value);
    formData.append("ocrLanguage", document.getElementById("ocrLanguageSelect").value);
    formData.append("chkDeskew", document.getElementById("chkDeskew").checked);
    formData.append("pageRange", document.getElementById("pageRangeInput").value);
    formData.append("customColumns", document.getElementById("customColumnsInput").value);

    updateProgress(55, "Extracting Tables...", "Running layout & OCR extraction...");

    fetch("/api/extract", {
      method: "POST",
      body: formData
    })
      .then((res) => {
        if (!res.ok) return res.json().then((err) => { throw new Error(err.error || "Extraction failed"); });
        return res.json();
      })
      .then((data) => {
        updateProgress(100, "Complete!", "Building interactive workspace...");
        setTimeout(() => {
          processingModal.classList.add("hidden");
          extractedTables = data.tables || [];

          if (extractedTables.length === 0) {
            alert("No tables detected. Try switching the Recognition Engine Mode.");
            resetWorkspace();
            return;
          }

          populateDocumentDropdown();
          applyDocumentFilter("ALL");
        }, 400);
      })
      .catch((err) => {
        processingModal.classList.add("hidden");
        alert("Error: " + err.message);
      });
  });

  function updateProgress(percent, title, detail) {
    progressFill.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    modalStatusTitle.textContent = title;
    modalStatusDetail.textContent = detail;
  }

  // --- 3. Separate vs. Collective Viewing ---
  function populateDocumentDropdown() {
    const uniqueDocs = [...new Set(extractedTables.map((t) => t.sourceFile))];
    docSelect.innerHTML = `<option value="ALL">All Documents (${uniqueDocs.length} files, ${extractedTables.length} tables)</option>`;

    uniqueDocs.forEach((docName) => {
      const count = extractedTables.filter((t) => t.sourceFile === docName).length;
      const opt = document.createElement("option");
      opt.value = docName;
      opt.textContent = `${docName} (${count} table${count > 1 ? "s" : ""})`;
      docSelect.appendChild(opt);
    });

    docSelect.disabled = false;
  }

  function applyDocumentFilter(selectedDoc) {
    filteredTableIndices = [];
    tableSelect.innerHTML = "";

    extractedTables.forEach((tbl, globalIdx) => {
      if (selectedDoc === "ALL" || tbl.sourceFile === selectedDoc) {
        filteredTableIndices.push(globalIdx);
        const opt = document.createElement("option");
        opt.value = globalIdx;
        opt.textContent = selectedDoc === "ALL" ? `[${tbl.sourceFile}] ${tbl.name}` : tbl.name;
        tableSelect.appendChild(opt);
      }
    });

    tableSelect.disabled = false;
    // Enable Document CSV button only when viewing a single specific document
    exportDocBtn.disabled = selectedDoc === "ALL";

    if (filteredTableIndices.length > 0) {
      renderActiveTable(filteredTableIndices[0]);
    }
  }

  docSelect.addEventListener("change", (e) => {
    applyDocumentFilter(e.target.value);
  });

  tableSelect.addEventListener("change", (e) => {
    renderActiveTable(parseInt(e.target.value, 10));
  });

  function renderActiveTable(globalIndex) {
    activeTableIndex = globalIndex;
    const tableObj = extractedTables[globalIndex];
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
      th.addEventListener("click", () => { selectedColIndex = colIdx; });
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
        td.addEventListener("click", () => {
          selectedRowIndex = r;
          selectedColIndex = c;
        });
        td.addEventListener("input", (e) => {
          extractedTables[activeTableIndex].data[r][c] = e.target.textContent;
        });
        tr.appendChild(td);
      });
      tableBody.appendChild(tr);
    }

    tablePlaceholder.classList.add("hidden");
    editableDataTable.classList.remove("hidden");

    exportCurrentBtn.disabled = false;
    exportAllMergedBtn.disabled = false;
    exportAllZipBtn.disabled = false;
    addRowBtn.disabled = false;
    remRowBtn.disabled = false;
    addColBtn.disabled = false;
    remColBtn.disabled = false;
    undoBtn.disabled = false;
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

  // --- 4. Table Editing Tools (Add/Remove/Undo/Clean/Search) ---
  addRowBtn.addEventListener("click", () => {
    const data = extractedTables[activeTableIndex].data;
    const newRow = new Array(data[0].length).fill("New Value");
    data.push(newRow);
    undoStack.push({ type: "addRow", tableIndex: activeTableIndex, rowIndex: data.length - 1 });
    renderActiveTable(activeTableIndex);
  });

  remRowBtn.addEventListener("click", () => {
    if (selectedRowIndex <= 0) return alert("Click inside a data row first.");
    const data = extractedTables[activeTableIndex].data;
    undoStack.push({ type: "removeRow", tableIndex: activeTableIndex, rowIndex: selectedRowIndex, rowData: [...data[selectedRowIndex]] });
    data.splice(selectedRowIndex, 1);
    selectedRowIndex = -1;
    renderActiveTable(activeTableIndex);
  });

  addColBtn.addEventListener("click", () => {
    const data = extractedTables[activeTableIndex].data;
    data[0].push("New Column");
    for (let r = 1; r < data.length; r++) data[r].push("");
    undoStack.push({ type: "addCol", tableIndex: activeTableIndex, colIndex: data[0].length - 1 });
    renderActiveTable(activeTableIndex);
  });

  remColBtn.addEventListener("click", () => {
    if (selectedColIndex < 0) return alert("Click a column header or cell first.");
    const data = extractedTables[activeTableIndex].data;
    undoStack.push({ type: "removeCol", tableIndex: activeTableIndex, colIndex: selectedColIndex, columnData: data.map((r) => r[selectedColIndex]) });
    data.forEach((row) => row.splice(selectedColIndex, 1));
    selectedColIndex = -1;
    renderActiveTable(activeTableIndex);
  });

  undoBtn.addEventListener("click", () => {
    const action = undoStack.pop();
    if (!action) return alert("Nothing to undo.");
    const data = extractedTables[action.tableIndex].data;
    if (action.type === "addRow") data.splice(action.rowIndex, 1);
    if (action.type === "removeRow") data.splice(action.rowIndex, 0, action.rowData);
    if (action.type === "addCol") data.forEach((r) => r.splice(action.colIndex, 1));
    if (action.type === "removeCol") data.forEach((r, idx) => r.splice(action.colIndex, 0, action.columnData[idx]));
    renderActiveTable(activeTableIndex);
  });

  cleanEmptyBtn.addEventListener("click", () => {
    const data = extractedTables[activeTableIndex].data;
    extractedTables[activeTableIndex].data = [data[0], ...data.slice(1).filter((r) => r.some((c) => c.trim() !== ""))];
    renderActiveTable(activeTableIndex);
  });

  tableSearchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    tableBody.querySelectorAll("tr").forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(query) ? "" : "none";
    });
  });

  // --- 5. Separate & Collective Export Functions ---
  function matrixToCSV(matrix) {
    return matrix
      .map((row) => row.map((cell) => `"${("" + cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function downloadCSV(csvContent, filename) {
    downloadBlob(new Blob([csvContent], { type: "text/csv;charset=utf-8;" }), filename);
  }

  function sanitize(str) {
    return str.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  }

  // Export 1: Single Currently Viewed Table (Separate)
  exportCurrentBtn.addEventListener("click", () => {
    const tbl = extractedTables[activeTableIndex];
    if (!tbl) return;
    const filePrefix = sanitize(tbl.sourceFile.replace(/\.pdf$/i, ""));
    const tableSuffix = sanitize(tbl.name);
    downloadCSV(matrixToCSV(tbl.data), `${filePrefix}_${tableSuffix}.csv`);
  });

  // Export 2: All Tables for Selected Document combined into one CSV (Separate Document)
  exportDocBtn.addEventListener("click", () => {
    const selectedDoc = docSelect.value;
    if (selectedDoc === "ALL") return;

    const docTables = extractedTables.filter((t) => t.sourceFile === selectedDoc);
    const combinedCSV = docTables
      .map((tbl) => `"--- ${tbl.name} ---"\n` + matrixToCSV(tbl.data))
      .join("\n\n");

    const filePrefix = sanitize(selectedDoc.replace(/\.pdf$/i, ""));
    downloadCSV(combinedCSV, `${filePrefix}_all_tables.csv`);
  });

  // Export 3: Collective Merged CSV across ALL documents (includes Source File & Table columns)
  exportAllMergedBtn.addEventListener("click", () => {
    const mergedRows = [];
    extractedTables.forEach((tbl, idx) => {
      tbl.data.forEach((row, rIdx) => {
        if (rIdx === 0) {
          // Include header row once at the top
          if (idx === 0) mergedRows.push(["Source File", "Table Name", ...row]);
        } else {
          mergedRows.push([tbl.sourceFile, tbl.name, ...row]);
        }
      });
    });

    downloadCSV(matrixToCSV(mergedRows), "collective_all_documents_merged.csv");
  });

  // Export 4: Collective ZIP organized into subfolders per PDF
  exportAllZipBtn.addEventListener("click", () => {
    if (typeof JSZip === "undefined") return alert("ZIP library failed to load.");
    const zip = new JSZip();

    extractedTables.forEach((tbl) => {
      const folderName = sanitize(tbl.sourceFile.replace(/\.pdf$/i, ""));
      const csvFilename = `${sanitize(tbl.name)}.csv`;
      zip.folder(folderName).file(csvFilename, matrixToCSV(tbl.data));
    });

    zip.generateAsync({ type: "blob" }).then((content) => {
      downloadBlob(content, "extracted_tables_by_document.zip");
    });
  });
});

/* ==========================================================================
   🥛 MILK TRACKER CONTROLLER LOGIC
   Vanilla JS, Zero Dependencies, IndexedDB + localStorage Redundant Storage,
   Year-wise File Backup/Restore, and Batch-based 2-3 Months Data Pruning.
   ========================================================================== */

// Constants
const DB_NAME = 'MilkTrackerDB';
const DB_VERSION = 1;
const STORE_NAME = 'settings';

// ==========================================================================
// 📦 INDEXEDDB STORAGE WRAPPER
// ==========================================================================
const IndexedDBHelper = {
    db: null,

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = (e) => {
                console.error("IndexedDB error:", e);
                reject(e);
            };
            
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    },

    get(key) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject("Database not initialized");
                return;
            }
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);
            
            request.onsuccess = (e) => {
                resolve(e.target.result);
            };
            
            request.onerror = (e) => {
                reject(e);
            };
        });
    },

    set(key, value) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject("Database not initialized");
                return;
            }
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(value, key);
            
            request.onsuccess = (e) => {
                resolve();
            };
            
            request.onerror = (e) => {
                reject(e);
            };
        });
    }
};

// ==========================================================================
// 🥛 MILK TRACKER MANAGER
// ==========================================================================
const MilkTracker = {
    // Default application state
    db: {
        version: 1,
        lastUpdated: new Date().toISOString(),
        settings: {
            defaultLitres: 1.5,
            pricePerLitre: 75.0
        },
        entries: {} // Format: "YYYY-MM-DD": { litres: 1.5, cost: 112.5, lastModified: "ISOString" }
    },
    
    currentMonth: new Date(), // Selected month in navigation
    selectedDateStr: null,    // Date active in the modal
    modalLitres: 1.5,         // Litres active in the modal stepper
    
    // UI Elements cache
    el: {},

    async init() {
        this.cacheElements();
        
        // Initialize storage layer
        try {
            await IndexedDBHelper.init();
            await this.loadDb();
            await this.checkAndRequestPersistence();
        } catch (e) {
            console.error("IndexedDB load failed. Falling back to localStorage:", e);
            this.loadDbFromLocalStorage();
        }

        // Configure default values from state into Settings UI inputs
        this.el.cfgDefaultLitres.value = this.db.settings.defaultLitres || 1.5;
        this.el.cfgRatePerLitre.value = this.db.settings.pricePerLitre || 75;

        // Perform initial retention prune (2-3 months threshold)
        this.pruneOldData(true); // silent on load

        // Load Year Dropdowns & Render Dashboard
        this.updateYearDropdowns();
        this.renderDashboard();
        
        // Bind UI Event Listeners
        this.bindEvents();
    },

    cacheElements() {
        this.el = {
            storageBadge: document.getElementById('storage-badge'),
            storageIcon: document.getElementById('storage-icon'),
            storageStatusText: document.getElementById('storage-status-text'),
            
            btnPrevMonth: document.getElementById('btn-prev-month'),
            btnNextMonth: document.getElementById('btn-next-month'),
            navMonthTitle: document.getElementById('nav-month-title'),
            
            statTotalLitres: document.getElementById('stat-total-litres'),
            statRateVal: document.getElementById('stat-rate-val'),
            statTotalCost: document.getElementById('stat-total-cost'),
            
            calendarGrid: document.getElementById('calendar-grid'),
            btnQuickLog: document.getElementById('btn-quick-log'),
            
            cfgDefaultLitres: document.getElementById('cfg-default-litres'),
            cfgRatePerLitre: document.getElementById('cfg-rate-per-litre'),
            
            backupYearSelect: document.getElementById('backup-year-select'),
            btnExportBackup: document.getElementById('btn-export-backup'),
            btnImportTrigger: document.getElementById('btn-import-trigger'),
            importFileInput: document.getElementById('import-file-input'),
            backupStatusLog: document.getElementById('backup-status-log'),
            
            retentionInfoMonths: document.getElementById('retention-info-months'),
            retentionInfoOldest: document.getElementById('retention-info-oldest'),
            
            // Modal Dialog Elements
            modalOverlay: document.getElementById('modal-overlay'),
            modalTitle: document.getElementById('modal-title'),
            modalClose: document.getElementById('modal-close'),
            modalDatePickerRow: document.getElementById('modal-date-picker-row'),
            modalDateInput: document.getElementById('modal-date-input'),
            btnStepMinus: document.getElementById('btn-step-minus'),
            btnStepPlus: document.getElementById('btn-step-plus'),
            stepperValue: document.getElementById('stepper-value'),
            previewLitres: document.getElementById('preview-litres'),
            previewRate: document.getElementById('preview-rate'),
            previewTotalCost: document.getElementById('preview-total-cost'),
            btnModalDelete: document.getElementById('btn-modal-delete'),
            btnModalCancel: document.getElementById('btn-modal-cancel'),
            btnModalSave: document.getElementById('btn-modal-save'),
            
            // Toast Notification
            toastContainer: document.getElementById('toast-container'),
            toastTitle: document.getElementById('toast-title'),
            toastBody: document.getElementById('toast-body'),
            toastClose: document.getElementById('toast-close'),
            toastActionBtn: document.getElementById('toast-action-btn')
        };
    },

    bindEvents() {
        // Month Navigation
        this.el.btnPrevMonth.addEventListener('click', () => this.changeMonth(-1));
        this.el.btnNextMonth.addEventListener('click', () => this.changeMonth(1));

        // Floating Quick Log Date Trigger
        this.el.btnQuickLog.addEventListener('click', () => this.openLogModal());

        // Configuration Pref Inputs
        this.el.cfgDefaultLitres.addEventListener('change', () => this.updatePreferences());
        this.el.cfgRatePerLitre.addEventListener('change', () => this.updatePreferences());

        // Backup Actions
        this.el.btnExportBackup.addEventListener('click', () => this.exportBackup());
        
        this.el.btnImportTrigger.addEventListener('click', () => this.el.importFileInput.click());
        this.el.importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.importBackup(file);
            this.el.importFileInput.value = ''; // Reset input selection
        });

        // Modal Action Handlers
        this.el.modalClose.addEventListener('click', () => this.closeLogModal());
        this.el.btnModalCancel.addEventListener('click', () => this.closeLogModal());
        this.el.btnModalDelete.addEventListener('click', () => this.deleteEntry());
        this.el.btnModalSave.addEventListener('click', () => this.saveEntry());
        
        // Stepper Buttons
        this.el.btnStepMinus.addEventListener('click', () => this.adjustStepper(-0.25));
        this.el.btnStepPlus.addEventListener('click', () => this.adjustStepper(0.25));
        
        // Toast Closing
        this.el.toastClose.addEventListener('click', () => this.hideToast());
        this.el.toastActionBtn.addEventListener('click', () => {
            this.hideToast();
            this.exportBackup();
        });
    },

    // ==========================================================================
    // 💾 STATE LOAD / WRITE UTILITIES
    // ==========================================================================
    async loadDb() {
        try {
            const data = await IndexedDBHelper.get('db_state');
            if (data) {
                this.db = data;
                this.sanitizeDbStructure();
                return;
            }
        } catch (e) {
            console.error("IndexedDB read error:", e);
        }

        // Migrate from localStorage if IndexDB is empty
        this.loadDbFromLocalStorage();
    },

    loadDbFromLocalStorage() {
        const stored = localStorage.getItem('milk_tracker_db_state');
        if (stored) {
            try {
                this.db = JSON.parse(stored);
                this.sanitizeDbStructure();
                // Merge migration into IndexedDB asynchronously
                IndexedDBHelper.set('db_state', this.db).catch(err => {
                    console.error("Failed migrating local storage to IndexedDB:", err);
                });
            } catch (e) {
                console.error("Local storage corruption error:", e);
            }
        }
    },

    sanitizeDbStructure() {
        if (!this.db || typeof this.db !== 'object') {
            this.db = {};
        }
        if (!this.db.settings) {
            this.db.settings = { defaultLitres: 1.5, pricePerLitre: 75.0 };
        }
        if (!this.db.entries || typeof this.db.entries !== 'object') {
            this.db.entries = {};
        }
    },

    saveDb() {
        this.db.lastUpdated = new Date().toISOString();
        
        // Write to primary IndexedDB asynchronously
        IndexedDBHelper.set('db_state', this.db).catch(err => {
            console.error("IndexedDB save failure:", err);
        });

        // Mirror redundant double-write in localStorage
        try {
            localStorage.setItem('milk_tracker_db_state', JSON.stringify(this.db));
        } catch (e) {
            console.error("LocalStorage write failure:", e);
        }
    },

    async checkAndRequestPersistence() {
        let isPersisted = false;
        
        // Check if already persisted
        if (navigator.storage && navigator.storage.persisted) {
            isPersisted = await navigator.storage.persisted();
        }
        
        // Request persistence if not granted
        if (!isPersisted && navigator.storage && navigator.storage.persist) {
            isPersisted = await navigator.storage.persist();
        }
        
        // Update storage locked status
        if (isPersisted) {
            this.el.storageStatusText.innerText = "Storage: Locked (Permanent)";
            this.el.storageIcon.innerText = "🔒";
            this.el.storageBadge.classList.add('persisted');
            this.el.storageBadge.title = "Your data is locked. The browser will never delete it under low storage pressure.";
        } else {
            this.el.storageStatusText.innerText = "Storage: Temporary";
            this.el.storageIcon.innerText = "🔓";
            this.el.storageBadge.classList.remove('persisted');
            this.el.storageBadge.title = "Temporary storage. The browser may delete your data if your device space runs extremely low.";
        }
    },

    // ==========================================================================
    // ⚙️ CONFIGURATION SETTINGS HANDLER
    // ==========================================================================
    updatePreferences() {
        const defaultLitres = parseFloat(this.el.cfgDefaultLitres.value);
        const ratePerLitre = parseFloat(this.el.cfgRatePerLitre.value);

        if (!isNaN(defaultLitres) && defaultLitres >= 0) {
            this.db.settings.defaultLitres = defaultLitres;
        }
        if (!isNaN(ratePerLitre) && ratePerLitre >= 0) {
            this.db.settings.pricePerLitre = ratePerLitre;
        }

        this.saveDb();
        
        // Redraw page values
        this.renderDashboard();
    },

    // ==========================================================================
    // 📅 CALENDAR RENDERING ENGINE
    // ==========================================================================
    changeMonth(direction) {
        // Increment/Decrement Month
        this.currentMonth.setMonth(this.currentMonth.getMonth() + direction);
        this.renderDashboard();
    },

    renderDashboard() {
        const year = this.currentMonth.getFullYear();
        const month = this.currentMonth.getMonth(); // 0-11

        // 1. Render Header Month Label
        const monthNames = [
            "January", "February", "March", "April", "May", "June", 
            "July", "August", "September", "October", "November", "December"
        ];
        this.el.navMonthTitle.innerText = `${monthNames[month]} ${year}`;

        // 2. Set Active Rate Metric
        const currentRate = this.db.settings.pricePerLitre || 75.0;
        this.el.statRateVal.innerText = currentRate.toFixed(2);

        // 3. Render Calendar Grid cells
        this.el.calendarGrid.innerHTML = '';
        
        // Days details
        const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun, 1 = Mon ...
        const totalDays = new Date(year, month + 1, 0).getDate(); // Total days in selected month
        const prevMonthTotalDays = new Date(year, month, 0).getDate();

        // Filler days from previous month
        for (let i = firstDayIndex; i > 0; i--) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'day-cell empty-day';
            this.el.calendarGrid.appendChild(emptyCell);
        }

        // Active days of the month
        let monthlyVolume = 0;
        let monthlyCost = 0;
        const today = new Date();
        const isCurrentYearAndMonth = (today.getFullYear() === year && today.getMonth() === month);

        for (let day = 1; day <= totalDays; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const entry = this.db.entries[dateStr];
            
            const cell = document.createElement('div');
            cell.className = 'day-cell';
            
            // Check if cell is the actual calendar Today
            if (isCurrentYearAndMonth && today.getDate() === day) {
                cell.classList.add('today');
            }

            const dayNum = document.createElement('span');
            dayNum.className = 'day-num';
            dayNum.innerText = day;
            cell.appendChild(dayNum);

            if (entry) {
                cell.classList.add('has-data');
                
                // Add Litre Indicator
                const litresLabel = document.createElement('span');
                litresLabel.className = 'day-litres';
                litresLabel.innerText = `${entry.litres.toFixed(2)}L`;
                cell.appendChild(litresLabel);

                // Add Cost Label
                const costLabel = document.createElement('span');
                costLabel.className = 'day-cost';
                costLabel.innerText = `₹${entry.cost.toFixed(2)}`;
                cell.appendChild(costLabel);

                // Accumulate totals
                monthlyVolume += entry.litres;
                monthlyCost += entry.cost;
            } else {
                cell.classList.add('no-data');
                
                // Invisible placeholder for visual spacing when hovering
                const litresLabel = document.createElement('span');
                litresLabel.className = 'day-litres';
                litresLabel.innerText = '-';
                cell.appendChild(litresLabel);
            }

            // Click interaction triggers edit modal
            cell.addEventListener('click', () => {
                this.openLogModal(dateStr);
            });

            this.el.calendarGrid.appendChild(cell);
        }

        // Update Stats Summary UI Cards
        this.el.statTotalLitres.innerText = monthlyVolume.toFixed(2);
        this.el.statTotalCost.innerText = monthlyCost.toFixed(2);

        // Update Data Retention Panel metrics
        this.updateRetentionMetadata();
    },

    // ==========================================================================
    // ✍️ ENTRY MODAL & STEPPER ENGINE
    // ==========================================================================
    openLogModal(dateStr = null) {
        // If dateStr is omitted, we assume "floating quick log for specific date"
        if (!dateStr) {
            // Default to today in YYYY-MM-DD
            const now = new Date();
            dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            this.el.modalDatePickerRow.style.display = 'flex'; // allow date picking
        } else {
            this.el.modalDatePickerRow.style.display = 'none'; // hide date picker
        }

        this.selectedDateStr = dateStr;
        this.el.modalDateInput.value = dateStr;

        // Retrieve existing records or default value
        const entry = this.db.entries[dateStr];
        if (entry) {
            this.modalLitres = entry.litres;
            this.el.modalTitle.innerText = "Edit Milk Entry";
            this.el.btnModalDelete.style.display = 'inline-block';
        } else {
            this.modalLitres = this.db.settings.defaultLitres || 1.5;
            this.el.modalTitle.innerText = "Log Milk Entry";
            this.el.btnModalDelete.style.display = 'none';
        }

        // Setup the stepper views
        this.updateStepperDisplay();

        // Show Modal dialog
        this.el.modalOverlay.classList.add('active');
    },

    closeLogModal() {
        this.el.modalOverlay.classList.remove('active');
        this.selectedDateStr = null;
    },

    adjustStepper(amount) {
        this.modalLitres = Math.max(0, this.modalLitres + amount);
        this.updateStepperDisplay();
    },

    updateStepperDisplay() {
        // Clean values to 2 decimal points
        const valStr = this.modalLitres.toFixed(2);
        this.el.stepperValue.innerText = valStr;
        this.el.previewLitres.innerText = valStr;

        const rate = this.db.settings.pricePerLitre || 75.0;
        this.el.previewRate.innerText = rate.toFixed(2);

        const cost = this.modalLitres * rate;
        this.el.previewTotalCost.innerText = cost.toFixed(2);
    },

    saveEntry() {
        // Capture selected date (if datepicker row was visible)
        if (this.el.modalDatePickerRow.style.display === 'flex') {
            this.selectedDateStr = this.el.modalDateInput.value;
        }

        if (!this.selectedDateStr) {
            alert("Please pick a valid date.");
            return;
        }

        const litres = this.modalLitres;
        const rate = this.db.settings.pricePerLitre || 75.0;
        const cost = litres * rate;

        // Save record state
        this.db.entries[this.selectedDateStr] = {
            litres: litres,
            cost: cost,
            lastModified: new Date().toISOString()
        };

        this.saveDb();
        
        // Execute dynamic data pruning (keeps only last 2-3 months)
        this.pruneOldData();

        this.renderDashboard();
        this.closeLogModal();
    },

    deleteEntry() {
        if (!this.selectedDateStr) return;
        
        if (confirm(`Are you sure you want to delete the milk entry for ${this.selectedDateStr}?`)) {
            delete this.db.entries[this.selectedDateStr];
            
            this.saveDb();
            this.renderDashboard();
            this.closeLogModal();
        }
    },

    // ==========================================================================
    // 📤 YEAR-WISE BACKUP & RESTORE
    // ==========================================================================
    updateYearDropdowns() {
        // Collect years present in database entries, current year, plus helper boundary years
        const yearsSet = new Set();
        const currentYear = new Date().getFullYear();
        
        yearsSet.add(currentYear);
        yearsSet.add(currentYear - 1);
        yearsSet.add(currentYear + 1);

        Object.keys(this.db.entries).forEach(dateKey => {
            const match = dateKey.match(/^(\d{4})-\d{2}-\d{2}$/);
            if (match) {
                yearsSet.add(parseInt(match[1]));
            }
        });

        // Convert to sorted array descending
        const yearsArray = Array.from(yearsSet).sort((a, b) => b - a);

        // Populate dropdown
        this.el.backupYearSelect.innerHTML = '';
        yearsArray.forEach(year => {
            const opt = document.createElement('option');
            opt.value = year;
            opt.innerText = year;
            this.el.backupYearSelect.appendChild(opt);
        });
    },

    exportBackup() {
        const year = parseInt(this.el.backupYearSelect.value);
        if (isNaN(year)) {
            this.showBackupLog("Please select a valid year.", true);
            return;
        }

        // Filter entries corresponding to selected year
        const exportedEntries = {};
        let count = 0;
        
        Object.keys(this.db.entries).forEach(key => {
            if (key.startsWith(`${year}-`)) {
                exportedEntries[key] = this.db.entries[key];
                count++;
            }
        });

        if (count === 0) {
            this.showBackupLog(`No active milk records found for Year ${year}.`, true);
            return;
        }

        // Structure year-specific backup packet
        const backupData = {
            backupYear: year,
            exportedAt: new Date().toISOString(),
            settings: this.db.settings,
            entries: exportedEntries
        };

        const jsonStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const filename = `milk_tracker_backup_${year}.json`;

        // Download trigger
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        this.showBackupLog(`Backup file exported successfully (${count} entries).`, false);
    },

    importBackup(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                
                // Basic validation
                if (!imported || typeof imported !== 'object' || !imported.entries) {
                    throw new Error("Invalid backup file format.");
                }

                const importedKeys = Object.keys(imported.entries);
                if (importedKeys.length === 0) {
                    this.showBackupLog("Empty backup entries object.", true);
                    return;
                }

                let mergeCount = 0;
                let skipCount = 0;

                // Merge entries
                importedKeys.forEach(dateStr => {
                    const localEntry = this.db.entries[dateStr];
                    const importedEntry = imported.entries[dateStr];
                    
                    if (localEntry) {
                        // Conflict resolution: compare timestamp or volume
                        const localTime = localEntry.lastModified ? new Date(localEntry.lastModified).getTime() : 0;
                        const importedTime = importedEntry.lastModified ? new Date(importedEntry.lastModified).getTime() : 0;
                        
                        if (importedTime > localTime) {
                            this.db.entries[dateStr] = importedEntry;
                            mergeCount++;
                        } else if (importedTime === localTime && importedEntry.litres > localEntry.litres) {
                            this.db.entries[dateStr] = importedEntry;
                            mergeCount++;
                        } else {
                            skipCount++;
                        }
                    } else {
                        // New key insertion
                        this.db.entries[dateStr] = importedEntry;
                        mergeCount++;
                    }
                });

                // Save combined states
                this.saveDb();
                
                // Re-run prune checking
                this.pruneOldData();
                
                // Redraw UI
                this.updateYearDropdowns();
                this.renderDashboard();
                
                this.showBackupLog(`Imported ${mergeCount} records successfully (skipped ${skipCount}).`, false);
            } catch (err) {
                console.error("Backup restore failed:", err);
                this.showBackupLog("Error: Invalid JSON backup file structure.", true);
            }
        };

        reader.readAsText(file);
    },

    showBackupLog(msg, isError = false) {
        const log = this.el.backupStatusLog;
        log.innerText = msg;
        log.style.opacity = '1';
        if (isError) {
            log.classList.add('error');
        } else {
            log.classList.remove('error');
        }

        // Fade status log after 4 seconds
        setTimeout(() => {
            log.style.opacity = '0';
        }, 4000);
    },

    // ==========================================================================
    // 🧹 AUTOMATIC RETENTION PRUNING ENGINE (2-3 Months Rule)
    // ==========================================================================
    pruneOldData(silent = false) {
        // Collect all distinct calendar months present in entries (Format: "YYYY-MM")
        const monthsSet = new Set();
        Object.keys(this.db.entries).forEach(dateKey => {
            const match = dateKey.match(/^(\d{4}-\d{2})-\d{2}$/);
            if (match) {
                monthsSet.add(match[1]);
            }
        });

        // Convert to sorted list of months ascending
        const sortedMonths = Array.from(monthsSet).sort();
        
        // If data spans 4 or more distinct calendar months, trigger pruning
        if (sortedMonths.length >= 4) {
            // Cutoff month: keep only the newest month, plus the 2 preceding calendar months.
            // That means we keep last 3 sortedMonths. Anything older than the 3rd newest month is deleted.
            const keptMonths = sortedMonths.slice(-3); // e.g. ["2026-06", "2026-07", "2026-08"]
            const cutoffMonthStr = keptMonths[0];      // e.g. "2026-06"
            const cutoffDateBoundary = `${cutoffMonthStr}-01`; // "2026-06-01"

            let deletedCount = 0;
            const yearsToAlert = new Set();

            Object.keys(this.db.entries).forEach(dateKey => {
                if (dateKey < cutoffDateBoundary) {
                    // Collect the year for user backing up guidelines
                    const match = dateKey.match(/^(\d{4})-\d{2}-\d{2}$/);
                    if (match) yearsToAlert.add(match[1]);
                    
                    delete this.db.entries[dateKey];
                    deletedCount++;
                }
            });

            if (deletedCount > 0) {
                this.saveDb();
                
                // Trigger warning alert notification (Toast) unless loaded initially silent
                if (!silent) {
                    const cutoffLabel = this.getMonthLabelFromDateStr(cutoffDateBoundary);
                    const alertYear = Array.from(yearsToAlert).join('/');
                    
                    this.showToast(
                        "🧹 Clean-up Complete",
                        `Older logs prior to ${cutoffLabel} were pruned to keep storage size optimized. Please backup Year ${alertYear} if you wish to archive history permanently.`,
                        alertYear
                    );
                }
            }
        }
    },

    getMonthLabelFromDateStr(dateStr) {
        const parts = dateStr.split('-');
        if (parts.length < 2) return dateStr;
        const year = parts[0];
        const monthIndex = parseInt(parts[1]) - 1;
        const monthNames = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
        ];
        return `${monthNames[monthIndex]} ${year}`;
    },

    updateRetentionMetadata() {
        // Find months actively stored
        const monthsSet = new Set();
        let oldestKey = null;
        
        Object.keys(this.db.entries).sort().forEach(dateKey => {
            if (!oldestKey) oldestKey = dateKey;
            const match = dateKey.match(/^(\d{4}-\d{2})-\d{2}$/);
            if (match) monthsSet.add(match[1]);
        });

        // Update UI info
        if (monthsSet.size === 0) {
            this.el.retentionInfoMonths.innerText = "Active Window: Empty database";
            this.el.retentionInfoOldest.innerText = "Oldest Entry: None";
            return;
        }

        // Active range display
        const sortedMonths = Array.from(monthsSet).sort();
        const startMonthLabel = this.getMonthLabelFromDateStr(`${sortedMonths[0]}-01`);
        const endMonthLabel = this.getMonthLabelFromDateStr(`${sortedMonths[sortedMonths.length - 1]}-01`);
        
        this.el.retentionInfoMonths.innerText = `Active Window: ${startMonthLabel} to ${endMonthLabel}`;
        
        if (oldestKey) {
            this.el.retentionInfoOldest.innerText = `Oldest Entry: ${oldestKey}`;
        }
    },

    // ==========================================================================
    // 🔔 TOAST FLOATING BANNER NOTIFIER
    // ==========================================================================
    showToast(title, message, backupYear = null) {
        this.el.toastTitle.innerText = title;
        this.el.toastBody.innerText = message;

        if (backupYear) {
            this.el.toastActionBtn.style.display = 'inline-block';
            this.el.toastActionBtn.innerText = `📤 Export Backup Year ${backupYear}`;
            this.el.backupYearSelect.value = backupYear; // default select to that year
        } else {
            this.el.toastActionBtn.style.display = 'none';
        }

        this.el.toastContainer.classList.add('active');

        // Automatically hide notification toast after 10 seconds
        setTimeout(() => {
            this.hideToast();
        }, 10000);
    },

    hideToast() {
        this.el.toastContainer.classList.remove('active');
    }
};

// Start application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    MilkTracker.init();
});

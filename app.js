/* ==========================================================================
   🥛 MILK TRACKER CONTROLLER LOGIC
   Vanilla JS, Zero Dependencies, IndexedDB + localStorage Redundant Storage,
   Year-wise File Backup/Restore, and Batch-based 2-3 Months Data Pruning.
   ========================================================================== */

// Constants
const DB_NAME = 'MilkTrackerDB';
const DB_VERSION = 1;
const STORE_NAME = 'settings';
const APP_VERSION = '1.0.6';

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
];

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
    modalRate: null,          // Rate active in the modal stepper
    recalcYear: null,         // Target year in recalculate modal
    recalcMonthIndex: null,   // Target month in recalculate modal
    recalcTotalLitres: 0,     // Total litres for recalculate preview
    recalcCurrentCost: 0,     // Current cost for recalculate preview
    
    // UI Elements cache
    el: {},

    async init() {
        await this.checkForUpdates();
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

        // Auto-populate current month if empty
        this.autoPopulateCurrentMonthIfNeeded();

        // Perform initial retention prune (2-3 months threshold)
        this.pruneOldData(true); // silent on load

        // Load Year Dropdowns, Month Dropdowns & Render Dashboard
        this.updateYearDropdowns();
        this.updateMonthDropdowns();
        this.renderDashboard();
        
        // Bind UI Event Listeners
        this.bindEvents();
    },

    cacheElements() {
        this.el = {
            // Tab Switch Elements
            tabBtnLedger: document.getElementById('tab-btn-ledger'),
            tabBtnSettings: document.getElementById('tab-btn-settings'),
            ledgerScreen: document.getElementById('ledger-screen'),
            settingsScreen: document.getElementById('settings-screen'),

            storageBadge: document.getElementById('storage-badge'),
            storageIcon: document.getElementById('storage-icon'),
            storageStatusText: document.getElementById('storage-status-text'),
            
            btnPrevMonth: document.getElementById('btn-prev-month'),
            btnNextMonth: document.getElementById('btn-next-month'),
            navMonthTitle: document.getElementById('nav-month-title'),
            
            statTotalLitres: document.getElementById('stat-total-litres'),
            statTotalCost: document.getElementById('stat-total-cost'),
            statCardCost: document.getElementById('stat-card-cost'),
            
            calendarGrid: document.getElementById('calendar-grid'),
            btnAutoPopulate: document.getElementById('btn-auto-populate'),
            btnQuickLog: document.getElementById('btn-quick-log'),
            btnRecalculateMonth: document.getElementById('btn-recalculate-month'),
            
            cfgDefaultLitres: document.getElementById('cfg-default-litres'),
            cfgRatePerLitre: document.getElementById('cfg-rate-per-litre'),
            
            recalcMonthSelect: document.getElementById('recalc-month-select'),
            recalcMonthRate: document.getElementById('recalc-month-rate'),
            btnRecalcMonthSettings: document.getElementById('btn-recalc-month-settings'),
            recalcStatusLog: document.getElementById('recalc-status-log'),
            
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
            
            // Recalculate Modal Dialog Elements
            recalcModalOverlay: document.getElementById('recalc-modal-overlay'),
            recalcModalTitle: document.getElementById('recalc-modal-title'),
            recalcModalClose: document.getElementById('recalc-modal-close'),
            recalcTargetMonthLabel: document.getElementById('recalc-target-month-label'),
            recalcModalDaysCount: document.getElementById('recalc-modal-days-count'),
            recalcModalTotalLitres: document.getElementById('recalc-modal-total-litres'),
            recalcModalCurrentCost: document.getElementById('recalc-modal-current-cost'),
            recalcModalRateInput: document.getElementById('recalc-modal-rate-input'),
            recalcPreviewEquation: document.getElementById('recalc-preview-equation'),
            recalcPreviewNewCost: document.getElementById('recalc-preview-new-cost'),
            recalcPreviewDiff: document.getElementById('recalc-preview-diff'),
            recalcUpdateSettingsDefault: document.getElementById('recalc-update-settings-default'),
            btnRecalcCancel: document.getElementById('btn-recalc-cancel'),
            btnRecalcConfirm: document.getElementById('btn-recalc-confirm'),

            // Toast Notification
            toastContainer: document.getElementById('toast-container'),
            toastTitle: document.getElementById('toast-title'),
            toastBody: document.getElementById('toast-body'),
            toastClose: document.getElementById('toast-close'),
            toastActionBtn: document.getElementById('toast-action-btn')
        };
    },

    bindEvents() {
        // Tab Switch triggers
        this.el.tabBtnLedger.addEventListener('click', () => this.switchTab('ledger'));
        this.el.tabBtnSettings.addEventListener('click', () => this.switchTab('settings'));

        // Month Navigation
        this.el.btnPrevMonth.addEventListener('click', () => this.changeMonth(-1));
        this.el.btnNextMonth.addEventListener('click', () => this.changeMonth(1));

        // Auto Populate Month Trigger
        this.el.btnAutoPopulate.addEventListener('click', () => {
            const activeYear = this.currentMonth.getFullYear();
            const activeMonth = this.currentMonth.getMonth();
            const defLitres = this.db.settings.defaultLitres || 1.5;
            if (confirm(`Are you sure you want to populate all dates in this month with the default ${defLitres.toFixed(2)}L?`)) {
                this.populateMonth(activeYear, activeMonth);
                this.renderDashboard();
            }
        });

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
        
        // Modal Date change handler
        if (this.el.modalDateInput) {
            this.el.modalDateInput.addEventListener('change', () => {
                const newDateStr = this.el.modalDateInput.value;
                if (newDateStr) {
                    this.selectedDateStr = newDateStr;
                    this.modalRate = this.getRateForDate(newDateStr);
                    this.updateStepperDisplay();
                }
            });
        }

        // Recalculate Month Action Triggers
        if (this.el.btnRecalculateMonth) {
            this.el.btnRecalculateMonth.addEventListener('click', () => {
                this.openRecalculateModal(this.currentMonth.getFullYear(), this.currentMonth.getMonth());
            });
        }
        if (this.el.statCardCost) {
            this.el.statCardCost.addEventListener('click', () => {
                const year = this.currentMonth.getFullYear();
                const month = this.currentMonth.getMonth();
                const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
                const hasEntries = Object.keys(this.db.entries).some(k => k.startsWith(prefix));
                if (hasEntries) {
                    this.openRecalculateModal(year, month);
                }
            });
        }

        // Settings Bulk Recalculate Triggers
        if (this.el.recalcMonthSelect) {
            this.el.recalcMonthSelect.addEventListener('change', () => this.syncRecalcSettingsRate());
        }
        if (this.el.btnRecalcMonthSettings) {
            this.el.btnRecalcMonthSettings.addEventListener('click', () => {
                const val = this.el.recalcMonthSelect.value;
                if (!val) {
                    this.showRecalcSettingsLog("Please select a month.", true);
                    return;
                }
                const [yStr, mNumStr] = val.split('-');
                const y = parseInt(yStr);
                const m = parseInt(mNumStr) - 1;
                const rate = parseFloat(this.el.recalcMonthRate.value);
                this.openRecalculateModal(y, m, isNaN(rate) ? null : rate);
            });
        }

        // Recalculate Modal Handlers
        if (this.el.recalcModalClose) {
            this.el.recalcModalClose.addEventListener('click', () => this.closeRecalculateModal());
        }
        if (this.el.btnRecalcCancel) {
            this.el.btnRecalcCancel.addEventListener('click', () => this.closeRecalculateModal());
        }
        if (this.el.btnRecalcConfirm) {
            this.el.btnRecalcConfirm.addEventListener('click', () => this.confirmRecalculate());
        }
        if (this.el.recalcModalRateInput) {
            this.el.recalcModalRateInput.addEventListener('input', () => this.updateRecalcPreview());
        }

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
    // 🔄 AUTO-UPDATE & CACHE BUSTING CHECK
    // ==========================================================================
    async checkForUpdates() {
        // 1. Immediately strip cache-busting version query parameters from the address bar
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('v')) {
            const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
        }

        // 2. Check server for new version (bypassing CDN / browser cache)
        try {
            const response = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                if (data && data.version && data.version !== APP_VERSION) {
                    console.log(`New version detected: ${data.version}. Reloading browser to bypass cache...`);
                    const url = new URL(window.location.href);
                    url.searchParams.set('v', data.version);
                    window.location.replace(url.toString());
                }
            }
        } catch (e) {
            console.warn("Failed to check for updates:", e);
        }
    },

    // ==========================================================================
    // 🎛️ TAB SWITCH ENGINE
    // ==========================================================================
    switchTab(tabName) {
        if (tabName === 'ledger') {
            this.el.tabBtnLedger.classList.add('active');
            this.el.tabBtnSettings.classList.remove('active');
            this.el.ledgerScreen.classList.add('active');
            this.el.settingsScreen.classList.remove('active');
            
            // Re-render calendar metrics to catch default changes
            this.renderDashboard();
        } else {
            this.el.tabBtnLedger.classList.remove('active');
            this.el.tabBtnSettings.classList.add('active');
            this.el.ledgerScreen.classList.remove('active');
            this.el.settingsScreen.classList.add('active');
            
            // Refresh month dropdowns and rates in settings
            this.updateMonthDropdowns();
            this.syncRecalcSettingsRate();
        }
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
            this.el.storageStatusText.innerText = "Locked (Permanent)";
            this.el.storageIcon.innerText = "🔒";
            this.el.storageBadge.classList.add('persisted');
            this.el.storageBadge.title = "Your data is locked. The browser will never delete it under low storage pressure.";
        } else {
            this.el.storageStatusText.innerText = "Temporary";
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
        this.updateMonthDropdowns();
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
        this.el.navMonthTitle.innerText = `${MONTH_NAMES[month]} ${year}`;

        // 2. Render Calendar Grid cells
        this.el.calendarGrid.innerHTML = '';
        
        // Days details
        const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun, 1 = Mon ...
        const totalDays = new Date(year, month + 1, 0).getDate(); // Total days in selected month

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

        // Toggle the auto-populate button and recalculate button based on whether month has records
        const activePrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
        const hasAnyEntries = Object.keys(this.db.entries).some(key => key.startsWith(activePrefix));
        
        if (!hasAnyEntries) {
            const defLitres = this.db.settings.defaultLitres || 1.5;
            this.el.btnAutoPopulate.innerText = `⚡ Auto-Populate Month (${defLitres.toFixed(2)}L)`;
            this.el.btnAutoPopulate.style.display = 'block';
            if (this.el.btnRecalculateMonth) {
                this.el.btnRecalculateMonth.style.display = 'none';
            }
        } else {
            this.el.btnAutoPopulate.style.display = 'none';
            if (this.el.btnRecalculateMonth) {
                this.el.btnRecalculateMonth.style.display = 'block';
            }
        }

        // Update Data Retention Panel metrics
        this.updateRetentionMetadata();
    },

    // ==========================================================================
    // ✍️ ENTRY MODAL & STEPPER ENGINE
    // ==========================================================================
    getRateForDate(dateStr) {
        if (!dateStr) return this.db.settings.pricePerLitre || 75.0;
        const entry = this.db.entries[dateStr];
        if (entry) {
            if (entry.rate) return entry.rate;
            if (entry.litres > 0 && entry.cost > 0) {
                return Math.round((entry.cost / entry.litres) * 100) / 100;
            }
        }
        // Check other entries in the same month
        const monthPrefix = dateStr.substring(0, 7) + '-';
        for (const [k, v] of Object.entries(this.db.entries)) {
            if (k.startsWith(monthPrefix)) {
                if (v.rate) return v.rate;
                if (v.litres > 0 && v.cost > 0) {
                    return Math.round((v.cost / v.litres) * 100) / 100;
                }
            }
        }
        return this.db.settings.pricePerLitre || 75.0;
    },

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
        this.modalRate = this.getRateForDate(dateStr);

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

        const rate = (this.modalRate !== null && this.modalRate !== undefined) ? this.modalRate : (this.db.settings.pricePerLitre || 75.0);
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
        const rate = (this.modalRate !== null && this.modalRate !== undefined) ? this.modalRate : (this.db.settings.pricePerLitre || 75.0);
        const cost = parseFloat((litres * rate).toFixed(2));

        // Save record state
        this.db.entries[this.selectedDateStr] = {
            litres: litres,
            rate: rate,
            cost: cost,
            lastModified: new Date().toISOString()
        };

        this.saveDb();
        
        // Execute dynamic data pruning (keeps only last 2-3 months)
        this.pruneOldData();

        this.renderDashboard();
        this.updateMonthDropdowns();
        this.updateYearDropdowns();
        this.closeLogModal();
    },

    deleteEntry() {
        if (!this.selectedDateStr) return;
        
        if (confirm(`Are you sure you want to delete the milk entry for ${this.selectedDateStr}?`)) {
            delete this.db.entries[this.selectedDateStr];
            
            this.saveDb();
            this.renderDashboard();
            this.updateMonthDropdowns();
            this.updateYearDropdowns();
            this.closeLogModal();
        }
    },

    // ==========================================================================
    // 🔄 BULK MONTH PRICE RECALCULATION ENGINE
    // ==========================================================================
    openRecalculateModal(year, monthIndex, prefillRate = null) {
        this.recalcYear = year;
        this.recalcMonthIndex = monthIndex;

        const monthStr = String(monthIndex + 1).padStart(2, '0');
        const monthPrefix = `${year}-${monthStr}-`;
        
        let daysCount = 0;
        let totalLitres = 0;
        let currentCost = 0;
        let effectiveRate = null;

        Object.keys(this.db.entries).forEach(dateKey => {
            if (dateKey.startsWith(monthPrefix)) {
                const entry = this.db.entries[dateKey];
                daysCount++;
                totalLitres += entry.litres || 0;
                currentCost += entry.cost || 0;
                if (effectiveRate === null) {
                    if (entry.rate) effectiveRate = entry.rate;
                    else if (entry.litres > 0 && entry.cost > 0) effectiveRate = Math.round((entry.cost / entry.litres) * 100) / 100;
                }
            }
        });

        if (daysCount === 0) {
            alert(`No logged entries found for ${MONTH_NAMES[monthIndex]} ${year}.`);
            return;
        }

        const monthTitle = `${MONTH_NAMES[monthIndex]} ${year}`;
        this.el.recalcTargetMonthLabel.innerText = monthTitle;
        this.el.recalcModalDaysCount.innerText = daysCount;
        this.el.recalcModalTotalLitres.innerText = totalLitres.toFixed(2);
        this.el.recalcModalCurrentCost.innerText = currentCost.toFixed(2);
        
        this.recalcTotalLitres = totalLitres;
        this.recalcCurrentCost = currentCost;

        // Rate to pre-fill
        const initialRate = prefillRate !== null ? prefillRate : (effectiveRate !== null ? effectiveRate : (this.db.settings.pricePerLitre || 75.0));
        this.el.recalcModalRateInput.value = initialRate;
        this.el.recalcUpdateSettingsDefault.checked = false;

        this.updateRecalcPreview();

        this.el.recalcModalOverlay.classList.add('active');
    },

    closeRecalculateModal() {
        this.el.recalcModalOverlay.classList.remove('active');
        this.recalcYear = null;
        this.recalcMonthIndex = null;
    },

    updateRecalcPreview() {
        const rate = parseFloat(this.el.recalcModalRateInput.value) || 0;
        const totalLitres = this.recalcTotalLitres || 0;
        const currentCost = this.recalcCurrentCost || 0;
        const newTotal = totalLitres * rate;

        this.el.recalcPreviewEquation.innerHTML = `${totalLitres.toFixed(2)} Ltr &times; ₹${rate.toFixed(2)}`;
        this.el.recalcPreviewNewCost.innerText = newTotal.toFixed(2);

        const diff = newTotal - currentCost;
        if (Math.abs(diff) < 0.01) {
            this.el.recalcPreviewDiff.innerText = "No difference from current monthly total";
            this.el.recalcPreviewDiff.style.color = "var(--clr-text-muted)";
        } else if (diff > 0) {
            this.el.recalcPreviewDiff.innerText = `+₹${diff.toFixed(2)} compared to current total`;
            this.el.recalcPreviewDiff.style.color = "var(--clr-accent)";
        } else {
            this.el.recalcPreviewDiff.innerText = `-₹${Math.abs(diff).toFixed(2)} compared to current total`;
            this.el.recalcPreviewDiff.style.color = "var(--clr-success)";
        }
    },

    confirmRecalculate() {
        const rate = parseFloat(this.el.recalcModalRateInput.value);
        if (isNaN(rate) || rate < 0) {
            alert("Please enter a valid rate per litre.");
            return;
        }

        const updateSettingsDefault = this.el.recalcUpdateSettingsDefault.checked;
        const result = this.recalculateMonthPrice(this.recalcYear, this.recalcMonthIndex, rate, updateSettingsDefault);

        if (result.success) {
            const monthTitle = `${MONTH_NAMES[this.recalcMonthIndex]} ${this.recalcYear}`;
            this.closeRecalculateModal();

            this.showToast(
                "💰 Recalculation Complete",
                `Recalculated ${result.count} days for ${monthTitle} at ₹${rate.toFixed(2)}/L. New Monthly Total: ₹${result.totalCost.toFixed(2)}.`
            );

            this.showRecalcSettingsLog(`Recalculated ${result.count} days for ${monthTitle} at ₹${rate.toFixed(2)}/L (Total: ₹${result.totalCost.toFixed(2)}).`, false);
        } else {
            alert(result.message);
        }
    },

    recalculateMonthPrice(year, monthIndex, newRate, updateSettingsDefault = false) {
        if (isNaN(newRate) || newRate < 0) {
            return { success: false, message: "Please enter a valid rate per litre." };
        }

        const monthStr = String(monthIndex + 1).padStart(2, '0');
        const monthPrefix = `${year}-${monthStr}-`;
        const timestamp = new Date().toISOString();
        
        let count = 0;
        let totalLitres = 0;
        let totalCost = 0;

        Object.keys(this.db.entries).forEach(dateKey => {
            if (dateKey.startsWith(monthPrefix)) {
                const entry = this.db.entries[dateKey];
                const litres = entry.litres || 0;
                const cost = parseFloat((litres * newRate).toFixed(2));
                
                this.db.entries[dateKey] = {
                    ...entry,
                    litres: litres,
                    rate: newRate,
                    cost: cost,
                    lastModified: timestamp
                };

                count++;
                totalLitres += litres;
                totalCost += cost;
            }
        });

        if (count === 0) {
            return { success: false, message: "No logged entries found for this month." };
        }

        if (updateSettingsDefault) {
            this.db.settings.pricePerLitre = newRate;
            if (this.el.cfgRatePerLitre) {
                this.el.cfgRatePerLitre.value = newRate;
            }
        }

        this.saveDb();
        this.renderDashboard();
        this.updateMonthDropdowns();
        this.updateYearDropdowns();

        return {
            success: true,
            count: count,
            totalLitres: totalLitres,
            totalCost: totalCost,
            newRate: newRate
        };
    },

    updateMonthDropdowns() {
        if (!this.el.recalcMonthSelect) return;

        const monthsSet = new Set();
        Object.keys(this.db.entries).forEach(dateKey => {
            const match = dateKey.match(/^(\d{4}-\d{2})-\d{2}$/);
            if (match) {
                monthsSet.add(match[1]);
            }
        });

        const sortedMonths = Array.from(monthsSet).sort().reverse(); // descending
        this.el.recalcMonthSelect.innerHTML = '';

        if (sortedMonths.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.innerText = 'No logged months found';
            this.el.recalcMonthSelect.appendChild(opt);
            if (this.el.btnRecalcMonthSettings) {
                this.el.btnRecalcMonthSettings.disabled = true;
            }
            return;
        }

        if (this.el.btnRecalcMonthSettings) {
            this.el.btnRecalcMonthSettings.disabled = false;
        }

        sortedMonths.forEach(mStr => {
            const [yStr, mNumStr] = mStr.split('-');
            const mIndex = parseInt(mNumStr) - 1;
            const y = parseInt(yStr);
            
            let count = 0;
            const prefix = `${mStr}-`;
            Object.keys(this.db.entries).forEach(k => {
                if (k.startsWith(prefix)) count++;
            });

            const opt = document.createElement('option');
            opt.value = mStr;
            opt.innerText = `${MONTH_NAMES[mIndex]} ${y} (${count} ${count === 1 ? 'day' : 'days'})`;
            this.el.recalcMonthSelect.appendChild(opt);
        });

        // Set default to current ledger month if available
        const currentMonthStr = `${this.currentMonth.getFullYear()}-${String(this.currentMonth.getMonth() + 1).padStart(2, '0')}`;
        if (monthsSet.has(currentMonthStr)) {
            this.el.recalcMonthSelect.value = currentMonthStr;
        }

        this.syncRecalcSettingsRate();
    },

    syncRecalcSettingsRate() {
        if (!this.el.recalcMonthSelect || !this.el.recalcMonthRate) return;
        const selectedMonthStr = this.el.recalcMonthSelect.value;
        if (!selectedMonthStr) return;

        const prefix = `${selectedMonthStr}-`;
        let effectiveRate = null;
        for (const [k, v] of Object.entries(this.db.entries)) {
            if (k.startsWith(prefix)) {
                if (v.rate) {
                    effectiveRate = v.rate;
                    break;
                } else if (v.litres > 0 && v.cost > 0) {
                    effectiveRate = Math.round((v.cost / v.litres) * 100) / 100;
                    break;
                }
            }
        }
        this.el.recalcMonthRate.value = effectiveRate !== null ? effectiveRate : (this.db.settings.pricePerLitre || 75.0);
    },

    showRecalcSettingsLog(msg, isError = false) {
        if (!this.el.recalcStatusLog) return;
        const log = this.el.recalcStatusLog;
        log.innerText = msg;
        log.style.opacity = '1';
        if (isError) {
            log.classList.add('error');
        } else {
            log.classList.remove('error');
        }

        setTimeout(() => {
            log.style.opacity = '0';
        }, 5000);
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

        // Default the selected dropdown value to the current year
        this.el.backupYearSelect.value = currentYear;
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
                this.updateMonthDropdowns();
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
    // ⚡ AUTO-POPULATION LOGIC
    // ==========================================================================
    autoPopulateCurrentMonthIfNeeded() {
        const today = new Date();
        const year = today.getFullYear();
        const monthIndex = today.getMonth();
        const activePrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}-`;
        
        const hasAnyEntries = Object.keys(this.db.entries).some(key => key.startsWith(activePrefix));
        if (!hasAnyEntries) {
            console.log("Auto-populating current month on load...");
            this.populateMonth(year, monthIndex);
        }
    },

    populateMonth(year, monthIndex) {
        const totalDays = new Date(year, monthIndex + 1, 0).getDate();
        const defaultLitres = this.db.settings.defaultLitres || 1.5;
        const rate = this.db.settings.pricePerLitre || 75.0;
        const cost = parseFloat((defaultLitres * rate).toFixed(2));
        const timestamp = new Date().toISOString();

        for (let day = 1; day <= totalDays; day++) {
            const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            this.db.entries[dateStr] = {
                litres: defaultLitres,
                rate: rate,
                cost: cost,
                lastModified: timestamp
            };
        }
        
        this.saveDb();
        this.updateMonthDropdowns();
        this.updateYearDropdowns();
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
            this.el.retentionInfoOldest.innerText = "Oldest Log: None";
            return;
        }

        // Active range display
        const sortedMonths = Array.from(monthsSet).sort();
        const startMonthLabel = this.getMonthLabelFromDateStr(`${sortedMonths[0]}-01`);
        const endMonthLabel = this.getMonthLabelFromDateStr(`${sortedMonths[sortedMonths.length - 1]}-01`);
        
        this.el.retentionInfoMonths.innerText = `Active Window: ${startMonthLabel} to ${endMonthLabel}`;
        
        if (oldestKey) {
            this.el.retentionInfoOldest.innerText = `Oldest Log: ${oldestKey}`;
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

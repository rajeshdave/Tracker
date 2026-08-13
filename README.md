# 🥛 Monthly Milk Tracker

An interactive, responsive, and lightweight single-page web application to log and calculate monthly milk deliveries, track costs, prune historical data automatically, and archive logs year-wise.

Designed with a premium organic theme, optimized for mobile and desktop screens.

---

## 🚀 How to Run the App

Since this is built with standard web technologies (HTML, CSS, and Vanilla JavaScript) with **zero dependencies**, you don't need to install anything!

1.  Locate the project folder on your machine.
2.  Double-click **`index.html`** to open it instantly in any modern web browser (Google Chrome, Safari, Firefox, or Microsoft Edge).
3.  Alternatively, run a simple local web server in this directory:
    ```bash
    # Using Python
    python3 -m http.server 8000
    
    # Then open http://localhost:8000 in your browser
    ```

---

## ✨ Features & Functionality

*   **📅 Monthly Calendar Grid & Auto-Population**:
    *   Displays days of the currently selected month.
    *   **Auto-Setup on Launch**: Automatically populates all days of the current calendar month with the default litre amount (e.g., `1.5L`) if the database is completely empty for this month.
    *   **⚡ Single-Click Month Fill**: If you navigate to any empty month (e.g., a future month), a button appears under the calendar allowing you to populate all dates with your default litres in one tap.
    *   Highlights days containing logged records with a custom indicator (showing quantity in litres and the computed day price).
    *   Unrecorded cells display a dotted border and a quick-add `+` indicator on hover.
*   **⚖️ Live Stepper & Editor**:
    *   Clicking any day cell opens the recording modal.
    *   Features a quick stepper (`-` and `+` buttons) to adjust litres (increments by `0.25L` or `0.5L`).
    *   Live calculation preview updates instantly as you adjust values (`Litres * Rate`).
    *   Allows logging/updating entries for any selected date using an integrated date selector.
*   **📈 Dynamic Metrics Banner**:
    *   Auto-calculates total milk volume (in Litres) for the active calendar month.
    *   Auto-calculates the final monthly bill amount based on the active rate.
*   **⚙️ Custom Preferences**:
    *   Default litre logging amount (e.g. `1.5L`) is configurable in the settings panel.
    *   Base rate per litre (default `₹75`) can be modified at any time to dynamically update costs.
*   **📤 Year-wise Backup & Restore**:
    *   Select a year and download a dedicated JSON data archive (e.g. `milk_tracker_backup_2026.json`).
    *   Import a JSON backup to merge entries. Conflict resolution automatically retains newer changes (via modification timestamps) and larger volumes.
*   **🧹 Rolling Retention (2–3 Months Limit)**:
    *   Keeps database size tiny by retaining a maximum of 3 calendar months of records.
    *   Trunes older data in batches as soon as a 4th calendar month is registered in the active database.
    *   Displays a warning banner (Toast) with a quick-export link when data pruning completes.

---

## 🔒 Storage & Persistence Architecture

To guarantee maximum reliability and keep logs secure across browser crashes or refreshes:

1.  **IndexedDB (Primary Database)**:
    *   Stores the database state in a key-value style under the database name `MilkTrackerDB` and object store name `settings`.
2.  **LocalStorage (Redundant Sync)**:
    *   Every save action writes the stringified state to `localStorage.setItem('milk_tracker_db_state', JSON.stringify(db))`.
    *   Serves as an automatic backup fallback if IndexedDB is blocked or fails.
3.  **Storage Persistence API**:
    *   The app executes `navigator.storage.persist()` on launch to request permanent storage locking, preventing mobile operating systems from clearing the browser data under low disk space.

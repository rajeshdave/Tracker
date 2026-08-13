# 🤖 Gemini Project Documentation: Monthly Milk Tracker

This project was designed and implemented by **Gemini** to create a highly optimized, premium single-page web application for tracking daily milk deliveries, managing billing costs, and backing up data.

---

## 📋 Project Summary

*   **Project Name**: Monthly Milk Tracker
*   **Creator**: Gemini (Model: Gemini 3.5 Flash)
*   **Development Stack**: HTML5, CSS3, Vanilla JavaScript (Zero external assets or dependencies)
*   **Deployment Target**: GitHub Pages (Static hosting)

---

## 🎨 Design & Accessibility Features

During the planning and development phase, the application was engineered to prioritize speed, simplicity, and premium aesthetic details:

1.  **Fluid Calendar Ledger Dashboard & Auto-Setup**:
    *   Responsive 7-column layout that shifts automatically for desktop and mobile displays.
    *   Day blocks display recorded milk volume (e.g., `1.50L`) and computed daily costs (e.g., `₹112.50`) for clear readability.
    *   Active/Today cell is highlighted with a circular primary badge.
    *   Unrecorded cells display a dotted border and a quick-add hover interface to simplify entry addition.
    *   **Startup Auto-Setup**: If the current calendar month contains no entries on app launch, the script automatically populates all days of that month with the default litre volume to streamline tracking.
    *   **⚡ Single-Click Month Fill**: When navigating to any empty month (e.g., a future month), a button appears below the calendar enabling the user to populate the entire month with their default configuration in one click.
2.  **Litre Stepper Input**:
    *   Avoids keyboard inputs on mobile by introducing large, high-contrast subtraction `-` and addition `+` adjustment keys.
    *   Quantity values step by `0.25L` or `0.5L`, ensuring simple configuration.
    *   Live equations update automatically under the stepper to show calculations (`Litres × Price = Total`) before saving.
3.  **Configurable Base Rates**:
    *   Rather than hardcoding the 75 Rupees per litre rate, the app loads with a configurable input box.
    *   Adjusting the preference settings dynamically updates the database defaults and recalculates all current month totals.

---

## 📁 File Structure

The workspace contains clean, modular files with zero library overhead:

*   **[`index.html`](file:///home/rajeshkumardave/Rajesh/codebase_other/tracker/index.html)**: Defines the semantic layouts, metrics summary grid, preference controls, log modals, and floating toast notifications.
*   **[`styles.css`](file:///home/rajeshkumardave/Rajesh/codebase_other/tracker/styles.css)**: Implements CSS Custom Properties (design tokens), full media-query overrides, transition effects, and clean custom styling for scrollbars/steppers.
*   **[`app.js`](file:///home/rajeshkumardave/Rajesh/codebase_other/tracker/app.js)**: Runs the application state, calendar logic, IndexedDB database helpers, file fileReader backups, and the data garbage collector.
*   **[`README.md`](file:///home/rajeshkumardave/Rajesh/codebase_other/tracker/README.md)**: Contains quickstart instructions to double-click and run the game on a laptop.

---

## 🔒 Storage Architecture & Redundancy

To ensure complete durability against browser restarts, private browser constraints, or OS cleanups, a three-tier storage system was built:

```
[User Action: Save Entry] 
        │
        ├──> [1. Write to IndexedDB] (Primary: High capacity, persistent)
        │
        ├──> [2. Write to LocalStorage] (Secondary Redundancy fallback)
        │
        └──> [3. Verify via Storage Persistence API] (Locks cache against OS purging)
```

1.  **Primary IndexedDB**:
    *   Uses browser database `MilkTrackerDB`, store `settings`, and key `db_state` to read/write JSON logs.
2.  **Fallback LocalStorage**:
    *   Replicates all data into `localStorage.setItem('milk_tracker_db_state', JSON.stringify(db))`.
    *   If private windows block IndexedDB, the app loads from localStorage without throwing crashes.
3.  **Persistence Locking**:
    *   Runs `navigator.storage.persist()` on init. If accepted by the browser, storage is flagged as "Permanent", preventing the OS from wiping the databases on low memory.

---

## 📤 Year-Wise Backup & Merging

To keep files small and support neat archiving, backup operations are organized by calendar year:

*   **Export**: Gathers all database entries, filters by key prefix matching the chosen year (e.g. `2026-`), and outputs a dedicated JSON file (e.g., `milk_tracker_backup_2026.json`).
*   **Import/Restore**: Imports the JSON file and merges data keys with a non-destructive timestamp merge strategy:
    ```javascript
    const localTime = localEntry.lastModified ? new Date(localEntry.lastModified).getTime() : 0;
    const importedTime = importedEntry.lastModified ? new Date(importedEntry.lastModified).getTime() : 0;
    
    if (importedTime > localTime) {
        this.db.entries[dateStr] = importedEntry; // Keep newer entry
    }
    ```

---

## 🧹 Rolling 2-3 Months Retention Pruning

To maintain an optimized database, the app automatically cleans legacy logs:

*   **Cutoff Rule**: The app preserves up to 3 calendar months of records (current month $M$, plus preceding months $M-1$ and $M-2$).
*   **Batch Sweeper**: Once the user records data in a new month that spans a 4th calendar month in the database:
    *   Prunes all entries older than the first day of the 2nd preceding month relative to the newest month.
    *   Displays a slide-in warning Toast showing what was deleted, with a quick-export link: `📤 Export Backup Year [YYYY]` so users never lose history.

---

## 🔄 Mobile Cache-Busting & Auto-Reload Versioning

To bypass mobile browser caches automatically whenever new changes are pushed:

1. **Version Constants**:
   * **[`version.json`](file:///home/rajeshkumardave/Rajesh/codebase_other/tracker/version.json)**: Stores the current release version of the application on the server (e.g., `{"version": "1.0.3"}`).
   * **[`app.js`](file:///home/rajeshkumardave/Rajesh/codebase_other/tracker/app.js)**: Stores the corresponding client-side constant `const APP_VERSION = '1.0.3';`.

2. **Self-Update Mechanics**:
   * On startup, the app executes `checkForUpdates()`, fetching `version.json?t=[timestamp]` using `cache: 'no-store'` to bypass any CDN or intermediary caches.
   * If the version in `version.json` differs from `APP_VERSION`, it executes a `window.location.replace` reload appending `?v=[version]` to force-flush browser memory.
   * Immediately after reloading, the page runs `window.history.replaceState` to clean the URL, stripping the version query parameter and leaving a clean browser address bar.

3. **Workflow for Pushing Updates**:
   * Whenever you make a code change to `index.html`, `styles.css`, or `app.js`:
     1. Bump the version string in `version.json` (e.g., from `1.0.3` to `1.0.4`).
     2. Bump `APP_VERSION` in `app.js` to match (e.g., `const APP_VERSION = '1.0.4';`).
     3. Commit and push the updates.
     4. Visitor devices will automatically fetch the latest build and refresh in the background, keeping the user-facing URL completely clean.

/**
 * Coordinates spreadsheet registration, metadata lookup, and configuration properties location.
 */
class SpreadsheetRegistry {
  /**
   * Scans Google Drive to locate the BZQ Tenant Configuration sheet.
   * Checks script cache first to prevent repeated Drive API queries.
   * @returns {string|null} The configuration spreadsheet ID, or null if not found.
   */
  static resolveConfigId() {
    const cache = CacheService.getScriptCache();
    const cachedId = cache.get("bzq_config_sheet_id");
    if (cachedId) return cachedId;

    const env = PropertiesService.getScriptProperties().getProperty("BZQ_ENV") || "PROD";
    const configName = env === "PROD" ? "BZQ Core Configuration" : `BZQ Core Configuration ${env}`;

    const files = DriveApp.getFilesByName(configName);
    let selectedFile = null;
    let latestTime = 0;
    while (files.hasNext()) {
      const file = files.next();
      if (file.isTrashed()) continue;
      const modTime = file.getLastUpdated().getTime();
      if (modTime > latestTime) {
        latestTime = modTime;
        selectedFile = file;
      }
    }
    if (selectedFile) {
      const fileId = selectedFile.getId();
      cache.put("bzq_config_sheet_id", fileId, 1500); // 25 minutes
      return fileId;
    }
    return null;
  }

  /**
   * Provisions a new BZQ Configuration Spreadsheet.
   * Places the file in the designated parent folder if provided.
   * @param {string|null} parentFolderId - Optional Google Drive Folder ID.
   * @returns {string} The newly created spreadsheet ID.
   */
  static createConfigurationSpreadsheet(parentFolderId) {
    const env = PropertiesService.getScriptProperties().getProperty("BZQ_ENV") || "PROD";
    const configName = env === "PROD" ? "BZQ Core Configuration" : `BZQ Core Configuration ${env}`;
    const ss = SpreadsheetApp.create(configName);
    const ssFile = DriveApp.getFileById(ss.getId());
    
    if (parentFolderId) {
      const folder = DriveApp.getFolderById(parentFolderId);
      folder.addFile(ssFile);
      DriveApp.getRootFolder().removeFile(ssFile);
    }
    // Add default schema sheets
    const sheets = [
      "__ConfigurationProperties",
      "__SequenceConfiguration",
      "__ObjectConfiguration",
      "__LookupConfiguration",
      "__DropdownConfiguration",
      "__GlobalDropdownConfiguration",
      "__Spreadsheets"
    ];
    sheets.forEach(name => ss.insertSheet(name));
    
    // Store in cache
    CacheService.getScriptCache().put("bzq_config_sheet_id", ss.getId(), 1500);
    return ss.getId();
  }

  /**
   * Validates if a spreadsheet is registered as a managed BZQ Spoke Sheet.
   * Checks the active ID against the Object Configuration sheet.
   * @param {string} spreadsheetId - The active spreadsheet ID to inspect.
   * @returns {boolean} True if the spreadsheet is managed.
   */
  static isManagedSpreadsheet(spreadsheetId) {
    const configId = this.resolveConfigId();
    if (!configId) return false;
    
    const ss = SpreadsheetApp.openById(configId);
    const sheet = ss.getSheetByName("__Spreadsheets");
    if (!sheet) return false;
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return false;
    
    const idCol = data[0].findIndex(h => String(h).toLowerCase().includes("id"));
    const colIndex = idCol === -1 ? 0 : idCol;
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colIndex]).trim() === spreadsheetId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if a configuration sheet resides in a Shared Drive.
   * @param {string} configId - Spreadsheet ID of the configuration properties.
   * @returns {boolean} True if in a Shared Drive, false if in personal My Drive.
   */
  static isConfigInSharedDrive(configId) {
    try {
      const file = DriveApp.getFileById(configId);
      const parents = file.getParents();
      if (parents.hasNext()) {
        const parent = parents.next();
        return parent.getOwner() === null;
      }
    } catch (e) {
      // Fallback
    }
    return false;
  }

  /**
   * Provisions a spoke workbook. Clones from Template folder if missing, then checks and injects trigger boots.
   * @param {string} name - Name of the spoke workbook.
   * @param {string} parentFolderId - Folder ID where the spoke resides or should be created.
   * @returns {string} The spreadsheet ID.
   */
  static provisionSpokeWorkbook(name, parentFolderId) {
    const ssId = this.locateOrCreateSpokeFile_(name, parentFolderId);
    const scriptId = this.getBoundScriptId_(ssId);
    if (scriptId) {
      this.injectBootstrapper_(scriptId);
    }
    return ssId;
  }

  /**
   * Helper to locate or clone a spoke file from the Templates directory.
   * @param {string} name - Spoke sheet name.
   * @param {string} folderId - Target parent folder ID.
   * @returns {string} Spreadsheet ID.
   * @private
   */
  static locateOrCreateSpokeFile_(name, folderId) {
    const parentFolder = DriveApp.getFolderById(folderId);
    const files = parentFolder.getFilesByName(name);
    if (files.hasNext()) return files.next().getId();

    const configId = this.resolveConfigId();
    if (!configId) throw new Error("Config workbook not found.");
    const configParents = DriveApp.getFileById(configId).getParents();
    if (!configParents.hasNext()) throw new Error("Templates directory not resolvable.");

    const templates = configParents.next().getFoldersByName("Templates");
    if (!templates.hasNext()) throw new Error("Templates folder not found.");
    const tFiles = templates.next().getFilesByName("SpokeTemplate");
    if (!tFiles.hasNext()) throw new Error("SpokeTemplate not found.");

    const copy = tFiles.next().makeCopy(name, parentFolder);
    return copy.getId();
  }

  /**
   * Resolves the container-bound script ID of a spreadsheet using Drive search.
   * @param {string} spreadsheetId - Active spreadsheet ID.
   * @returns {string|null} Script ID, or null if no bound script container found.
   * @private
   */
  static getBoundScriptId_(spreadsheetId) {
    const query = `'${spreadsheetId}' in parents and mimeType = 'application/vnd.google-apps.script'`;
    const files = DriveApp.searchFiles(query);
    return files.hasNext() ? files.next().getId() : null;
  }

  /**
   * Injects the static triggers.js bootstrapper into the target container script.
   * Uses Google Apps Script REST API projects.updateContent.
   * @param {string} scriptId - Target Apps Script project container ID.
   * @returns {void}
   * @private
   */
  static injectBootstrapper_(scriptId) {
    const url = `https://script.googleapis.com/v1/projects/${scriptId}/content`;
    const triggerSource = "function onOpen(e) { AppsUtilities.onOpen(this); }\nfunction onEdit(e) { AppsUtilities.onEdit(e); }";
    const payload = {
      files: [
        { name: "Triggers", type: "SERVER_JS", source: triggerSource },
        { name: "appsscript", type: "JSON", source: JSON.stringify({
          timeZone: "America/New_York",
          dependencies: {
            libraries: [{
              userSymbol: "AppsUtilities",
              libraryId: "1KsqYmH746evWxO20E850u_JFcUlRZW-jQsTz5CY7m-UpriQXNa8_xYnY",
              version: "1",
              developmentMode: true
            }]
          },
          exceptionLogging: "STACKDRIVER"
        })}
      ]
    };
    UrlFetchApp.fetch(url, {
      method: "PUT",
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      contentType: "application/json",
      payload: JSON.stringify(payload)
    });
  }

  /**
   * Warm up configuration cache during the onOpen event.
   * @param {string} configId - The central configuration spreadsheet ID.
   * @returns {void}
   */
  static warmCache(configId) {
    // Warm up the configuration library cache
    AppsUtilities.configurationManager_UpdateCachedConfigValues(false);
  }

  /**
   * Helper to build a breadcrumb path for a file (e.g. Shared Drive / BZQ / Sales).
   * @param {string} fileId - The Google Drive File ID.
   * @returns {string} The formatted path string.
   */
  static getFolderPath(fileId) {
    try {
      const file = DriveApp.getFileById(fileId);
      const path = [];
      let current = file;
      let parents = current.getParents();
      while (parents.hasNext()) {
        const parent = parents.next();
        path.unshift(parent.getName());
        current = parent;
        parents = current.getParents();
      }
      return path.length > 0 ? path.join(" / ") : "My Drive";
    } catch (e) {
      return "Unknown Drive Location";
    }
  }
}

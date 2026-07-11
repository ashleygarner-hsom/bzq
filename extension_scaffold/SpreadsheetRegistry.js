/**
 * Coordinates spreadsheet registration, metadata lookup, and configuration properties location.
 */
class SpreadsheetRegistry {
  /**
   * Auto-detects the active deployment environment name (e.g. 'LOCAL_ASHLEYGARNER-HSOM') 
   * by parsing the containing script project's file name in Google Drive, falling back 
   * to checking script properties or defaulting to production. This avoids manual property 
   * setting during automated bootstrap deployments.
   * @returns {string} The active environment identifier (e.g., 'PROD' or custom environment name),
   *                  used to resolve the corresponding environment-suffixed configuration spreadsheet.
   * @private
   */
  static getEnvName_() {
    let env = PropertiesService.getScriptProperties().getProperty("BZQ_ENV");
    if (!env) {
      try {
        const name = DriveApp.getFileById(ScriptApp.getScriptId()).getName();
        const match = name.match(/\[(.*?)\]/);
        env = match ? match[1] : "PROD";
      } catch (ex) {
        console.error("Failed to auto-detect environment name from script title: " + ex.message);
        env = "PROD";
      }
    }
    return env;
  }

  /**
   * Searches the user's Google Drive for any spreadsheet containing the name 
   * 'BZQ Core Configuration' (including environment-suffixed ones) and returns
   * the ID of the most recently updated instance. This ensures automatic
   * discovery of local/dev configuration databases without manual configuration.
   * @returns {string|null} The unique Google Drive file ID of the latest configuration sheet,
   *                        or null if none found in Drive.
   * @private
   */
  static searchLatestConfigId_() {
    const query = "title contains 'BZQ Core Configuration' and " +
      "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
    const files = DriveApp.searchFiles(query);
    let latestId = null;
    let latestTime = 0;
    while (files.hasNext()) {
      const file = files.next();
      const time = file.getLastUpdated().getTime();
      if (time > latestTime) {
        latestTime = time;
        latestId = file.getId();
      }
    }
    return latestId;
  }

  /**
   * Scans Google Drive to locate the BZQ Tenant Configuration spreadsheet.
   * Resolves the configuration sheet by scanning Drive for any config spreadsheet,
   * caching the resolved file ID in the Apps Script Script Cache to prevent excessive 
   * Google Drive API search requests on subsequent executions.
   * @returns {string|null} The unique spreadsheet ID for the BZQ configuration registry, 
   *                        or null if the spreadsheet cannot be located in Drive.
   */
  static resolveConfigId() {
    const cache = CacheService.getScriptCache();
    const cachedId = cache.get("bzq_config_sheet_id");
    if (cachedId) return cachedId;

    const fileId = this.searchLatestConfigId_();
    if (fileId) {
      cache.put("bzq_config_sheet_id", fileId, 1500);
    }
    return fileId;
  }

  /**
   * Locates an untrashed file with the matching name inside a specific folder (or Root My Drive if null).
   * @param {string|null} folderId - The unique Google Drive Folder ID, or null to lookup in My Drive Root.
   *                                Used as the parent directory to constrain the search.
   * @param {string} name - The exact filename string to search for (e.g. 'BZQ Core Configuration').
   *                        Used to find files by name.
   * @returns {string|null} The unique Google Drive file ID of the matched configuration sheet, or null if not found.
   * @private
   */
  static locateConfigInFolder_(folderId, name) {
    const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
    const files = folder.getFilesByName(name);
    while (files.hasNext()) {
      const file = files.next();
      if (!file.isTrashed()) return file.getId();
    }
    return null;
  }

  /**
   * Initializes a newly created Spreadsheet with the default schema sheets.
   * @param {SpreadsheetApp.Spreadsheet} ss - The newly created Google Spreadsheet object to initialize.
   *                                          Used to insert tables.
   * @returns {void}
   * @private
   */
  static initializeSchemaSheets_(ss) {
    const sheets = [
      "__ConfigurationProperties", "__SequenceConfiguration",
      "__ObjectConfiguration", "__LookupConfiguration",
      "__DropdownConfiguration", "__GlobalDropdownConfiguration",
      "__Spreadsheets"
    ];
    sheets.forEach(name => ss.insertSheet(name));
  }

  /**
   * Provisions a new BZQ Configuration Spreadsheet or resolves an existing one in the folder.
   * Places the file in the designated parent folder if provided.
   * @param {string|null} parentFolderId - Optional Google Drive Folder ID.
   *                                       Used as the destination directory for the new sheet.
   * @returns {string} The unique spreadsheet ID of the resolved or newly provisioned BZQ configuration.
   */
  static createConfigurationSpreadsheet(parentFolderId) {
    const env = this.getEnvName_();
    const name = env === "PROD" ? "BZQ Core Configuration" : `BZQ Core Configuration ${env}`;
    const existingId = this.locateConfigInFolder_(parentFolderId, name);
    if (existingId) {
      CacheService.getScriptCache().put("bzq_config_sheet_id", existingId, 1500);
      return existingId;
    }
    const ss = SpreadsheetApp.create(name);
    const ssFile = DriveApp.getFileById(ss.getId());
    if (parentFolderId) {
      DriveApp.getFolderById(parentFolderId).addFile(ssFile);
      DriveApp.getRootFolder().removeFile(ssFile);
    }
    this.initializeSchemaSheets_(ss);
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

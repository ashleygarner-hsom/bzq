#!/usr/bin/env node

/**
 * @file seed-sheets.js
 * @description BZQ Platform - Modular Database Seeding, Compilation & Migration Utility.
 * 
 * DESIGN & EXECUTION ARCHITECTURE:
 * 1. CLI Execution Block: Parses the required target environment credentials and Google Drive folder IDs.
 *    Usage: node seed-sheets.js <env-name> <parent-id> [apps-utils-id] [forms-id] [mod-manager-id] [ext-id] [--module=Module] [--force]
 * 2. Component Scanning & Registration: Dynamically imports `Objects.js` and `Data.js` from each active Module.
 * 3. Sequenced ID Compiling: Instantiates the `GlobalRegistry` (via `buildGlobalRegistry`), generating continuous, unique sequential keys (e.g., `xSC-`, `xOC-`) for each object row using `compileRegistryRows`.
 * 4. Cross-Reference lookup translation: Translates both:
 *    - Three-segment references: `{ModuleName}.{ObjectStableId}.{SeedRecordStableId}` (e.g., `AppsUtilities.1005.1`), pointing to specific data records.
 *    - Two-segment references: `(ModuleName.)?{ObjectStableId}` (e.g., `3000`), pointing to an Object Definition itself (stored in ObjectConfiguration 1001).
 * 5. Tabular 2D Compilation: Conforming columns dynamically using the standard BZQ column prefix structure (Display formula column, Sequence ID column, and Primary Name column) inside `getTabularHeaders`.
 * 6. Google Sheets API Push: Sequentially pushes completed table matrices to corresponding Google Spoke Workbooks.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');
const crypto = require('crypto');

/**
 * Script-Level Parameters (CLI Arguments):
 * @type {string|null} envName - The target environment name identifier (e.g., "dev", "prod").
 * @type {string|null} parentId - The parent Google Drive Folder ID where all sheets are nested.
 * @type {string|null} appsUtilitiesId - Google Spreadsheet ID of the AppsUtilities workbook override.
 * @type {string|null} formsEngineId - Google Spreadsheet ID of the FormsEngine workbook override.
 * @type {string|null} moduleManagerId - Google Spreadsheet ID of the ModuleManager workbook override.
 * @type {string|null} extensionId - Chrome Extension Client OAuth Client ID.
 * @type {string|null} targetModule - Optional specific module directory scope for execution.
 * @type {boolean} force - Non-destructive dry-run override flag (if true, bypasses checks).
 */
let envName = null;
let parentId = null;
let appsUtilitiesId = null;
let formsEngineId = null;
let moduleManagerId = null;
let extensionId = null;
let targetModule = null;
let force = false;
let gcpLinked = false;
let useUserAuth = false;

process.argv.slice(2).forEach(arg => {
  if (arg.startsWith('--module=')) {
    targetModule = arg.split('=')[1];
  } else if (arg === '--force') {
    force = true;
  } else if (arg === '--gcp-linked') {
    gcpLinked = true;
  } else if (arg === '--user-auth') {
    useUserAuth = true;
  } else if (!envName) {
    envName = arg;
  } else if (!parentId) {
    parentId = arg;
  } else if (!appsUtilitiesId) {
    appsUtilitiesId = arg;
  } else if (!formsEngineId) {
    formsEngineId = arg;
  } else if (!moduleManagerId) {
    moduleManagerId = arg;
  } else if (!extensionId) {
    extensionId = arg;
  }
});

if (!envName || !parentId) {
  console.error('Usage: node seed-sheets.js <env-name> <parent-id> [apps-utils-id] [forms-id] [mod-manager-id] [ext-id] [options]');
  process.exit(1);
}


const REPO_DIR = path.join(__dirname, '..');

const SYSTEM_SHEETS = [
  'ConfigurationProperties',
  'SequenceConfiguration',
  'ObjectConfiguration',
  'LookupConfiguration',
  'DropdownConfiguration',
  'GlobalDropdownConfiguration',
  'Spreadsheets'
];

function isSystemSheet(sheetName) {
  return SYSTEM_SHEETS.includes(sheetName) || sheetName.startsWith('__');
}

/**
 * Prompts the developer in the terminal using the readline interface.
 * @param {string} query - The query question to display in the terminal.
 * @returns {Promise<string>} The user's input response.
 */
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans.trim());
  }));
}

/**
 * Performs a HTTPS request to the Google Drive/Sheets APIs.
 * @param {string} url - Request target URL.
 * @param {Object} options - HTTPS connection properties.
 * @param {Object|string|null} [postData] - JSON payload or query body.
 * @returns {Promise<Object>} Resolved response payload.
 */
/**
 * Low-level Https call wrapper.
 * @param {string} url - Target URL.
 * @param {Object} options - Request options.
 * @param {*} postData - POST payload.
 * @returns {Promise<Object>} Response metadata.
 */
function executeHttpsCall(url, options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, parsed: JSON.parse(raw || '{}'), raw }));
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'object' ? JSON.stringify(postData) : postData);
    }
    req.end();
  });
}

/**
 * Checks if status code or response indicates a rate limit or quota exceeded error.
 * @param {number} statusCode - HTTP status.
 * @param {Object} parsed - Parsed JSON response.
 * @param {string} raw - Raw body response.
 * @returns {boolean} True if rate limited.
 */
function isRateLimit(statusCode, parsed, raw) {
  if (statusCode === 429) return true;
  if (statusCode === 403) {
    const msg = parsed.error?.message || raw || '';
    return /rate limit|quota|limit exceeded/i.test(msg);
  }
  return false;
}

/**
 * Executes a request and automatically retries upon hitting Google API rate limits.
 * @param {string} url - Target URL.
 * @param {Object} options - Request options.
 * @param {Object} state - State options containing postData and attempt count.
 * @returns {Promise<Object>} Parsed response data.
 */
async function executeWithRetry(url, options, state) {
  const res = await executeHttpsCall(url, options, state.postData);
  if (res.statusCode >= 400) {
    const attempt = state.attempt || 0;
    if (isRateLimit(res.statusCode, res.parsed, res.raw) && attempt < 5) {
      const wait = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      console.warn(`⚠️ Rate limit hit. Retrying in ${Math.round(wait)}ms (attempt ${attempt + 1}/5)...`);
      await new Promise(r => setTimeout(r, wait));
      return executeWithRetry(url, options, { postData: state.postData, attempt: attempt + 1 });
    }
    throw new Error(res.parsed.error?.message || res.raw);
  }
  return res.parsed;
}

/**
 * Resilient HTTP request helper.
 * @param {string} url - Target URL.
 * @param {Object} [options] - Options list.
 * @param {*} [postData] - Data payloads.
 * @returns {Promise<Object>} Response payloads.
 */
function makeRequest(url, options = {}, postData = null) {
  return executeWithRetry(url, options, { postData, attempt: 0 });
}

/**
 * Generates an OAuth access token using a Google Cloud Service Account JSON key.
 * @param {Object} key - Service Account JSON key object.
 * @returns {Promise<string>} Access token.
 */
async function getAccessTokenFromSA(key) {
  const iat = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/script.projects',
    aud: 'https://oauth2.googleapis.com/token',
    exp: iat + 3600,
    iat
  };
  const base64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const tokenInput = `${base64Url(header)}.${base64Url(claims)}`;
  const signature = crypto.createSign('RSA-SHA256').update(tokenInput).sign(key.private_key, 'base64url');
  const postData = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${tokenInput}.${signature}`
  }).toString();
  const res = await makeRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    }
  }, postData);
  return res.access_token;
}

/**
 * Loads developer authentication configurations from local gcloud ADC or clasp.
 * @returns {{ data: Object, type: string }} Credentials JSON payload and source type.
 * @throws {Error} If no credentials credentials files can be located.
 */
/**
 * Refreshes OAuth tokens using the Google token endpoint.
 * @param {string} clientId - OAuth client ID.
 * @param {string} clientSecret - OAuth client secret.
 * @param {string} refreshToken - OAuth refresh token.
 * @returns {Promise<string>} Access token.
 */
async function refreshGoogleToken(clientId, clientSecret, refreshToken) {
  const postData = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString();
  const res = await makeRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, postData);
  return res.access_token;
}

/**
 * Throws a clean user-facing error for expired clasp credentials.
 * @param {Error} err - Error object to format.
 * @throws {Error} Cleaned reauth error message.
 */
function throwClaspReauthError(err) {
  throw new Error(`Google Session Expired (${err.message}).\n\n` +
    `❌ ERROR: Google requires user re-authentication due to session expiration.\n` +
    `Please force a fresh credentials login session by running:\n\n` +
    `   ./bzq login --force\n\n` +
    `This will renew your security policy tokens cleanly.`);
}

/**
 * Loads and refreshes Clasp user credentials.
 * @returns {Promise<string>} Clasp user OAuth access token.
 */
async function getClaspUserToken() {
  const home = process.env.HOME || process.env.USERPROFILE;
  const claspRcPath = path.join(home, '.clasprc.json');
  if (!fs.existsSync(claspRcPath)) {
    throw new Error('Missing Clasp credentials. Please run: clasp login');
  }
  const claspData = JSON.parse(fs.readFileSync(claspRcPath, 'utf8'));
  const d = claspData.tokens.default;
  try {
    return await refreshGoogleToken(d.client_id, d.client_secret, d.refresh_token);
  } catch (err) {
    if (err.message.includes('invalid_rapt') || err.message.includes('invalid_grant')) {
      throwClaspReauthError(err);
    }
    throw err;
  }
}

/**
 * Obtains an access token using the Service Account JSON key.
 * @returns {Promise<string>} Service Account OAuth access token.
 */
async function getServiceAccountToken() {
  const saPath = path.join(REPO_DIR, 'service-account.json');
  if (!fs.existsSync(saPath)) {
    throw new Error(
      'Missing Service Account credentials.\n' +
      'Please save your Service Account Key as "service-account.json" in the repository root.'
    );
  }
  const key = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  return getAccessTokenFromSA(key);
}

/**
 * Dynamic registry map representing all spreadsheets created by this run.
 * @type {Object<string, string>}
 */
const spreadsheetsRegistry = {};

/**
 * Global map tracking which spreadsheet friendly name each custom sheet belongs to.
 * @type {Object<string, string>}
 */
const sheetToSpreadsheetMap = {};

/**
 * Generates the spreadsheet title depending on environment conventions.
 * Non-production deployments automatically append the environment name suffix.
 * @param {string} baseName - Friendly spreadsheet name.
 * @param {string} env - Target environment label.
 * @returns {string} The formatted spreadsheet name.
 */
function getSpreadsheetTitle(baseName, env) {
  let base = baseName === 'Configuration' ? 'BZQ Core Configuration' : baseName;
  base = base.replace(/^xSS-\d+\s*-\s*/i, '').replace(/\s*Configuration\s*Properties$/i, '');
  const isProd = env.toUpperCase() === 'PROD' || env.toUpperCase() === 'PRODUCTION';
  return isProd ? base : `${base} ${env}`;
}

/**
 * Searches Google Drive to locate an existing spreadsheet by name and parent folder.
 * @param {string} title - The spreadsheet file name.
 * @param {string} folderId - Target Google Drive parent folder ID.
 * @param {Object} headers - Authorization headers.
 * @returns {Promise<string|null>} Resolves to file ID if found, otherwise null.
 */
async function locateExistingSpreadsheet(title, folderId, headers) {
  const escTitle = title.replace(/'/g, "\\'");
  const q = `name = '${escTitle}' and '${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true`;
  const res = await makeRequest(url, { headers });
  return res.files && res.files.length > 0 ? res.files[0].id : null;
}

/**
 * Provisions a Google Spreadsheet inside a specified target Drive folder.
 * @param {string} title - Friendly name of the spreadsheet.
 * @param {string} folderId - Target Google Drive parent folder ID.
 * @param {Object} headers - Authorization headers for Google API request.
 * @returns {Promise<string>} The provisioned spreadsheet file ID.
 */
async function createSpreadsheet(title, folderId, headers) {
  console.log(`Creating spreadsheet: "${title}"...`);
  const fileMetadata = {
    name: title,
    mimeType: 'application/vnd.google-apps.spreadsheet',
    parents: [folderId]
  };
  const file = await makeRequest('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' }
  }, fileMetadata);
  console.log(`Created spreadsheet "${title}" with ID: ${file.id}`);
  return file.id;
}

/**
 * Verifies that a specific named tab sheet exists inside a Google Spreadsheet.
 * Creates the sheet tab if it is not present in the target file.
 * @param {string} spreadsheetId - The target Google Spreadsheet file ID.
 * @param {string} sheetName - The sheet name to check or create.
 * @param {Object} headers - Connection authorization headers.
 * @returns {Promise<void>}
 */
async function ensureSheetExists(spreadsheetId, sheetName, headers) {
  const metadata = await makeRequest(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, { headers });
  const sheetExists = metadata.sheets.some(s => s.properties.title === sheetName);
  if (!sheetExists) {
    console.log(`Creating tab "${sheetName}" in spreadsheet ${spreadsheetId}...`);
    const body = { requests: [{ addSheet: { properties: { title: sheetName } } }] };
    await makeRequest(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' }
    }, body);
  }
}

/**
 * Resolves the target spreadsheet ID for a given sheet name.
 * @param {string} sheetName - Target worksheet tab name.
 * @param {Object} ctx - Options context.
 * @param {Object} seedTemplates - Loaded templates.
 * @returns {string} Target Google Spreadsheet file ID.
 */
/**
 * Resolves the target spreadsheet ID for a given sheet name.
 * @param {string} sheetName - Target worksheet tab name.
 * @param {Object} ctx - Options context.
 * @returns {string} Target Google Spreadsheet file ID.
 */
function getTargetSpreadsheetId(sheetName, ctx) {
  if (isSystemSheet(sheetName)) {
    return ctx.spreadsheets['${CONFIG_SS_ID}'];
  }
  const spokeName = sheetToSpreadsheetMap[sheetName];
  if (spokeName && spreadsheetsRegistry[spokeName]) {
    return spreadsheetsRegistry[spokeName];
  }
  return ctx.spreadsheets['${CONFIG_SS_ID}'];
}

/**
 * Removes the default 'Sheet1' tab from all created/seeded spreadsheets.
 * @param {Object} headers - Authorization headers.
 * @returns {Promise<void>}
 */
async function deleteSheet1FromAll(headers) {
  const uniqueIds = Array.from(new Set(Object.values(spreadsheetsRegistry)));
  for (const spreadsheetId of uniqueIds) {
    try {
      const metadata = await makeRequest(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, { headers });
      const sheet1 = metadata.sheets.find(s => s.properties.title === 'Sheet1');
      if (sheet1 && metadata.sheets.length > 1) {
        console.log(`Deleting default tab "Sheet1" from spreadsheet ${spreadsheetId}...`);
        const body = { requests: [{ deleteSheet: { sheetId: sheet1.properties.sheetId } }] };
        await makeRequest(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' }
        }, body);
      }
    } catch (e) {
      console.warn(`Could not delete Sheet1 from ${spreadsheetId}: ${e.message}`);
    }
  }
}

/**
 * Reads existing values from a spreadsheet tab.
 * @param {string} configId - The spreadsheet file ID.
 * @param {string} sheetName - The sheet name to read.
 * @param {Object} headers - Connection authorization headers.
 * @returns {Promise<Array<Array<*>>>} Data rows array.
 */
async function fetchSheetValues(configId, sheetName, headers) {
  try {
    const res = await makeRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${configId}/values/${encodeURIComponent(sheetName)}!A1:Z`,
      { headers }
    );
    return res.values || [];
  } catch (e) {
    return [];
  }
}

/**
 * Merges rows into a single table dictionary, ignoring duplicate headers.
 * @param {Object} merged - Main accumulative table rows database.
 * @param {string} sheetName - Target worksheet tab name.
 * @param {Array<Array<*>>} rows - Data rows to combine.
 */
function appendSeedRows(merged, sheetName, rows) {
  if (!merged[sheetName]) {
    merged[sheetName] = [];
  }
  if (merged[sheetName].length > 0 && rows.length > 0) {
    merged[sheetName].push(...rows.slice(1));
  } else {
    merged[sheetName].push(...rows);
  }
}

const vm = require('vm');

/**
 * ObjectSchema Class
 * 
 * Represents the static schema metadata definition for a platform object/table
 * within the BZQ database configuration engine.
 * 
 * This class holds the metadata configurations (like name, stable numeric ID,
 * target datasheet tab name, and module package context) defining the object's schema.
 */
class ObjectSchema {
  /**
   * Represents the static configuration schema for an object.
   * @param {Object} params - Constructor parameters.
   * @param {string} params.Name - Object name (e.g. "Sequence").
   * @param {number} params.StableId - Object stable ID (e.g. 1000).
   * @param {string} params.Datasheet - Target datasheet name (e.g. "SequenceConfiguration").
   * @param {string} [params.ModuleName] - Module name.
   */
  constructor(params) {
    this.Name = params.Name;
    this.StableId = params.StableId;
    this.Datasheet = params.Datasheet;
    this.ModuleName = params.ModuleName || '';
  }
}

/**
 * CompiledRecord Class
 * 
 * Represents a processed database row record that has been assigned a sequential sequence ID.
 * 
 * Encapsulates the assigned primary ID, a combined friendly name representation, and
 * the original tabular cell properties.
 */
class CompiledRecord {
  /**
   * Represents a compiled database record with generated sequence ID.
   * @param {string} id - Generated sequence ID (e.g. "xSC-10000").
   * @param {string} combined - Combined representation (e.g. "xSC-10000 - Sequence").
   * @param {Object<string,*>} row - A key-value map representing a single row's column headers as keys and cell contents as values.
   */
  constructor(id, combined, row) {
    this.id = id;
    this.combined = combined;
    this.row = row;
  }
}

/**
 * GlobalRegistry Class
 * 
 * Acts as the unified multi-module compiled database registry for all platform objects.
 * 
 * This class provides a centralized store for compiled records across different modules.
 * It handles the registration and retrieval of processed tables by their stable IDs, and
 * provides specialized methods to evaluate and translate dynamic relational cross-references.
 */
class GlobalRegistry {
  constructor() {
    this._store = {};
  }

  /**
   * Registers a list of CompiledRecord instances under a given ID/key.
   * @param {string} id - The ID or key.
   * @param {CompiledRecord[]} records - The compiled records array.
   */
  register(id, records) {
    this._store[String(id)] = records;
  }

  /**
   * Retrieves registered compiled records for the given ID.
   * @param {string} id - The ID or key.
   * @returns {CompiledRecord[]|null} Processed rows list or null.
   */
  get(id) {
    return this._store[String(id)] || null;
  }

  /**
   * Checks if an ID/key is registered.
   * @param {string} id - The ID or key.
   * @returns {boolean} True if registered.
   */
  has(id) {
    return !!this._store[String(id)];
  }

  /**
   * Iterates through all registered keys and records.
   * @param {function(string, CompiledRecord[]): void} callback - The iteration callback.
   */
  forEach(callback) {
    Object.keys(this._store).forEach(key => {
      callback(key, this._store[key]);
    });
  }

  /**
   * Resolves a dynamic lookup string (e.g., "AppsUtilities.1005.1") to its compiled ID or representation.
   * 
   * Regex Explanation:
   * The regex /^([a-zA-Z0-9]+)\.([0-9]+)\.(filter\(([^=]+)==\s*\"([^\"]+)\"\)|[0-9]+)$/ matches and parses:
   *   - Group 1: Module namespace prefix (e.g., "AppsUtilities" or "FormsEngine")
   *   - Group 2: Numeric stable database table identifier (e.g., "1005" or "1012")
   *   - Group 3: Suffix index ("1") or entire filter substring ("filter(FieldName == \"value\")")
   *   - Group 4: Specific filter key column name inside the filter expression ("FieldName")
   *   - Group 5: Target value string matched in the filter expression ("value")
   * 
   * @param {string|*} cellValue - The raw cell value.
   * @returns {string|*} Resolved string or original value.
   */
  /**
   * Translates a raw database cross-reference lookup cell value into its friendly compiled string representation.
   * 
   * Reference Types Handled:
   * 1. Three-Segment References (e.g., "AppsUtilities.1005.1" or "1000.1"):
   *    - Points to a specific row (index or filtered value) within a compiled datasheet.
   *    - Parsed via the primary RegExp pattern.
   * 2. Two-Segment References (e.g., "ModuleManager.3000" or "3000"):
   *    - Points to an Object Definition itself (conforming to a row in ObjectConfiguration, stable ID 1001).
   *    - Dynamically resolved using `resolveTwoSegmentLookup` when the three-segment parse fails.
   * 
   * Regex Explanation (Three-Segment Reference Pattern):
   * The regex /^([a-zA-Z0-9]+)\.([0-9]+)\.(filter\(([^=]+)==\s*\"([^\"]+)\"\)|[0-9]+)$/ matches and parses:
   *   - Group 1: Module namespace prefix (e.g., "AppsUtilities" or "FormsEngine")
   *   - Group 2: Numeric stable database table identifier (e.g., "1005" or "1012")
   *   - Group 3: Suffix index ("1") or entire filter substring ("filter(FieldName == \"value\")")
   *   - Group 4: Specific filter key column name inside the filter expression ("FieldName")
   *   - Group 5: Target value string matched in the filter expression ("value")
   * 
   * @param {string|*} cellValue - The raw cell value to translate.
   * @returns {string|*} Resolved combined sequence representation string, or the original cell value.
   */
  resolveDynamicLookup(cellValue) {
    if (typeof cellValue !== 'string') return cellValue;
    const regex = /^([a-zA-Z0-9]+)\.([0-9]+)\.(filter\(([^=]+)==\s*\"([^\"]+)\"\)|[0-9]+)$/;
    const match = cellValue.match(regex);
    if (match) {
      const [_, mod, stableId, suffix, filterField, filterVal] = match;
      const keysToTry = [`${mod}.${stableId}`, stableId];
      const group = this.get(keysToTry[0]) || this.get(keysToTry[1]);
      if (!group) return cellValue;
      if (filterField) {
        const fField = filterField.trim();
        const matchRow = group.find(r => String(r.row[fField]) === filterVal);
        return matchRow ? matchRow.combined : cellValue;
      }
      const idx = Number(suffix) - 1;
      return group[idx] ? group[idx].combined : cellValue;
    }
    return resolveTwoSegmentLookup(cellValue, this) || cellValue;
  }
}


/**
 * SeedingContext Class
 * 
 * Encapsulates the execution parameters, active spreadsheet IDs, and target environment values
 * for the current database seeding task.
 * 
 * Avoids passing generic parameter dictionaries between functions, providing an explicit, typed
 * reference context that includes Drive folders, authentication, spreadsheets routing and sequences.
 */
class SeedingContext {
  /**
   * Represents the global environment and configuration context for seeding.
   * @param {Object} params - Constructor parameters.
   * @param {string} params.envName - Environment name.
   * @param {string} params.parentId - Parent folder ID in Google Drive.
   * @param {string} [params.appsUtilitiesId] - AppsUtilities spreadsheet ID.
   * @param {string} [params.formsEngineId] - FormsEngine spreadsheet ID.
   * @param {string} [params.moduleManagerId] - ModuleManager spreadsheet ID.
   * @param {string} [params.extensionId] - Extension spreadsheet ID.
   * @param {Object} params.headers - Authentication headers.
   * @param {Object} [params.spreadsheets] - Mapping of friendly spreadsheet names to IDs.
   * @param {Object} [params.sequenceOffsets] - Sequence offset configurations.
   * @param {Array<Array<*>>} [params.existingSequences] - Existing spreadsheet sequence values.
   */
  constructor(params) {
    this.envName = params.envName;
    this.parentId = params.parentId;
    this.appsUtilitiesId = params.appsUtilitiesId || '';
    this.formsEngineId = params.formsEngineId || '';
    this.moduleManagerId = params.moduleManagerId || '';
    this.extensionId = params.extensionId || '';
    this.headers = params.headers;
    this.spreadsheets = params.spreadsheets || {};
    this.sequenceOffsets = params.sequenceOffsets || {};
    this.existingSequences = params.existingSequences || [];
    this.globalRegistry = null;
  }
}

let globalRegistry = new GlobalRegistry();
let globalObjMap = {};
const STABLE_ID_OBJECT_CONFIG = '1001';

/**
 * Resolves two-segment stable ID cross-references (e.g., "ModuleManager.3000" or "3000")
 * by mapping the numeric stable ID to the corresponding compiled ObjectConfiguration
 * record's friendly combined sequence representation (e.g. "xOC-1007 - Module").
 * 
 * Process flow:
 * 1. Checks if the cell value matches the pattern `(ModuleName)?(StableID)`.
 * 2. Fetches the target object schema definition using the stable ID from globalObjMap.
 * 3. Scans ObjectConfiguration compiled records (stable ID 1001) for the row representing that object name.
 * 4. Returns the compiled record's combined friendly sequence representation if found.
 * 
 * @param {string} cellValue - The raw cell string value representing a cross-reference.
 * @param {GlobalRegistry} registry - Unified multi-module compiled global registry instance.
 * @returns {string|null} Resolved combined friendly name string, or null if unresolvable.
 */
function resolveTwoSegmentLookup(cellValue, registry) {
  const match = cellValue.match(/^([a-zA-Z0-9]+)?\.?([0-9]{4})$/);
  if (!match) return null;
  const target = globalObjMap[match[2]];
  if (!target) return null;
  const objRecs = registry.get(STABLE_ID_OBJECT_CONFIG) || [];
  const found = objRecs.find(rec => {
    const regName = String(rec.row['Object Name'] || '').replace(/\s+/g, '').toLowerCase();
    const targetName = target.Name.replace(/\s+/g, '').toLowerCase();
    return regName === targetName;
  });
  return found ? found.combined : null;
}


/**
 * Resolves the primary name or configuration key field name for an object configuration row.
 * Searches candidates (e.g. "Object Name", "Sequence Name") to support merge matching.
 * @param {ObjectSchema} obj - Target object config schema dictionary.
 * @param {Object} row - Single raw data record dictionary.
 * @returns {string} Located primary key column name, or empty string.
 */
function resolveNameKey_(obj, row) {
  const candidates = [
    obj.Name + ' Name', 'Object Name', 'Sequence Name',
    'Spreadsheet Name', 'Dropdown Name', 'Global Dropdown Name',
    'Form Name', 'Configuration Key'
  ];
  return candidates.find(c => c in row) || '';
}

/**
 * Merges raw records of a stable ID across different modules by matching on their primary key.
 * If a matching key already exists in the merged array, updates its properties in-place.
 * @param {string} id - Stable ID identifier of the object.
 * @param {Array<Object>} rawRows - Array of raw seed records to merge.
 * @param {ObjectSchema|null} objConfig - Corresponding object configuration schema.
 * @returns {Array<Object>} Deduped and consolidated merged records.
 */
function mergeRawRecords(id, rawRows, objConfig) {
  const merged = [];
  const primaryKey = objConfig ? resolveNameKey_(objConfig, rawRows[0] || {}) : '';
  rawRows.forEach(row => {
    if (primaryKey && row[primaryKey] !== undefined) {
      const matchKey = String(row[primaryKey]).trim();
      const existing = merged.find(r => String(r[primaryKey]).trim() === matchKey);
      if (existing) {
        Object.assign(existing, row);
        return;
      }
    }
    merged.push({ ...row });
  });
  return merged;
}

/**
 * Builds specifications for sequence numbers from sequence configuration entries in global registry.
 * Maps datasheet names to sequence parameters (start, prefix, format).
 * @param {GlobalRegistry} globalRegistry - Unified multi-module compiled global registry instance.
 * @returns {Object} Sequence specifications keyed by datasheet name.
 */
function buildSequenceSpecs(globalRegistry) {
  const specs = {};
  globalRegistry.forEach((key, records) => {
    if (!key.endsWith('.1000') && key !== '1000') return;
    records.forEach(rec => {
      const row = rec.row;
      specs[row['Datasheet Name']] = {
        start: Number(row['Starting Number']) || 1000,
        prefix: row['Sequence Prefix'] || '',
        fmt: row['Format'] || '000#'
      };
    });
  });
  return specs;
}

/**
 * Compiles a merged set of raw records into a registry format mapping sequential sequence IDs.
 * Generates continuous, unique identifier tags for each row.
 * 
 * Special Self-Bootstrapping:
 * If the compiling table is the Sequence table itself (stable ID 1000), this function
 * bootstraps the sequence specifications dynamically directly from the incoming rows
 * before compiling them, preventing sequence ID generation chicken-and-egg failure.
 * 
 * @param {Object} params - Config parameters dictionary.
 * @param {string} params.id - Numeric Stable ID of the object.
 * @param {Array<Object<string, *>>} params.rows - Merged raw row dictionaries database.
 * @param {ObjectSchema|null} params.objConfig - Object config schema metadata.
 * @param {GlobalRegistry} params.globalRegistry - Unified multi-module compiled global registry instance.
 * @returns {CompiledRecord[]} Array of compiled registry records.
 */
function compileRegistryRows(params) {
  const { id, rows, objConfig, globalRegistry } = params;
  if (!objConfig) {
    return rows.map(row => new CompiledRecord('', '', row));
  }
  const specs = buildSequenceSpecs(globalRegistry);
  if (id === '1000' || id.endsWith('.1000')) {
    rows.forEach(row => {
      specs[row['Datasheet Name']] = {
        start: Number(row['Starting Number']) || 1000,
        prefix: row['Sequence Prefix'] || '',
        fmt: row['Format'] || '000#'
      };
    });
  }
  const spec = specs[objConfig.Datasheet];
  return rows.map((row, i) => {
    if (!spec) return new CompiledRecord('', '', row);
    const num = spec.start + i;
    const pad = String(num).padStart(spec.fmt.length - 1, '0');
    const seqId = `${spec.prefix}${pad}`;
    const nameKey = resolveNameKey_(objConfig, row);
    const nameVal = row[nameKey] || '';
    const combined = nameVal ? `${seqId} - ${nameVal}` : seqId;
    return new CompiledRecord(seqId, combined, row);
  });
}


/**
 * Translates standard placeholders, script IDs, and sequential lookups in a single pipeline.
 * @param {Object} params - Options dictionary.
 * @param {string|*} params.cell - Input raw cell value.
 * @param {string} params.spokeId - Target spreadsheet spoke workbook ID.
 * @param {GlobalRegistry} params.globalRegistry - Global compiled registry instance.
 * @param {SeedingContext} params.ctx - Seeding context instance.
 * @returns {string|*} Fully translated cell string.
 */
function translateRowCell(params) {
  const { cell, spokeId, globalRegistry, ctx } = params;
  if (typeof cell !== 'string' && typeof cell !== 'boolean') return cell;
  let val = String(cell);
  val = globalRegistry.resolveDynamicLookup(val);
  const oldSpoke = ctx.spreadsheets['${SPOKE_ID}'];
  if (spokeId) {
    ctx.spreadsheets['${SPOKE_ID}'] = spokeId;
  }
  val = translateString(val, ctx);
  if (oldSpoke) {
    ctx.spreadsheets['${SPOKE_ID}'] = oldSpoke;
  } else {
    delete ctx.spreadsheets['${SPOKE_ID}'];
  }
  return val;
}



/**
 * Determines the target friendly spreadsheet name where an object datasheet should be written.
 * Inspects compiled ObjectConfiguration records dynamically to find workbook routing.
 * 
 * Fallback Workbook:
 * Returns the default fallback workbook title 'BZQ Core Configuration' if:
 *   - The schema mapping configuration does not exist.
 *   - The object is not registered in ObjectConfiguration sheet.
 * Any unmapped custom/core sheets default to this central file.
 * 
 * String Transformation:
 * Strings are transformed (spaces removed, lowercased) during matching.
 * This guarantees case- and space-insensitive matching so that minor spacing
 * differences (such as "Module Dependency" vs "ModuleDependency") resolve safely.
 * 
 * @param {ObjectSchema} objConfig - Object config schema dictionary.
 * @param {GlobalRegistry} globalRegistry - Global compiled registry instance.
 * @returns {string} Friendly spreadsheet title.
 */
function getObjectSpreadsheetName(objConfig, globalRegistry) {
  if (!objConfig) return 'BZQ Core Configuration';
  const group = globalRegistry.get(STABLE_ID_OBJECT_CONFIG) || [];
  const nameKey = objConfig.Name;
  const match = group.find(r => {
    const regName = String(r.row['Object Name'] || '').replace(/\s+/g, '').toLowerCase();
    const confName = nameKey.replace(/\s+/g, '').toLowerCase();
    return regName === confName;
  });
  if (!match) return 'BZQ Core Configuration';
  const rawSpreadsheetVal = match.row['Spreadsheet'];
  const resolved = globalRegistry.resolveDynamicLookup(rawSpreadsheetVal);
  if (resolved && resolved.indexOf(' - ') !== -1) {
    return resolved.split(' - ')[1].trim();
  }
  return 'BZQ Core Configuration';
}

/**
 * Discovers and extracts the primary spoke spreadsheet name defined in a module's Spreadsheets seed data.
 * @param {string} mod - Name of the module folder.
 * @param {Object} moduleContexts - Evaluated local JS VM contexts.
 * @returns {string|null} Located spoke spreadsheet name, or null.
 */
function getModuleSpokeName(mod, moduleContexts) {
  const context = moduleContexts[mod];
  if (!context) return null;
  const seedData = context[`getSeedData_${mod}`]();
  const ssKey = Object.keys(seedData).find(k => k === '1005' || k.endsWith('.1005'));
  if (ssKey && Array.isArray(seedData[ssKey])) {
    const spokeRec = seedData[ssKey].find(r => r['Spreadsheet Id'] === '${SPOKE_ID}');
    if (spokeRec) return spokeRec['Spreadsheet Name'];
  }
  return null;
}

/**
 * Resolves detailed object metadata record from the compiled ObjectConfiguration registry.
 * Uses space-insensitive comparison to robustly match database records.
 * @param {string} sheetName - Target worksheet tab name.
 * @param {Object} globalRegistry - Unified global compiling registry.
 * @returns {Object|null} Located metadata row, or null.
 */
function getObjectMetadataFromRegistry(sheetName, globalRegistry) {
  const objRecs = globalRegistry.get(STABLE_ID_OBJECT_CONFIG) || [];
  const found = objRecs.find(rec => {
    const regSheet = String(rec.row.Datasheet || '').replace(/\s+/g, '').toLowerCase();
    const targetSheet = sheetName.replace(/\s+/g, '').toLowerCase();
    return regSheet === targetSheet;
  });
  return found ? found.row : null;
}

/**
 * Synchronizes and extracts tabular headers, establishing the primary keys first.
 * @param {Object} objConfig - Object config schema metadata.
 * @param {Array<Object>} compiledRecs - Compiled registry rows.
 * @param {Object|null} meta - Detailed object metadata.
 * @returns {string[]} Compiled headers list.
 */
/**
 * Synchronizes and extracts tabular headers dynamically from compiled records, establishing 
 * the proper column layout. Follows standard BZQ prefix patterns (Display Formula column first,
 * Sequence ID column second, Name column third, followed by rest of the row fields).
 * 
 * Column Layout Sequencing:
 * 1. Identifies the Display/Formula column (any raw row value beginning with "=").
 * 2. Resolves the sequence ID field name (`Id Field Name` metadata or "Id" fallback).
 * 3. Resolves the primary name column candidate, using standard "Number" to "Name" inference rules.
 * 4. Appends all remaining keys in their original insertion order from the seed rows.
 * 
 * @param {ObjectSchema} objConfig - The canonical object schema metadata.
 * @param {Array<CompiledRecord>} compiledRecs - Array of processed compiled records.
 * @param {Object|null} meta - Raw ObjectConfiguration row dictionary containing field metadata overrides.
 * @returns {Array<string>} Sequenced headers array defining the physical spreadsheet columns.
 */
function getTabularHeaders(objConfig, compiledRecs, meta) {
  const rowKeys = Object.keys(compiledRecs[0] ? compiledRecs[0].row : {});
  const idHeader = meta ? (meta['Id Field Name'] || 'Id') : 'Id';
  const nameHeader = meta ? (meta['Primary Fields'] || objConfig.Name) : objConfig.Name;
  const inferredName = idHeader.endsWith(' Number') ? idHeader.replace(/ Number$/, ' Name') : '';
  const formulaCol = rowKeys.find(k => String(compiledRecs[0].row[k]).startsWith('='));
  const clean = s => s.replace(/\s+/g, '').toLowerCase();
  const match = rowKeys.find(k => clean(k) === clean(nameHeader) || (inferredName && clean(k) === clean(inferredName)));
  const headers = formulaCol ? [formulaCol, idHeader] : [idHeader];
  if (match || inferredName) headers.push(match || inferredName);
  rowKeys.forEach(k => { if (!headers.includes(k)) headers.push(k); });
  return headers;
}


/**
 * Compiles compiled registry records into standard 2D table arrays for writing.
 * Respects display formula rules (e.g. formulas only present on first record).
 * @param {Object} params - Options dictionary.
 * @param {string} params.sheetName - Sheet tab name.
 * @param {Array<Object>} params.compiledRecs - Compiled registry rows.
 * @param {Object|null} params.objConfig - Object config metadata.
 * @param {string} params.targetSsName - Target spreadsheet friendly title.
 * @param {Object} params.globalRegistry - Unified global compiling registry.
 * @returns {Array<Array<*>>} Prepared 2D tabular rows.
 */
function compileTabular2D(params) {
  const { sheetName, compiledRecs, objConfig, targetSsName, globalRegistry } = params;
  if (!objConfig) return [];
  const meta = getObjectMetadataFromRegistry(sheetName, globalRegistry);
  const headers = getTabularHeaders(objConfig, compiledRecs, meta);
  const idFieldName = meta ? (meta['Id Field Name'] || 'Id') : 'Id';
  const table2D = [headers];
  compiledRecs.forEach((rec, i) => {
    const tableRow = headers.map((header) => {
      if (header === idFieldName) return rec.id || '';
      const cellVal = rec.row[header] !== undefined ? rec.row[header] : '';
      if (String(cellVal).startsWith('=')) return i === 0 ? cellVal : '';
      return cellVal;
    });
    table2D.push(tableRow);
  });
  return table2D;
}

/**
 * Evaluates and loads modular Objects.js and Data.js scripts from all active folders.
 * @param {string|null} targetModule - Specific module folder override if executing delta seeding.
 * @returns {Object} Map of evaluated JS context workspaces.
 */
function loadModuleContexts(targetModule) {
  const contexts = {};
  const modules = targetModule ? [targetModule] : ['AppsUtilities', 'FormsEngine', 'ModuleManager'];
  modules.forEach(mod => {
    const objPath = path.join(REPO_DIR, mod, 'Objects.js');
    const dataPath = path.join(REPO_DIR, mod, 'Data.js');
    if (!fs.existsSync(objPath) || !fs.existsSync(dataPath)) return;
    console.log(`Evaluating local scripts: ${mod}/Objects.js and ${mod}/Data.js`);
    const context = { globalThis: {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(objPath, 'utf8'), context);
    vm.runInContext(fs.readFileSync(dataPath, 'utf8'), context);
    contexts[mod] = context;
  });
  return contexts;
}

/**
 * Iterates through module contexts to build a global map of stable ID objects.
 * Keys are mapped both as numeric IDs and module-namespaced ID strings.
 * @param {Object} moduleContexts - Evaluated modular JS contexts.
 * @returns {Object} Global objects schema registry.
 */
function buildGlobalObjectsMap(moduleContexts) {
  const objMap = {};
  Object.keys(moduleContexts).forEach(mod => {
    const context = moduleContexts[mod];
    const getObjects = context[`getObjects_${mod}`];
    if (typeof getObjects !== 'function') return;
    getObjects().forEach(obj => {
      objMap[String(obj.StableId)] = { ...obj, ModuleName: mod };
      objMap[`${mod}.${obj.StableId}`] = { ...obj, ModuleName: mod };
    });
  });
  return objMap;
}

/**
 * Scans all module seed data to aggregate raw rows matching a specific stable ID.
 * Supports cross-module delta seeding.
 * @param {string} id - Target Stable ID to search for.
 * @param {Object} moduleContexts - Evaluated modular contexts.
 * @returns {Array<Object>} Compiled list of raw rows across modules.
 */
function mergeModuleRawRows(id, moduleContexts) {
  const rawRows = [];
  Object.keys(moduleContexts).forEach(mod => {
    const seedData = moduleContexts[mod][`getSeedData_${mod}`]();
    const key = Object.keys(seedData).find(k => k === id || k.endsWith('.' + id));
    if (key && Array.isArray(seedData[key])) {
      rawRows.push(...seedData[key]);
    }
  });
  return rawRows;
}

/**
 * Resolves a specific stable ID and populates its records into the unified global registry.
 * @param {Object} params - Config parameter options.
 * @param {string} params.id - Target Stable ID.
 * @param {GlobalRegistry} params.registry - Unified compiling global registry instance.
 * @param {Object<string, ObjectSchema>} params.globalObjMap - Global objects schema metadata.
 * @param {Object<string, Object>} params.moduleContexts - Evaluated module contexts.
 */
function compileStableIdRegistry(params) {
  const { id, registry, globalObjMap, moduleContexts } = params;
  const rawRows = mergeModuleRawRows(id, moduleContexts);
  const merged = mergeRawRecords(id, rawRows, globalObjMap[id]);
  const compiled = compileRegistryRows({
    id, rows: merged, objConfig: globalObjMap[id], globalRegistry: registry
  });
  registry.register(id, compiled);
  if (globalObjMap[id]) {
    registry.register(`${globalObjMap[id].ModuleName}.${id}`, compiled);
  }
}

/**
 * Scans all loaded modules to extract the set of all unique stable ID numbers.
 * @param {Object} moduleContexts - Evaluated modular contexts.
 * @returns {Set<string>} Unique Stable IDs set.
 */
function extractAllStableIds(moduleContexts) {
  const allIds = new Set();
  Object.keys(moduleContexts).forEach(mod => {
    const seedData = moduleContexts[mod][`getSeedData_${mod}`]();
    Object.keys(seedData).forEach(key => {
      const isId = /^[0-9]+$/.test(key) || key.indexOf('.') !== -1;
      if (isId) allIds.add(key.indexOf('.') !== -1 ? key.split('.')[1] : key);
    });
  });
  return allIds;
}

/**
 * Builds the complete, sequentially-ordered global registry of all compiled objects across all modules.
 * @param {Object<string, Object>} moduleContexts - Evaluated modular contexts.
 * @param {Object<string, ObjectSchema>} globalObjMap - Global objects schema metadata.
 * @returns {GlobalRegistry} Unified compiling global registry instance.
 */
function buildGlobalRegistry(moduleContexts, globalObjMap) {
  const registry = new GlobalRegistry();
  const seqId = '1000';
  compileStableIdRegistry({ id: seqId, registry, globalObjMap, moduleContexts });
  const records = registry.get(seqId);
  if (records) {
    registry.register(`AppsUtilities.${seqId}`, records);
  }
  
  const allIds = extractAllStableIds(moduleContexts);
  allIds.forEach(id => {
    if (id !== seqId) {
      compileStableIdRegistry({ id, registry, globalObjMap, moduleContexts });
    }
  });
  return registry;
}

/**
 * Iterates through compiled global registry entries and populates 2D table templates.
 * @param {GlobalRegistry} globalRegistry - Unified multi-module compiled global registry instance.
 * @param {Object<string, Array<Array<*>>>} seedTemplates - Loaded seed templates dictionary.
 */
function populateTemplatesFromRegistry(globalRegistry, seedTemplates) {
  globalRegistry.forEach((key, records) => {
    if (key.indexOf('.') !== -1) return;
    const objConfig = globalObjMap[key];
    const sheetName = objConfig ? objConfig.Datasheet : key;
    const targetSsName = getObjectSpreadsheetName(objConfig, globalRegistry);
    sheetToSpreadsheetMap[sheetName] = targetSsName;
    seedTemplates[sheetName] = compileTabular2D({
      sheetName, compiledRecs: records, objConfig, targetSsName, globalRegistry
    });
  });
}

/**
 * Discovers raw layout non-database worksheets across modules and appends them to templates.
 * @param {Object} moduleContexts - Evaluated modular contexts.
 * @param {Object} seedTemplates - Loaded seed templates dictionary.
 */
function populateLayoutTemplates(moduleContexts, seedTemplates) {
  Object.keys(moduleContexts).forEach(mod => {
    const seedData = moduleContexts[mod][`getSeedData_${mod}`]();
    const spokeName = getModuleSpokeName(mod, moduleContexts);
    Object.keys(seedData).forEach(key => {
      const isId = /^[0-9]+$/.test(key) || key.indexOf('.') !== -1;
      if (!isId) {
        if (spokeName) sheetToSpreadsheetMap[key] = spokeName;
        const rawRows = seedData[key];
        const headers = Object.keys(rawRows[0] || {});
        const table2D = [headers];
        rawRows.forEach(row => {
          table2D.push(headers.map(h => row[h] !== undefined ? row[h] : ''));
        });
        seedTemplates[key] = table2D;
      }
    });
  });
}

/**
 * High-level coordinator that runs all loading, compiling, and consolidation steps.
 * @param {string|null} targetModule - Specific module folder override if executing delta seeding.
 * @returns {Object} Merged 2D tabular templates dictionary.
 */
function loadMergedSeedData(targetModule) {
  const moduleContexts = loadModuleContexts(targetModule);
  globalObjMap = buildGlobalObjectsMap(moduleContexts);
  globalRegistry = buildGlobalRegistry(moduleContexts, globalObjMap);
  
  const seedTemplates = {};
  populateTemplatesFromRegistry(globalRegistry, seedTemplates);
  populateLayoutTemplates(moduleContexts, seedTemplates);
  return seedTemplates;
}

/**
 * Interactively prompts the developer for sequence prefix and starting number overrides.
 * @param {Array<Array<*>>} sequenceConfig - Core sequence configuration rows.
 * @param {Object} ctx - Options context config.
 * @returns {Promise<Object<string, Object>>} Map of sequence translation parameters.
 */
async function configureSequences(sequenceConfig, ctx) {
  const offsets = {};
  for (let i = 1; i < sequenceConfig.length; i++) {
    const row = sequenceConfig[i];
    const defaultPrefix = row[4];
    const defaultStart = parseInt(row[5]);
    const existing = ctx.existingSequences || [];
    if (existing.some(r => String(r[2]).trim() === String(row[2]).trim())) {
      console.log(`Sequence "${row[2]}" already exists in configuration workbook. Skipping prompt.`);
      continue;
    }
    let prefix = defaultPrefix;
    let start = defaultStart;
    if (!force) {
      console.log(`\nConfiguring Sequence: "${row[2]}"`);
      prefix = await askQuestion(`  Enter Sequence Prefix (default: ${defaultPrefix}): `) || defaultPrefix;
      const startStr = await askQuestion(`  Enter Starting Number (default: ${defaultStart}): `);
      start = startStr ? parseInt(startStr) : defaultStart;
    } else {
      console.log(`Auto-configuring sequence "${row[2]}" with defaults.`);
    }
    row[4] = prefix;
    row[5] = start;
    offsets[defaultPrefix] = {
      offset: start - defaultStart,
      newPrefix: prefix,
      originalStart: defaultStart,
      newStart: start,
      formatStr: row[6]
    };
    console.log(`  -> Applied: Prefix="${prefix}", Start=${start}`);
  }
  return offsets;
}

/**
 * Automatically initializes sequence counter values matching seeded rows counts.
 * @param {Array<Array<*>>} sequenceConfig - Sequence rows database.
 * @param {Object<string, Array<Array<*>>>} seedTemplates - Loaded seed tables.
 */
function initializeCounters(sequenceConfig, seedTemplates) {
  console.log('\nInitializing sequence counters...');
  for (let i = 1; i < sequenceConfig.length; i++) {
    const row = sequenceConfig[i];
    const datasheetName = row[3];
    const userStart = row[5];
    const dataRowCount = (seedTemplates[datasheetName] && seedTemplates[datasheetName].length > 1)
      ? seedTemplates[datasheetName].length - 1
      : 0;
    const finalCurrentValue = userStart + dataRowCount;
    row[7] = finalCurrentValue;
    console.log(`  -> "${row[2]}": Counter set to ${finalCurrentValue} (${dataRowCount} records).`);
  }
}

/**
 * Formats a sequence ID using padding rules from sequence formats.
 * @param {number} num - Absolute numeric sequence ID.
 * @param {Object} conf - Specific sequence offset configuration parameters.
 * @returns {string} The fully formatted sequence ID.
 */
function formatSequenceId(num, conf) {
  const padLength = conf.formatStr ? conf.formatStr.length : 5;
  const formattedNum = String(num).padStart(padLength, '0');
  return `${conf.newPrefix}${formattedNum}`;
}

/**
 * Replaces standard placeholders and translates sequence IDs based on starting value offsets.
 * @param {string} val - Source cell string to translate.
 * @param {Object} ctx - Options context payload.
 * @returns {string} Translated cell string.
 */
function translateString(val, ctx) {
  if (typeof val !== 'string') return val;
  let result = val;
  for (const [placeholder, id] of Object.entries(ctx.spreadsheets)) {
    result = result.replace(new RegExp(placeholder.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'g'), id);
  }
  if (ctx.appsUtilitiesId) result = result.replace(/\$\{APPS_UTILITIES_SCRIPT_ID\}/g, ctx.appsUtilitiesId);
  if (ctx.formsEngineId) result = result.replace(/\$\{FORMS_ENGINE_SCRIPT_ID\}/g, ctx.formsEngineId);
  if (ctx.moduleManagerId) result = result.replace(/\$\{MODULE_MANAGER_SCRIPT_ID\}/g, ctx.moduleManagerId);
  if (ctx.extensionId) result = result.replace(/\$\{EXTENSION_SCRIPT_ID\}/g, ctx.extensionId);
  for (const [prefix, conf] of Object.entries(ctx.sequenceOffsets)) {
    const regex = new RegExp(`${prefix.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}(\\d+)`, 'g');
    result = result.replace(regex, (match, digits) => {
      const v = parseInt(digits);
      const absNum = v < conf.originalStart ? conf.newStart + v - 1 : conf.newStart + (v - conf.originalStart);
      return formatSequenceId(absNum, conf);
    });
  }
  return result;
}

/**
 * Static trigger delegate wrapper source lines for Spoke script projects.
 * @type {Array<string>}
 */
const SPOKE_TRIGGER_SOURCE = [
  'function onOpen() { AppsUtilities.onOpen(this); }',
  'function onEdit(e) { AppsUtilities.onEdit(e); }',
  'function appInit_setupInstallableTrigger() { AppsUtilities.appInit_setupInstallableTrigger(); }',
  'function appInit_onOpenInstallable(e) { AppsUtilities.appInit_onOpenInstallable(e); }',
  'function appInit_onEditInstallable(e) { AppsUtilities.appInit_onEditInstallable(e); }',
  'function appInit_getLogoUrl() { return AppsUtilities.appInit_getLogoUrl(); }',
  'function appInit_updateCache() { return AppsUtilities.appInit_updateCache(); }',
  'function appInit_preCacheObjects() { return AppsUtilities.appInit_preCacheObjects(); }',
  'function appInit_createMenus() { return AppsUtilities.appInit_createMenus(this); }',
  'function triggerAddRecordToActivePage() { AppsUtilities.triggerAddRecordToActivePage(); }',
  'function triggerValidateSelectedRows() { AppsUtilities.triggerValidateSelectedRows(); }',
  'function triggerResetConfigurationCache() { AppsUtilities.triggerResetConfigurationCache(); }',
  'function triggerSetHeaderFormat() { AppsUtilities.triggerSetHeaderFormat(); }',
  'function triggerSetRecordFormat() { AppsUtilities.triggerSetRecordFormat(); }',
  'function triggerApplyHeaderFormat() { AppsUtilities.triggerApplyHeaderFormat(); }',
  'function triggerApplyRecordFormat() { AppsUtilities.triggerApplyRecordFormat(); }',
  '/**',
  ' * Returns the current configuration cache version.',
  ' * @customfunction',
  ' * @returns {number} The active cache version number (timestamp).',
  ' */',
  'function BZQ_CACHE_VERSION() { return AppsUtilities.BZQ_CACHE_VERSION(); }',
  '/**',
  ' * Retrieves a property value from a BZQ business object record.',
  ' * @param {string} objectName Name of the business object.',
  ' * @param {string} recordId Unique identifier of the record.',
  ' * @param {string} fieldName Field column name to retrieve.',
  ' * @param {number} cacheBuster Cache buster timestamp (usually BZQ_CACHE_VERSION()).',
  ' * @customfunction',
  ' * @returns {string} The retrieved value.',
  ' */',
  'function BZQ_GET_OBJECT_VALUE(objectName, recordId, fieldName, cacheBuster) {',
  '  return AppsUtilities.BZQ_GET_OBJECT_VALUE(objectName, recordId, fieldName, cacheBuster);',
  '}'
];

/**
 * Creates a bound script project for a spreadsheet.
 * @param {string} spreadsheetId - Spreadsheet ID.
 * @param {string} title - Project title.
 * @param {Object} ctx - Options context.
 * @returns {Promise<string>} Created script ID.
 */
async function createBoundScriptProject(spreadsheetId, title, ctx) {
  const url = 'https://script.googleapis.com/v1/projects';
  const headers = ctx.scriptHeaders;
  const opt = { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' } };
  const res = await makeRequest(url, opt, { title: `${title} Bound Script`, parentId: spreadsheetId });
  return res.scriptId;
}

/**
 * Returns the manifest object for the spoke bound project.
 * @param {Object} ctx - Options context containing library IDs.
 * @returns {Object} Manifest object.
 */
function getSpokeManifest(ctx) {
  return {
    timeZone: 'America/New_York',
    runtimeVersion: 'V8',
    dependencies: {
      libraries: [
        { userSymbol: 'AppsUtilities', libraryId: ctx.appsUtilitiesId, version: '1', developmentMode: true },
        { userSymbol: 'FormsEngine', libraryId: ctx.formsEngineId, version: '1', developmentMode: true },
        { userSymbol: 'ModuleManager', libraryId: ctx.moduleManagerId, version: '1', developmentMode: true }
      ]
    },
    exceptionLogging: 'STACKDRIVER'
  };
}

/**
 * Pushes manifest and trigger contents to a specified script project.
 * @param {string} scriptId - Target script ID.
 * @param {Object} manifest - Manifest settings object.
 * @param {Object} ctx - Options context payload.
 * @returns {Promise<void>}
 */
async function pushSpokeScriptContent(scriptId, manifest, ctx) {
  const url = `https://script.googleapis.com/v1/projects/${scriptId}/content`;
  const headers = ctx.scriptHeaders;
  const opt = { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' } };
  const files = [
    { name: 'appsscript', type: 'JSON', source: JSON.stringify(manifest, null, 2) },
    { name: 'Triggers', type: 'SERVER_JS', source: SPOKE_TRIGGER_SOURCE.join('\n') }
  ];
  await makeRequest(url, opt, { files });
}

/**
 * Orchestrates Bound Apps Script project creation and configuration for Spoke spreadsheet.
 * @param {string} spreadsheetId - Spreadsheet ID.
 * @param {string} title - Spreadsheet friendly name.
 * @param {Object} ctx - Options context payload.
 * @returns {Promise<string|null>} The provisioned bound script project ID.
 */
async function provisionSpokeAppsScript(spreadsheetId, title, ctx) {
  console.log(`Provisioning bound Apps Script project for Spoke Spreadsheet "${title}"...`);
  try {
    const scriptId = await createBoundScriptProject(spreadsheetId, title, ctx);
    console.log(`✔ Created Bound Script Project ID: ${scriptId}`);

    const manifest = getSpokeManifest(ctx);
    await pushSpokeScriptContent(scriptId, manifest, ctx);

    console.log(`✔ Successfully deployed triggers and manifest into bound project!`);
    return scriptId;
  } catch (err) {
    console.error(`⚠️  WARNING: Failed to provision bound Apps Script for Spoke: ${err.message}`);
    console.error(`   Ensure Google Apps Script API is enabled at: https://script.google.com/home/usersettings`);
    return null;
  }
}

/**
 * Creates spreadsheets declared in the __Spreadsheets configuration dynamically.
 * @param {Object<string, Array<Array<*>>>} seedTemplates - Loaded seed tables.
 * @param {Object} ctx - Seeding options context dictionary.
 */
async function autoProvisionSpreadsheets(seedTemplates, ctx) {
  const spreadsheetsList = seedTemplates['Spreadsheets'] || seedTemplates['__Spreadsheets'] || [];
  for (let i = 1; i < spreadsheetsList.length; i++) {
    const row = spreadsheetsList[i];
    let friendlyName = '';
    let placeholder = '';
    
    // Check if using the modern schema (placeholder in index 3)
    if (row[3] && String(row[3]).startsWith('${') && String(row[3]).endsWith('}')) {
      friendlyName = String(row[2]).trim();
      placeholder = String(row[3]).trim();
    } else if (row[1] && String(row[1]).startsWith('${') && String(row[1]).endsWith('}')) {
      // Fallback to legacy schema
      friendlyName = String(row[0]).trim();
      placeholder = String(row[1]).trim();
    }
    
    if (placeholder && friendlyName) {
      const title = getSpreadsheetTitle(friendlyName, ctx.envName);
      let fileId = await locateExistingSpreadsheet(title, ctx.parentId, ctx.headers);
      if (!fileId) {
        fileId = await createSpreadsheet(title, ctx.parentId, ctx.headers);
      }
      ctx.spreadsheets[placeholder] = fileId;
      spreadsheetsRegistry[friendlyName] = fileId;

      if (gcpLinked) {
        await provisionSpokeAppsScript(fileId, title, ctx);
      }
    }
  }
}

/**
 * Merges seed data rows with existing rows using primary key columns.
 * @param {Array<Array<*>>} existingRows - Existing spreadsheet values.
 * @param {Array<Array<*>>} seedRows - Seed configurations.
 * @param {string} sheetName - Target sheet tab name.
 * @returns {Array<Array<*>>} Array of new rows to append.
 */
function getNewRowsToAppend(existingRows, seedRows, sheetName) {
  if (existingRows.length === 0) return seedRows;
  let keyIndex = 0;
  if (isSystemSheet(sheetName) && sheetName !== 'ConfigurationProperties' && sheetName !== '__ConfigurationProperties') {
    keyIndex = 1;
  }
  const existingKeys = new Set(existingRows.map(row => String(row[keyIndex] || '').trim()));
  return seedRows.slice(1).filter(row => {
    const keyVal = String(row[keyIndex] || '').trim();
    return keyVal !== '' && !existingKeys.has(keyVal);
  });
}

/**
 * Translates cell rows and applies spreadsheets registry correction if needed.
 * @param {Array<Array<*>>} newRows - Input database rows.
 * @param {string} sheetName - Target worksheet tab name.
 * @param {Object} ctx - Options context payload.
 * @returns {Array<Array<*>>} Translated cell rows.
 */
function translateTableRows(newRows, sheetName, ctx) {
  const spokeName = sheetToSpreadsheetMap[sheetName];
  const spokeId = spreadsheetsRegistry[spokeName] || '';
  const translated = newRows.map(row => {
    return row.map(cell => translateRowCell({ cell, spokeId, globalRegistry, ctx }));
  });
  if (sheetName === 'Spreadsheets' || sheetName === '__Spreadsheets') {
    translated.forEach(r => {
      const name = String(r[2] || '').trim();
      if (spreadsheetsRegistry[name]) r[3] = spreadsheetsRegistry[name];
      if (ctx.parentFolderPath) r[5] = ctx.parentFolderPath;
    });
  }
  return translated;
}

/**
 * Translates and seeds a specific sheet table to Google Sheets.
 * Uses unified translateRowCell to compile lookups and script IDs in a single pipeline.
 * @param {string} sheetName - Target sheet tab name.
 * @param {Array<Array<*>>} rows - Cell rows database to write.
 * @param {Object} ctx - Options context configuration dictionary.
 * @returns {Promise<void>}
 */
async function seedSheetTable(sheetName, rows, ctx) {
  const targetId = getTargetSpreadsheetId(sheetName, ctx);
  await ensureSheetExists(targetId, sheetName, ctx.headers);
  const existing = await fetchSheetValues(targetId, sheetName, ctx.headers);
  const newRows = getNewRowsToAppend(existing, rows, sheetName);
  if (newRows.length === 0) return;
  const translated = translateTableRows(newRows, sheetName, ctx);
  const range = `${sheetName}!A${existing.length + 1}`;
  console.log(`Writing ${translated.length} rows to "${sheetName}" in ${targetId} at ${range}...`);
  await makeRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', headers: { ...ctx.headers, 'Content-Type': 'application/json' } },
    { range, majorDimension: 'ROWS', values: translated }
  );
}

/**
 * Fetches a single Drive item info.
 */
async function fetchDriveItem(fileId, headers) {
  const fields = 'id,name,parents,driveId';
  return makeRequest(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=${fields}&supportsAllDrives=true`,
    { method: 'GET', headers }
  );
}

/**
 * Builds the absolute folder path recursively including the source drive indicator.
 */
async function buildAbsolutePath(folderId, headers) {
  let currentId = folderId;
  const pathParts = [];
  while (currentId) {
    const res = await fetchDriveItem(currentId, headers);
    if (!res) break;
    pathParts.unshift(res.name);
    const parentId = res.parents && res.parents[0];
    if (!parentId) {
      const isShared = !!res.driveId;
      pathParts.unshift(isShared ? '//Shared Drives' : '//My Drive');
      break;
    }
    currentId = parentId;
  }
  return pathParts.join('/');
}

/**
 * Orchestrates spreadsheet bootstrapping, dynamic counters configurations, and seeding.
 * @returns {Promise<void>}
 */
async function main() {
  try {
    const seedTemplates = loadMergedSeedData(targetModule);
    const sequenceConfig = seedTemplates['SequenceConfiguration'] || seedTemplates['__SequenceConfiguration'] || [];
    
    console.log('🔑 Securing segregated credentials...');
    const sheetsToken = await getServiceAccountToken();
    const scriptToken = await getClaspUserToken();
    console.log('✓ Credentials verified (Service Account + Clasp user).');

    const headers = { Authorization: `Bearer ${sheetsToken}` };
    const scriptHeaders = { Authorization: `Bearer ${scriptToken}` };
    
    // Check if configuration spreadsheet already exists
    const configTitle = getSpreadsheetTitle('Configuration', envName);
    const existingConfigId = await locateExistingSpreadsheet(configTitle, parentId, headers);
    if (existingConfigId && !targetModule && !force) {
      console.log(`\n⚠️  WARNING: Spreadsheet "${configTitle}" already exists (ID: ${existingConfigId})!`);
      const ans = await askQuestion('Proceeding will create duplicate spreadsheets. Continue? (y/N): ');
      if (ans.toLowerCase() !== 'y') {
        console.log('Bootstrap aborted by user.');
        process.exit(0);
      }
    }
    
    const ctx = {
      envName, parentId, appsUtilitiesId, formsEngineId, moduleManagerId, extensionId,
      headers, scriptHeaders, spreadsheets: {}, sequenceOffsets: {}
    };
    ctx.parentFolderPath = await buildAbsolutePath(parentId, headers);
    if (existingConfigId) {
      ctx.spreadsheets['${CONFIG_SS_ID}'] = existingConfigId;
      try {
        ctx.existingSequences = await fetchSheetValues(existingConfigId, 'SequenceConfiguration', headers);
      } catch (e) {
        try {
          ctx.existingSequences = await fetchSheetValues(existingConfigId, '__SequenceConfiguration', headers);
        } catch (err) {
          ctx.existingSequences = [];
        }
      }
    }
    if (sequenceConfig.length > 1) {
      console.log('\n====================================================');
      console.log('    BZQ SEQUENCE CONFIGURATION SETUP WIZARD');
      console.log('====================================================');
      ctx.sequenceOffsets = await configureSequences(sequenceConfig, ctx);
      initializeCounters(sequenceConfig, seedTemplates);
      console.log('====================================================\n');
    }
    await autoProvisionSpreadsheets(seedTemplates, ctx);
    for (const [sheetName, rows] of Object.entries(seedTemplates)) {
      if (rows.length > 0) {
        await seedSheetTable(sheetName, rows, ctx);
      }
    }
    await deleteSheet1FromAll(headers);
    console.log(`\n\x1b[32m✔ Configuration spreadsheets successfully seeded!\x1b[0m`);
  } catch (err) {
    console.error(`\n\x1b[31mError during seeding:\x1b[0m ${err.message}`);
    if (err.message.includes('1072944905499') || err.message.includes('Sheets API')) {
      console.warn('\n====================================================');
      console.warn('  ⚠️  SERVICE ACCOUNT CREDENTIALS REQUIRED');
      console.warn('====================================================');
      console.warn('The standard Clasp developer project (1072944905499) does not');
      console.warn('have the Google Sheets API enabled.');
      console.warn('\nTo bypass this and seed your database sheets successfully,');
      console.warn('please use a Service Account Key as follows:\n');
      console.warn('1. Create a Service Account on GCP project 35459168254.');
      console.warn('2. Download the JSON key file.');
      console.warn('3. Save it to the BZQ repository root as "service-account.json".');
      console.warn('4. Add your Service Account email as a Contributor on the');
      console.warn('   target Google Drive folder / Shared Drive.');
      console.warn('====================================================\n');
    }
    process.exit(1);
  }
}

main();

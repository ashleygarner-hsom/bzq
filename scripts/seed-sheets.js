#!/usr/bin/env node

/**
 * BZQ Platform - Database Seeding & Migration Utility.
 * Handles spreadsheet provisioning, duplicate warnings, interactive sequence setup,
 * runtime lookup mapping ID translation, and non-destructive data upserting.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');
const crypto = require('crypto');

// Parse CLI Arguments
let envName = null;
let parentId = null;
let appsUtilitiesId = null;
let formsEngineId = null;
let extensionId = null;
let targetModule = null;
let force = false;

process.argv.slice(2).forEach(arg => {
  if (arg.startsWith('--module=')) {
    targetModule = arg.split('=')[1];
  } else if (arg === '--force') {
    force = true;
  } else if (!envName) {
    envName = arg;
  } else if (!parentId) {
    parentId = arg;
  } else if (!appsUtilitiesId) {
    appsUtilitiesId = arg;
  } else if (!formsEngineId) {
    formsEngineId = arg;
  } else if (!extensionId) {
    extensionId = arg;
  }
});

if (!envName || !parentId) {
  console.error('Usage: node seed-sheets.js <env-name> <parent-id> [apps-utils-id] [forms-id] [ext-id] [options]');
  process.exit(1);
}

const REPO_DIR = path.join(__dirname, '..');

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
function makeRequest(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        const parsed = JSON.parse(data || '{}');
        if (res.statusCode >= 400) {
          reject(new Error(parsed.error?.message || data));
        } else {
          resolve(parsed);
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'object' ? JSON.stringify(postData) : postData);
    }
    req.end();
  });
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
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
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
function getCredentials() {
  const home = process.env.HOME || process.env.USERPROFILE;
  const adcPath = path.join(home, '.config', 'gcloud', 'application_default_credentials.json');
  if (fs.existsSync(adcPath)) {
    return { data: JSON.parse(fs.readFileSync(adcPath, 'utf8')), type: 'adc' };
  }
  const claspRcPath = path.join(home, '.clasprc.json');
  if (fs.existsSync(claspRcPath)) {
    const claspData = JSON.parse(fs.readFileSync(claspRcPath, 'utf8'));
    return { data: claspData.tokens.default, type: 'clasp' };
  }
  throw new Error('No valid credentials. Please run gcloud auth application-default login.');
}

/**
 * Refreshes the OAuth credentials to obtain a new API access token.
 * Checks for a local service-account.json key file first, falling back to clasp.
 * @returns {Promise<string>} The refreshed Google API access token string.
 */
async function getAccessToken() {
  const saPath = path.join(REPO_DIR, 'service-account.json');
  if (fs.existsSync(saPath)) {
    console.log('Using service-account.json credentials...');
    return getAccessTokenFromSA(JSON.parse(fs.readFileSync(saPath, 'utf8')));
  }
  const { data } = getCredentials();
  const postData = new URLSearchParams({
    client_id: data.client_id,
    client_secret: data.client_secret,
    refresh_token: data.refresh_token,
    grant_type: 'refresh_token',
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
 * Dynamic registry map representing all spreadsheets created by this run.
 * @type {Object<string, string>}
 */
const spreadsheetsRegistry = {};

/**
 * Generates the spreadsheet title depending on environment conventions.
 * Non-production deployments automatically append the environment name suffix.
 * @param {string} baseName - Friendly spreadsheet name.
 * @param {string} env - Target environment label.
 * @returns {string} The formatted spreadsheet name.
 */
function getSpreadsheetTitle(baseName, env) {
  const base = baseName === 'Configuration' ? 'BZQ Core Configuration' : baseName;
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

/**
 * Scans codebase module directories and merges all seed-data.json payloads.
 * @param {string|null} targetModule - Specific module folder to seed.
 * @returns {Object<string, Array<Array<*>>>} Combined table seed data.
 */
function loadMergedSeedData(targetModule) {
  const merged = {};
  const modules = targetModule ? [targetModule] : ['AppsUtilities', 'FormsEngine', 'extension_scaffold'];
  console.log(`Discovering modular seed configuration files (target: ${targetModule || 'all'})...`);
  modules.forEach(mod => {
    const seedPath = path.join(REPO_DIR, mod, 'seed-data.json');
    if (fs.existsSync(seedPath)) {
      console.log(`Found seed configuration payload: ${mod}/seed-data.json`);
      const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      for (const [sheetName, rows] of Object.entries(data)) {
        appendSeedRows(merged, sheetName, rows);
      }
    }
  });
  return merged;
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
    console.log(`\nConfiguring Sequence: "${row[2]}"`);
    const prefix = await askQuestion(`  Enter Sequence Prefix (default: ${defaultPrefix}): `) || defaultPrefix;
    const startStr = await askQuestion(`  Enter Starting Number (default: ${defaultStart}): `);
    const start = startStr ? parseInt(startStr) : defaultStart;
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
 * Creates spreadsheets declared in the __Spreadsheets configuration dynamically.
 * @param {Object<string, Array<Array<*>>>} seedTemplates - Loaded seed tables.
 * @param {Object} ctx - Seeding options context dictionary.
 */
async function autoProvisionSpreadsheets(seedTemplates, ctx) {
  const spreadsheetsList = seedTemplates['__Spreadsheets'] || [];
  for (let i = 1; i < spreadsheetsList.length; i++) {
    const row = spreadsheetsList[i];
    const friendlyName = row[0];
    const placeholder = row[1];
    if (placeholder && placeholder.startsWith('${') && placeholder.endsWith('}')) {
      const title = getSpreadsheetTitle(friendlyName, ctx.envName);
      let fileId = await locateExistingSpreadsheet(title, ctx.parentId, ctx.headers);
      if (!fileId) {
        fileId = await createSpreadsheet(title, ctx.parentId, ctx.headers);
      }
      ctx.spreadsheets[placeholder] = fileId;
      spreadsheetsRegistry[friendlyName] = fileId;
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
  if (['__SequenceConfiguration', '__ObjectConfiguration', '__LookupConfiguration'].includes(sheetName)) {
    keyIndex = 1;
  }
  const existingKeys = new Set(existingRows.map(row => String(row[keyIndex] || '').trim()));
  return seedRows.slice(1).filter(row => {
    const keyVal = String(row[keyIndex] || '').trim();
    return keyVal !== '' && !existingKeys.has(keyVal);
  });
}

/**
 * Translates and seeds a specific sheet table to Google Sheets.
 * @param {string} sheetName - Target sheet tab name.
 * @param {Array<Array<*>>} rows - Cell rows database to write.
 * @param {Object} ctx - Options context configuration dictionary.
 * @returns {Promise<void>}
 */
async function seedSheetTable(sheetName, rows, ctx) {
  const configId = ctx.spreadsheets['${CONFIG_SS_ID}'];
  await ensureSheetExists(configId, sheetName, ctx.headers);
  const existing = await fetchSheetValues(configId, sheetName, ctx.headers);
  const newRows = getNewRowsToAppend(existing, rows, sheetName);
  if (newRows.length === 0) return;
  const translated = newRows.map(row => row.map(cell => translateString(cell, ctx)));
  translated.forEach(r => {
    if (sheetName === '__Spreadsheets' && spreadsheetsRegistry[r[0]]) r[1] = spreadsheetsRegistry[r[0]];
    if (sheetName === '__ObjectConfiguration') {
      const k = Object.keys(ctx.spreadsheets).find(key => r[3].includes(key));
      if (k) r[3] = ctx.spreadsheets[k];
    }
  });
  const range = `${sheetName}!A${existing.length + 1}`;
  console.log(`Writing ${translated.length} new rows to "${sheetName}" at ${range}...`);
  await makeRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${configId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', headers: { ...ctx.headers, 'Content-Type': 'application/json' } },
    { range, majorDimension: 'ROWS', values: translated }
  );
}

/**
 * Orchestrates spreadsheet bootstrapping, dynamic counters configurations, and seeding.
 * @returns {Promise<void>}
 */
async function main() {
  try {
    const seedTemplates = loadMergedSeedData(targetModule);
    const sequenceConfig = seedTemplates['__SequenceConfiguration'] || [];
    const token = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}` };
    
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
      envName, parentId, appsUtilitiesId, formsEngineId, extensionId,
      headers, spreadsheets: {}, sequenceOffsets: {}
    };
    if (existingConfigId) {
      ctx.spreadsheets['${CONFIG_SS_ID}'] = existingConfigId;
      ctx.existingSequences = await fetchSheetValues(existingConfigId, '__SequenceConfiguration', headers);
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
    console.log(`\n\x1b[32m✔ Configuration spreadsheets successfully seeded!\x1b[0m`);
  } catch (err) {
    console.error(`\x1b[31mError during seeding:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

main();

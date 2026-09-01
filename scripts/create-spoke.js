#!/usr/bin/env node

/**
 * BZQ Platform Spoke Provisioner CLI Tool
 * Creates / locates a single Spoke spreadsheet, sets up container-bound Apps Script libraries,
 * and recursively builds the absolute folder path including the source drive.
 * Writes status to stderr and prints structural JSON to stdout.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO_DIR = path.dirname(__dirname);

// Command line parameters
const spokeName = process.argv[2];
const envName = process.argv[3];
const parentId = process.argv[4];
const projectNumber = process.argv[5];

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
 * Standard HTTP Request Promisified Client.
 */
function makeRequest(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`API Error [${res.statusCode}]: ${body}`));
        }
        resolve(body ? JSON.parse(body) : {});
      });
    });
    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

/**
 * Fetches the user credentials token config.
 */
function getCredentials() {
  const home = process.env.HOME || process.env.USERPROFILE;
  const claspRcPath = path.join(home, '.clasprc.json');
  if (fs.existsSync(claspRcPath)) {
    const claspData = JSON.parse(fs.readFileSync(claspRcPath, 'utf8'));
    return claspData.tokens.default;
  }
  const adcPath = path.join(home, '.config', 'gcloud', 'application_default_credentials.json');
  if (fs.existsSync(adcPath)) {
    return JSON.parse(fs.readFileSync(adcPath, 'utf8'));
  }
  throw new Error('No credentials found. Run "./bzq login".');
}

/**
 * Obtains an active Access Token.
 */
async function getAccessToken() {
  const data = getCredentials();
  const postData = new URLSearchParams({
    client_id: data.client_id,
    client_secret: data.client_secret,
    refresh_token: data.refresh_token,
    grant_type: 'refresh_token',
  }).toString();
  try {
    const res = await makeRequest('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      }
    }, postData);
    return res.access_token;
  } catch (err) {
    throw new Error(`Auth refresh failed: ${err.message}`);
  }
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
 * Locates an existing spreadsheet by title and parent folder.
 */
async function locateSpreadsheet(title, parentId, headers) {
  const escTitle = title.replace(/'/g, "\\'");
  const q = `name = '${escTitle}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await makeRequest(url, { method: 'GET', headers });
  return res.files && res.files[0] && res.files[0].id;
}

/**
 * Creates a fresh spreadsheet inside a folder.
 */
async function createSpreadsheet(title, parentId, headers) {
  const url = 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true';
  const metadata = {
    name: title,
    mimeType: 'application/vnd.google-apps.spreadsheet',
    parents: [parentId]
  };
  const res = await makeRequest(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' }
  }, metadata);
  return res.id;
}

/**
 * Finds script ID for a library based on its name inside deployed central config.
 */
function getLibraryScriptId(libraryName) {
  const claspFile = path.join(REPO_DIR, libraryName, '.clasp.json');
  if (fs.existsSync(claspFile)) {
    return JSON.parse(fs.readFileSync(claspFile, 'utf8')).scriptId;
  }
  return null;
}

/**
 * Assembles bound manifest.
 */
function getSpokeManifest() {
  return {
    timeZone: 'America/New_York',
    runtimeVersion: 'V8',
    dependencies: {
      libraries: [
        { userSymbol: 'AppsUtilities', libraryId: getLibraryScriptId('AppsUtilities'), version: '1', developmentMode: true },
        { userSymbol: 'FormsEngine', libraryId: getLibraryScriptId('FormsEngine'), version: '1', developmentMode: true },
        { userSymbol: 'ModuleManager', libraryId: getLibraryScriptId('ModuleManager'), version: '1', developmentMode: true }
      ].filter(l => l.libraryId)
    },
    exceptionLogging: 'STACKDRIVER'
  };
}

/**
 * Deploys bound code to a Google Apps Script project.
 */
async function deployScriptContent(scriptId, manifest, headers) {
  const url = `https://script.googleapis.com/v1/projects/${scriptId}/content`;
  const files = [
    { name: 'appsscript', type: 'JSON', source: JSON.stringify(manifest, null, 2) },
    { name: 'Triggers', type: 'SERVER_JS', source: SPOKE_TRIGGER_SOURCE.join('\n') }
  ];
  await makeRequest(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' }
  }, { files });
}

/**
 * Provisions a container-bound Apps Script trigger project.
 */
async function provisionBoundScript(spreadsheetId, title, headers) {
  process.stderr.write(`Provisioning bound Apps Script project for: ${title}\n`);
  const url = 'https://script.googleapis.com/v1/projects';
  try {
    const res = await makeRequest(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' }
    }, { title: `${title} Bound Script`, parentId: spreadsheetId });
    
    await deployScriptContent(res.scriptId, getSpokeManifest(), headers);
    process.stderr.write(`✔ Bound Script Project created and code deployed successfully!\n`);
    return res.scriptId;
  } catch (err) {
    process.stderr.write(`⚠️ WARNING: Script creation skipped (${err.message}).\n`);
    return null;
  }
}

// CLI Execution entrypoint
async function main() {
  if (!spokeName || !envName || !parentId) {
    process.stderr.write('Usage: node create-spoke.js <spoke-name> <env-name> <parent-id> [project-number]\n');
    process.exit(1);
  }
  try {
    process.stderr.write(`Obtaining Google API credentials...\n`);
    const headers = { Authorization: `Bearer ${await getAccessToken()}` };
    const title = `${spokeName} [${envName}]`;
    
    process.stderr.write(`Resolving absolute drive directory path...\n`);
    const folderPath = await buildAbsolutePath(parentId, headers);
    
    process.stderr.write(`Locating or creating Spreadsheet: "${title}"...\n`);
    let fileId = await locateSpreadsheet(title, parentId, headers);
    if (!fileId) {
      fileId = await createSpreadsheet(title, parentId, headers);
    }
    
    if (projectNumber) {
      await provisionBoundScript(fileId, title, headers);
    }
    
    // Success stdout payload
    console.log(JSON.stringify({
      id: fileId,
      url: `https://docs.google.com/spreadsheets/d/${fileId}/edit`,
      path: `${folderPath}/${title}`
    }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main();

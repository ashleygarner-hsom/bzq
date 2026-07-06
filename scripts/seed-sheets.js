#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

const [,, envName, parentId, appsUtilitiesId, formsEngineId, extensionId] = process.argv;

if (!envName || !parentId) {
  console.error('Usage: node seed-sheets.js <env-name> <parent-id> [apps-utilities-id] [forms-engine-id] [extension-id]');
  process.exit(1);
}

const REPO_DIR = path.join(__dirname, '..');

// Helper to prompt user in terminal using readline
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

// Helper to make HTTPS requests
function makeRequest(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.error ? parsed.error.message : data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) {
      if (typeof postData === 'object') {
        req.write(JSON.stringify(postData));
      } else {
        req.write(postData);
      }
    }
    req.end();
  });
}

// Load credentials from Application Default Credentials (ADC) or Clasp
function getCredentials() {
  const home = process.env.HOME || process.env.USERPROFILE;
  
  // Try Google ADC first (highly likely to have Sheets API enabled)
  const adcPath = path.join(home, '.config', 'gcloud', 'application_default_credentials.json');
  if (fs.existsSync(adcPath)) {
    return { data: JSON.parse(fs.readFileSync(adcPath, 'utf8')), type: 'adc' };
  }

  // Fallback to clasp credentials
  const claspRcPath = path.join(home, '.clasprc.json');
  if (fs.existsSync(claspRcPath)) {
    const claspData = JSON.parse(fs.readFileSync(claspRcPath, 'utf8'));
    return { data: claspData.tokens.default, type: 'clasp' };
  }

  throw new Error('No valid Google credentials found. Please run "gcloud auth application-default login" or "./bzq login".');
}

// Refresh OAuth token
async function getAccessToken() {
  const { data } = getCredentials();
  
  const postParams = {
    client_id: data.client_id,
    client_secret: data.client_secret,
    refresh_token: data.refresh_token,
    grant_type: 'refresh_token',
  };

  const postData = new URLSearchParams(postParams).toString();

  const res = await makeRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    }
  }, postData);
  
  return res.access_token;
}

// Helper to create a Google Spreadsheet in a folder
async function createSpreadsheet(title, folderId, headers) {
  console.log(`Creating spreadsheet: "${title}"...`);
  const fileMetadata = {
    name: title,
    mimeType: 'application/vnd.google-apps.spreadsheet',
    parents: [folderId]
  };

  const file = await makeRequest('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    }
  }, fileMetadata);

  console.log(`Created spreadsheet "${title}" with ID: ${file.id}`);
  return file.id;
}

// Helper to ensure a sheet tab exists in a spreadsheet
async function ensureSheetExists(spreadsheetId, sheetName, headers) {
  const metadata = await makeRequest(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, { headers });
  const sheetExists = metadata.sheets.some(s => s.properties.title === sheetName);
  
  if (!sheetExists) {
    console.log(`Creating tab "${sheetName}" in spreadsheet ${spreadsheetId}...`);
    const body = {
      requests: [{
        addSheet: {
          properties: { title: sheetName }
        }
      }]
    };
    await makeRequest(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' }
    }, body);
  }
}

// Discover and combine seed-data.json from all project folders
function loadMergedSeedData() {
  const merged = {};
  
  // Define dependency order of modules
  const modules = ['AppsUtilities', 'FormsEngine', 'extension_scaffold'];
  
  console.log('Discovering modular seed configuration files...');
  
  modules.forEach(mod => {
    const seedPath = path.join(REPO_DIR, mod, 'seed-data.json');
    if (fs.existsSync(seedPath)) {
      console.log(`Found seed configuration payload: ${mod}/seed-data.json`);
      const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      
      for (const [sheetName, rows] of Object.entries(data)) {
        if (!merged[sheetName]) {
          merged[sheetName] = [];
        }
        
        // Append rows. If table exists, drop subsequent headers
        if (merged[sheetName].length > 0 && rows.length > 0) {
          merged[sheetName].push(...rows.slice(1));
        } else {
          merged[sheetName].push(...rows);
        }
      }
    }
  });

  return merged;
}

async function main() {
  try {
    const seedTemplates = loadMergedSeedData();
    
    // Parse sequences for dynamic customization prompts
    const sequenceConfig = seedTemplates['__SequenceConfiguration'] || [];
    const customizedSequences = {};
    const sequenceOffsets = {}; // Maps prefix -> { offset, newPrefix, originalPrefix, originalStart, newStart }

    if (sequenceConfig.length > 1) {
      console.log('\n====================================================');
      console.log('    BZQ SEQUENCE CONFIGURATION SETUP WIZARD');
      console.log('====================================================');
      
      // The first row is headers: Sequence, Sequence Number, Sequence Name, etc.
      // Sequence Prefix is index 4, Starting Number is index 5
      for (let i = 1; i < sequenceConfig.length; i++) {
        const row = sequenceConfig[i];
        const name = row[2]; // Sequence Name
        const defaultPrefix = row[4];
        const defaultStart = parseInt(row[5]);

        console.log(`\nConfiguring Sequence: "${name}"`);
        const userPrefix = await askQuestion(`  Enter Sequence Prefix (default: ${defaultPrefix}): `) || defaultPrefix;
        const userStartStr = await askQuestion(`  Enter Starting Number (default: ${defaultStart}): `);
        const userStart = userStartStr ? parseInt(userStartStr) : defaultStart;

        // Save overrides back to row values
        row[4] = userPrefix;
        row[5] = userStart;

        // Track offsets for lookup translations
        const offset = userStart - defaultStart;
        sequenceOffsets[defaultPrefix] = {
          offset,
          originalPrefix: defaultPrefix,
          newPrefix: userPrefix,
          originalStart: defaultStart,
          newStart: userStart,
          formatStr: row[6]
        };

        console.log(`  -> Applied: Prefix="${userPrefix}", Start=${userStart} (Offset: ${offset >= 0 ? '+' : ''}${offset})`);
      }
      
      // Update Current Value to match the number of seeded records in each datasheet
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
        console.log(`  -> "${row[2]}": Current Value initialized to ${finalCurrentValue} (${dataRowCount} seeded records).`);
      }
      console.log('====================================================\n');
    }

    const accessToken = await getAccessToken();
    const headers = { Authorization: `Bearer ${accessToken}` };

    // 1. Create the Spoke Spreadsheets
    const configTitle = `BZQ Core Configuration ${envName}`;
    const formsTitle = `Forms Engine ${envName}`;

    const configId = await createSpreadsheet(configTitle, parentId, headers);
    const formsId = await createSpreadsheet(formsTitle, parentId, headers);

    // Helper to translate references dynamically
    function translateValue(val) {
      if (typeof val !== 'string') return val;
      let result = val;
      
      // Standard placeholder replacements
      result = result.replace(/\$\{CONFIG_SS_ID\}/g, configId);
      result = result.replace(/\$\{FORMS_SS_ID\}/g, formsId);
      
      if (appsUtilitiesId) result = result.replace(/\$\{APPS_UTILITIES_SCRIPT_ID\}/g, appsUtilitiesId);
      if (formsEngineId) result = result.replace(/\$\{FORMS_ENGINE_SCRIPT_ID\}/g, formsEngineId);
      if (extensionId) result = result.replace(/\$\{EXTENSION_SCRIPT_ID\}/g, extensionId);
      
      // Dynamic sequence lookup ID translation
      // Searches for patterns like: xSC-00001 or xSC-10001 or xOC-1000
      for (const [defaultPrefix, conf] of Object.entries(sequenceOffsets)) {
        const regex = new RegExp(`${defaultPrefix.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}(\\d+)`, 'g');
        result = result.replace(regex, (match, digits) => {
          const val = parseInt(digits);
          let absoluteNum;
          if (val < conf.originalStart) {
            // It is a 1-based index (e.g. 00001) -> Map to starting number + index - 1
            absoluteNum = conf.newStart + val - 1;
          } else {
            // It is an absolute ID (e.g. 10002) -> Map to starting number + offset
            absoluteNum = conf.newStart + (val - conf.originalStart);
          }
          
          // Pad left with zeros based on the format string
          const padLength = conf.formatStr ? conf.formatStr.length : 5;
          const formattedNum = String(absoluteNum).padStart(padLength, '0');
          return `${conf.newPrefix}${formattedNum}`;
        });
      }

      return result;
    }

    // 2. Write data to the Configuration Spreadsheet
    for (const [sheetName, rows] of Object.entries(seedTemplates)) {
      if (rows.length === 0) continue;

      await ensureSheetExists(configId, sheetName, headers);

      // Translate all data cells (including relationships, configs, formulas, IDs)
      const translatedRows = rows.map(row => row.map(translateValue));

      // Update registry targets
      if (sheetName === '__Spreadsheets') {
        translatedRows.forEach(row => {
          if (row[0] === 'Configuration') {
            row[1] = configId;
          } else if (row[0] === 'Forms Engine') {
            row[1] = formsId;
          }
        });
      }

      // Update object workbook targets
      if (sheetName === '__ObjectConfiguration') {
        translatedRows.forEach(row => {
          if (row[3] === '${CONFIG_SS_ID}') {
            row[3] = configId;
          } else if (row[3] === '${FORMS_SS_ID}') {
            row[3] = formsId;
          }
        });
      }

      console.log(`Writing ${translatedRows.length} rows to ${sheetName} in BZQ Core Configuration...`);
      const body = {
        valueInputOption: 'USER_ENTERED',
        data: [{
          range: `${sheetName}!A1`,
          values: translatedRows
        }]
      };

      await makeRequest(`https://sheets.googleapis.com/v4/spreadsheets/${configId}/values:batchUpdate`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' }
      }, body);
    }

    console.log(`\n\x1b[32m✔ Configuration spreadsheets successfully seeded!\x1b[0m`);
    console.log(`* BZQ Core Configuration ID: ${configId}`);
    console.log(`* Forms Engine ID: ${formsId}`);

  } catch (err) {
    console.error(`\x1b[31mError during seeding:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

main();

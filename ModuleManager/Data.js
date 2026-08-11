/**
 * Returns the stable-ID mapped seed configuration records and module list for ModuleManager.
 */
function getSeedData_ModuleManager() {
  return {
    // Delta Seeding onto AppsUtilities Core Objects
    "AppsUtilities.1000": [ // SequenceConfiguration
      {
        "Sequence Name": "Modules",
        "Datasheet Name": "Modules",
        "Sequence Prefix": "xMD-",
        "Starting Number": 1000,
        "Format": "000#",
        "Current Value": 1000,
        "Enabled": true
      },
      {
        "Sequence Name": "Module Dependencies",
        "Datasheet Name": "Module Dependencies",
        "Sequence Prefix": "xDD-",
        "Starting Number": 10000,
        "Format": "0000#",
        "Current Value": 10000,
        "Enabled": true
      }
    ],
    "AppsUtilities.1001": [ // ObjectConfiguration
      {
        "Object Name": "Module",
        "Datasheet": "Modules",
        "Enabled For Validation": true,
        "Spreadsheet": "AppsUtilities.1005.filter(Spreadsheet Name == \"Module Manager\")",
        "Spreadsheet Id": "${SPOKE_ID}",
        "Primary Fields": "Module Name",
        "Id Field Name": "Module Number",
        "Header Number": 1,
        "Sequence": "AppsUtilities.1000.filter(Sequence Name == \"Modules\")",
        "Custom Line Trigger": ""
      },
      {
        "Object Name": "Module Dependency",
        "Datasheet": "Module Dependencies",
        "Enabled For Validation": true,
        "Spreadsheet": "AppsUtilities.1005.filter(Spreadsheet Name == \"Module Manager\")",
        "Spreadsheet Id": "${SPOKE_ID}",
        "Primary Fields": "Dependency Number",
        "Id Field Name": "Dependency Number",
        "Header Number": 1,
        "Sequence": "AppsUtilities.1000.filter(Sequence Name == \"Module Dependencies\")",
        "Custom Line Trigger": ""
      }
    ],
    "AppsUtilities.1002": [ // LookupConfiguration
      {
        "Source Object": "AppsUtilities.1001.2", // Object
        "Target Object": "ModuleManager.3000", // Module
        "Column Name": "Module"
      },
      {
        "Source Object": "ModuleManager.3001", // Module Dependency
        "Target Object": "ModuleManager.3000", // Module
        "Column Name": "Dependent Module"
      },
      {
        "Source Object": "ModuleManager.3001", // Module Dependency
        "Target Object": "ModuleManager.3000", // Module
        "Column Name": "Prerequisite Module"
      }
    ],
    "AppsUtilities.1003": [ // DropdownConfiguration
      {
        "Dropdown Name": "Module Enabled",
        "Object": "ModuleManager.3000", // Module
        "Values": "Yes, No"
      }
    ],
    "AppsUtilities.1005": [ // Spreadsheets
      {
        "Spreadsheet Name": "Module Manager",
        "Spreadsheet Id": "${SPOKE_ID}",
        "Folder Path": "/",
        "Notes": "Main system module registry and dynamic dependency graphing workbook"
      }
    ],

    // ModuleManager Local Objects
    "3000": [ // Modules
      {
        "Module Name": "AppsUtilities",
        "Display Name": "BZQ ERP Core Application",
        "Description": "Core application for BZQ ERP system. MUST BE INSTALLED",
        "Enabled": true
      },
      {
        "Module Name": "FormsEngine",
        "Display Name": "Entry Forms Engine",
        "Description": "Engine for creating and managing data entry forms for BZQ ERP system. MUST BE INSTALLED",
        "Enabled": true
      },
      {
        "Module Name": "ModuleManager",
        "Display Name": "ERP Module Manager",
        "Description": "Module for managing modules and dependencies for BZQ ERP system. MUST BE INSTALLED",
        "Enabled": true
      }
    ],
    "3001": [ // Module Dependencies
      {
        "Dependent Module": "ModuleManager.3000.3", // ModuleManager
        "Prerequisite Module": "ModuleManager.3000.2" // FormsEngine
      },
      {
        "Dependent Module": "ModuleManager.3000.3", // ModuleManager
        "Prerequisite Module": "ModuleManager.3000.1" // AppsUtilities
      },
      {
        "Dependent Module": "ModuleManager.3000.2", // FormsEngine
        "Prerequisite Module": "ModuleManager.3000.1" // AppsUtilities
      },
      {
        "Dependent Module": "ModuleManager.3000.1", // AppsUtilities
        "Prerequisite Module": "ModuleManager.3000.2" // FormsEngine
      }
    ]
  };
}

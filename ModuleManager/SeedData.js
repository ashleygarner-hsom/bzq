/**
 * Returns the embedded ModuleManager seed configuration payload.
 * @returns {Object} Seeding configuration schema.
 */
function getSeedData_ModuleManager() {
  return {
    "SequenceConfiguration": [
      [
        "Sequence",
        "Sequence Number",
        "Sequence Name",
        "Datasheet Name",
        "Sequence Prefix",
        "Starting Number",
        "Format",
        "Current Value",
        "Enabled"
      ],
      [
        "",
        "xSC-10007",
        "Modules",
        "Modules",
        "xMD-",
        1000,
        "000#",
        1000,
        true
      ],
      [
        "",
        "xSC-10008",
        "Module Dependencies",
        "Module Dependencies",
        "xDD-",
        10000,
        "0000#",
        10000,
        true
      ]
    ],
    "ObjectConfiguration": [
      [
        "Object",
        "Object Number",
        "Object Name",
        "Datasheet",
        "Enabled For Validation",
        "Spreadsheet",
        "Spreadsheet Id",
        "Spreadsheet Url",
        "Primary Fields",
        "Id Field Name",
        "Header Number",
        "Sequence",
        "Custom Line Trigger"
      ],
      [
        "",
        "xOC-1007",
        "Module",
        "Modules",
        true,
        "xSS-1002 - Module Manager",
        "${SPOKE_ID}",
        "",
        "Module Number",
        "Module Number",
        1,
        "xSC-10007 - Modules",
        ""
      ],
      [
        "",
        "xOC-1008",
        "Module Dependency",
        "Module Dependencies",
        true,
        "xSS-1002 - Module Manager",
        "${SPOKE_ID}",
        "",
        "Dependency Number",
        "Dependency Number",
        1,
        "xSC-10008 - Module Dependencies",
        ""
      ]
    ],
    "LookupConfiguration": [
      [
        "Lookup",
        "Lookup Number",
        "Lookup Name",
        "Source Object",
        "Target Object",
        "Column Name"
      ],
      [
        "",
        "xLC-10005",
        "",
        "xOC-1001 - Object",
        "xOC-1006 - Module",
        "Module"
      ],
      [
        "",
        "xLC-10006",
        "",
        "xOC-1007 - Module Dependency",
        "xOC-1006 - Module",
        "Dependent Module"
      ],
      [
        "",
        "xLC-10007",
        "",
        "xOC-1007 - Module Dependency",
        "xOC-1006 - Module",
        "Prerequisite Module"
      ]
    ],
    "DropdownConfiguration": [
      [
        "Dropdown",
        "Dropdown Number",
        "Dropdown Name",
        "Object",
        "Values"
      ],
      [
        "",
        "xDC-10002",
        "Module Enabled",
        "xOC-1006 - Module",
        "Yes, No"
      ]
    ],
    "Spreadsheets": [
      [
        "Spreadsheet",
        "Spreadsheet Number",
        "Spreadsheet Name",
        "Spreadsheet Id",
        "Spreadsheet Url",
        "Folder Path",
        "Notes"
      ],
      [
        "",
        "xSS-1002",
        "Module Manager",
        "${SPOKE_ID}",
        "",
        "/",
        "Main system module registry and dynamic dependency graphing workbook"
      ]
    ],
    "Modules": [
      [
        "Module",
        "Module Number",
        "Module Name",
        "Display Name",
        "Description",
        "Enabled"
      ],
      [
        "=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,\"0000#\") & \" - \" & C2:C, ), ))",
        "xMD-1000",
        "AppsUtilities",
        "BZQ ERP Core Application",
        "Core application for BZQ ERP system. MUST BE INSTALLED",
        true
      ],
      [
        "",
        "xMD-1001",
        "FormsEngine",
        "Entry Forms Engine",
        "Engine for creating and managing data entry forms for BZQ ERP system. MUST BE INSTALLED",
        true
      ],
      [
        "",
        "xMD-1002",
        "ModuleManager",
        "ERP Module Manager",
        "Module for managing modules and dependencies for BZQ ERP system. MUST BE INSTALLED",
        true
      ]
    ],
    "Module Dependencies": [
      [
        "Module Dependency",
        "Dependency Number",
        "Dependency Name",
        "Dependent Module",
        "Prerequisite Module"
      ],
      [
        "=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)),B2:B & \" - \" & C2:C, ), ))",
        "xDD-10000",
        "=ARRAYFORMULA(if(not(isblank(D2:D)),if(not(isblank(E2:E)),D2:D&\" depends on \"&E2:E,\"\"),\"\"),\"\"))",
        "xMD-1002 - ModuleManager",
        "xMD-1001 - FormsEngine"
      ],
      [
        "",
        "xDD-10001",
        "",
        "xMD-1002 - ModuleManager",
        "xMD-1000 - AppsUtilities"
      ],
      [
        "",
        "xDD-10002",
        "",
        "xMD-1001 - FormsEngine",
        "xMD-1000 - AppsUtilities"
      ],
      [
        "",
        "xDD-10003",
        "",
        "xMD-1000 - AppsUtilities",
        "xMD-1001 - FormsEngine"
      ]
    ]
  };
}

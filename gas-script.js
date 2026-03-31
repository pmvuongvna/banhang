/**
 * QLBH - Google Apps Script Backend
 * Deploy this script inside your Google Sheet
 * It serves as API endpoint - no OAuth needed from client
 * 
 * SETUP:
 * 1. Mở Google Sheet → Extensions → Apps Script
 * 2. Paste code này vào
 * 3. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy URL → dán vào app QLBH
 */

/**
 * Handle GET requests (read data)
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    switch (action) {
      case 'read':
        return jsonResponse(readData(ss, e.parameter.range));
      
      case 'getSheetIds':
        return jsonResponse(getSheetIds(ss));
      
      case 'getStoreName':
        return jsonResponse({ name: ss.getName() });
      
      case 'checkSpreadsheet':
        return jsonResponse({ exists: true, name: ss.getName() });
        
      case 'ping':
        return jsonResponse({ status: 'ok', time: new Date().toISOString() });

      default:
        return jsonResponse({ error: 'Unknown action: ' + action }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

/**
 * Handle POST requests (write data)
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    switch (action) {
      case 'append':
        return jsonResponse(appendData(ss, body.sheetName, body.row));
      
      case 'update':
        return jsonResponse(updateData(ss, body.range, body.values));
      
      case 'updateRaw':
        return jsonResponse(updateDataRaw(ss, body.range, body.values));
        
      case 'appendRaw':
        return jsonResponse(appendDataRaw(ss, body.sheetName, body.row));
      
      case 'deleteRow':
        return jsonResponse(deleteRow(ss, body.sheetName, body.rowIndex));
      
      case 'ensureSheet':
        return jsonResponse(ensureSheetExists(ss, body.sheetName, body.headers));
      
      case 'createSheet':
        return jsonResponse(ensureSheetExists(ss, body.sheetName, body.headers));
        
      case 'batchRead':
        return jsonResponse(batchRead(ss, body.ranges));

      default:
        return jsonResponse({ error: 'Unknown action: ' + action }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ============================
// Data Operations
// ============================

function readData(ss, range) {
  try {
    const sheet = ss.getRange(range);
    const values = sheet.getValues();
    // Filter out completely empty rows
    const filtered = values.filter(row => row.some(cell => cell !== '' && cell !== null));
    return { data: filtered };
  } catch (err) {
    return { data: [] };
  }
}

function batchRead(ss, ranges) {
  const results = [];
  for (const range of ranges) {
    try {
      const data = ss.getRange(range).getValues();
      const filtered = data.filter(row => row.some(cell => cell !== '' && cell !== null));
      results.push({ values: filtered });
    } catch (err) {
      results.push({ values: [] });
    }
  }
  return { valueRanges: results };
}

function appendData(ss, sheetName, row) {
  const sheet = getOrCreateSheet(ss, sheetName);
  sheet.appendRow(row);
  return { success: true };
}

function appendDataRaw(ss, sheetName, row) {
  // Same as appendData for Apps Script (no parsing difference)
  return appendData(ss, sheetName, row);
}

function updateData(ss, range, values) {
  const rangeObj = ss.getRange(range);
  rangeObj.setValues(values);
  return { success: true };
}

function updateDataRaw(ss, range, values) {
  // In Apps Script, setValues doesn't parse formulas by default
  const rangeObj = ss.getRange(range);
  rangeObj.setValues(values);
  return { success: true };
}

function deleteRow(ss, sheetName, rowIndex) {
  const sheet = ss.getSheetByName(sheetName);
  if (sheet && rowIndex > 0) {
    sheet.deleteRow(rowIndex);
  }
  return { success: true };
}

function ensureSheetExists(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      // Bold headers
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    return { created: true };
  }
  return { created: false, exists: true };
}

function getSheetIds(ss) {
  const sheets = ss.getSheets();
  const ids = {};
  sheets.forEach(sheet => {
    ids[sheet.getName()] = sheet.getSheetId();
  });
  return { sheetIds: ids };
}

// ============================
// Helpers
// ============================

function getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function jsonResponse(data, code) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Execora — Google Sheets web app
 * ------------------------------------------------------------------
 * HOW TO SET UP:
 * 1. Open your Google Sheet:
 *    https://docs.google.com/spreadsheets/d/1GxlmFJ1NFawtyQn4itANN4poVrf6SfPhjyzP2O0OsFw/edit
 * 2. Click Extensions → Apps Script (a new tab opens).
 * 3. Delete any placeholder code and paste everything below.
 * 4. Click Deploy → New deployment → select type "Web app".
 * 5. Set: Execute as = "Me", Who has access = "Anyone".
 * 6. Click Deploy, allow/authorize permissions when prompted.
 * 7. Copy the blue "Web app" URL (ends in /exec), e.g.
 *    https://script.google.com/macros/s/XXXX/exec
 * 8. Put that URL in your .env as:
 *    NEXT_PUBLIC_CONTACT_SCRIPT_URL=https://script.google.com/macros/s/XXXX/exec
 */

// Sheet tab that receives home enquiry form submissions.
var SHEET_NAME = 'Leads from website'

// Sheet tab that receives post-payment (paid prototype) customer details.
var PAID_SHEET_NAME = 'Paid prototype customers'

// The target spreadsheet. Used as a fallback when this script is NOT bound
// to the spreadsheet (i.e. it was created as a standalone Apps Script project,
// where getActiveSpreadsheet() returns null).
var SPREADSHEET_ID = '1GxlmFJ1NFawtyQn4itANN4poVrf6SfPhjyzP2O0OsFw'

function doPost(e) {
  var values = {}
  // Prefer form-encoded parameters, then fall back to a JSON/text body.
  if (e && e.parameter && Object.keys(e.parameter).length) {
    values = e.parameter
  } else if (e && e.postData && e.postData.contents) {
    try {
      values = JSON.parse(e.postData.contents)
    } catch (err) {
      values = {}
    }
  }

  // Route based on which form sent the data. The paid-customer form always
  // sends fields (type/location/style) the home enquiry form never does.
  var paid = isPaidSubmission_(values)
  var sheetName = paid ? PAID_SHEET_NAME : SHEET_NAME
  var headers = getHeaders_(paid)

  var sheet = getSheetByHeaders_(sheetName, headers)

  var row = headers.map(function (h) {
    var v = values[h]
    return v !== undefined ? String(v) : ''
  })
  row[0] = new Date().toISOString()
  sheet.appendRow(row)

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', sheet: sheetName }))
    .setMimeType(ContentService.MimeType.JSON)
}

function isPaidSubmission_(values) {
  // The home form never sends these keys; the paid-customer (thank-you) form does.
  return values['type'] !== undefined || values['location'] !== undefined || values['style'] !== undefined
}

function doGet(e) {
  // Browser pre-flight checks (GET to /exec) just report ok.
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON)
}

function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  if (ss) return ss
  // Standalone script fallback: open the sheet directly by its ID.
  return SpreadsheetApp.openById(SPREADSHEET_ID)
}

function getSheetByHeaders_(name, headers) {
  var ss = getSpreadsheet_()
  var sheet = ss.getSheetByName(name)
  if (!sheet) {
    sheet = ss.insertSheet(name)
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers)
  }
  return sheet
}

function getHeaders_(paid) {
  if (paid) {
    return [
      'timestamp',
      'name',
      'business',
      'email',
      'phone',
      'type',
      'location',
      'services',
      'social',
      'style',
      'notes'
    ]
  }
  return [
    'timestamp',
    'name',
    'business',
    'email',
    'phone',
    'message'
  ]
}

function getParam_(e, key) {
  if (!e || !e.parameter) return ''
  var val = e.parameter[key]
  return val !== undefined ? String(val) : ''
}

function testDoPost() {
  var fake = { parameter: { name: 'Test', business: 'Test Co', email: 't@t.com', phone: '', message: 'hi' } }
  Logger.log(doPost(fake).getContent())
}

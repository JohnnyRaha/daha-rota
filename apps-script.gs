// Dāha rota export. Paste into Extensions → Apps Script of the Google Sheet that should receive the rota,
// then Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone. Copy the web app URL into the rota tool.
var KEY = '';   // optional: set a password here and enter the same one in the rota tool

function doPost(e) {
  var out;
  try {
    var data = JSON.parse(e.postData.contents);
    if (KEY && data.key !== KEY) throw new Error('Wrong export key.');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    write(ss, 'Rota ' + data.week, data.rota, true);
    write(ss, 'Shifts ' + data.week, data.shifts, false);
    write(ss, 'Gaps ' + data.week, data.gaps, false);
    out = { ok: true, url: ss.getUrl() };
  } catch (err) {
    out = { ok: false, error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function write(ss, name, rows, wrap) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clear();
  if (!rows || !rows.length) return;
  var width = rows[0].length;
  rows = rows.map(function (r) { r = r.slice(0, width); while (r.length < width) r.push(''); return r; });
  var range = sheet.getRange(1, 1, rows.length, width);
  range.setNumberFormat('@').setValues(rows).setVerticalAlignment('top').setWrap(wrap);
  sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#304441').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, width);
}

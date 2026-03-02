const SPREADSHEET_ID = "12RFKXcyUet-OcIQR9rwV-EVKjD0xJah3fPGUkeLDPcU";                                                                                                    
                                                                                                                                                                            
  function doPost(e) {                                                                                                                          
    try {                                                                                                                                                                   
      const body = JSON.parse(e.postData.contents || "{}");                                                                                                                 
      const type = body.type;                                                                                                                                               
      const data = body.data;                               
                                                                                                                                                                            
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);                                                                                                                   

      if (type === "setup_readme") {
        const sheet = getOrCreateSheet(ss, "readme");
        sheet.clear();
        (data || []).forEach((row) => sheet.appendRow(row));
        if ((data || []).length > 0) {
          sheet.getRange(1, 1, 1, sheet.getLastColumn())
            .setBackground("#eeeeee")
            .setFontWeight("bold");
        }
        return response({ status: "success" });
      }

      if (type === "register_seed") {
        const pid = (data && (data.participantId || data.participant_id)) || "";
        const seed = data && data.seed;

        if (!pid) throw new Error("register_seed: participantId is missing");
        if (!seed) throw new Error("register_seed: seed is missing");

        const sheet = getOrCreateSheet(ss, "participants");
        ensureHeader(sheet, ["participantId", "seed", "timestamp"]);

        const rows = sheet.getDataRange().getValues();
        const headers = rows[0] || [];
        const cPid = headers.indexOf("participantId");
        const cSeed = headers.indexOf("seed");

        for (let i = 1; i < rows.length; i++) {
          if (String(rows[i][cPid]) === String(pid)) {
            const existingSeed = rows[i][cSeed];
            return response({ status: "success", data: { seed: existingSeed } });
          }
        }

        sheet.appendRow([pid, seed, new Date().toISOString()]);
        return response({ status: "success", data: { seed } });
      }

      if (type === "get_status") {
        const pid = (data && (data.participantId || data.participant_id)) || "";
        if (!pid) throw new Error("get_status: participantId is missing");

        const seed = getSeedForParticipant_(ss, pid);
        const trialsSheet = getOrCreateSheet(ss, "trials");
        const completedCount = countByParticipant_(trialsSheet, pid);
        const motorCompletedCount = countByParticipant_(getOrCreateSheet(ss, "motor_trials"), pid);
        const unknownPending = getPendingUnknowns_(trialsSheet, pid);

        return response({
          status: "success",
          data: {
            seed: seed || 0,
            completedCount,
            motorCompletedCount,
            unknownPending
          }
        });
      }

      if (type === "motor_trial") {
        appendSingleRow(getOrCreateSheet(ss, "motor_trials"), data);
        return response({ status: "success" });
      }

      if (type === "motor_trials_batch") {
        appendBatchData(getOrCreateSheet(ss, "motor_trials"), data);
        return response({ status: "success" });
      }

      if (type === "trial_single") {
        appendSingleRow(getOrCreateSheet(ss, "trials"), data);
        return response({ status: "success" });
      }

      if (type === "trials_batch") {
        appendBatchData(getOrCreateSheet(ss, "trials"), data);
        return response({ status: "success" });
      }

      if (type === "summary") {
        appendSingleRow(getOrCreateSheet(ss, "summaries"), data);
        return response({ status: "success" });
      }

      throw new Error("Unknown type: " + type);

    } catch (err) {
      return response({ status: "error", message: String(err) });
    }
  }

  // --------------------
  // helpers
  // --------------------

  function getOrCreateSheet(ss, name) {
    return ss.getSheetByName(name) || ss.insertSheet(name);
  }

  function response(obj) {
    return ContentService
      .createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  }

  function appendSingleRow(sheet, obj) {
    if (!obj || typeof obj !== "object") return;
    ensureHeader(sheet, Object.keys(obj));
    // シートの列順で値を並べる（キー順ではなく列順に合わせないとズレる）
    const lastCol = sheet.getLastColumn();
    const sheetHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const row = sheetHeaders.map(h => (obj[h] != null ? obj[h] : ""));
    sheet.appendRow(row);
  }

  function appendBatchData(sheet, dataArray) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) return;
    const headers = Object.keys(dataArray[0] || {});
    if (headers.length === 0) return;

    ensureHeader(sheet, headers);

    const values = dataArray.map(obj => headers.map(h => (obj && obj[h] != null ? obj[h] : "")));
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
  }

  function ensureHeader(sheet, headers) {
    const lastCol = sheet.getLastColumn();

    if (lastCol === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#eeeeee");
      return;
    }

    const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const newH = headers.filter(h => !existing.includes(h));

    if (newH.length > 0) {
      sheet.getRange(1, lastCol + 1, 1, newH.length).setValues([newH]);
    }
  }

  function getSeedForParticipant_(ss, pid) {
    const sheet = getOrCreateSheet(ss, "participants");
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) return null;

    const headers = rows[0];
    const cPid = headers.indexOf("participantId");
    const cSeed = headers.indexOf("seed");
    if (cPid === -1 || cSeed === -1) return null;

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][cPid]) === String(pid)) return rows[i][cSeed];
    }
    return null;
  }

  function countByParticipant_(sheet, pid) {
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) return 0;

    const headers = rows[0];
    const colIdx = headers.findIndex(h => h === "participant_id" || h === "participantId");
    if (colIdx === -1) return 0;

    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][colIdx]) === String(pid)) count++;
    }
    return count;
  }

 function getPendingUnknowns_(sheet, pid) {
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) return [];

    const headers = rows[0];
    const cPid    = headers.findIndex(h => h === "participant_id" || h === "participantId");
    const cStimId = headers.indexOf("stimulus_id");
    const cKim    = headers.indexOf("kimariji");
    const cRep    = headers.indexOf("rep");
    const cIdx    = headers.indexOf("trial_index");
    const cUnk    = headers.indexOf("is_unknown");

    if (cPid === -1 || cStimId === -1) return [];

    const pending = [];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][cPid]) !== String(pid)) continue;
      const stimId   = rows[i][cStimId];
      const trialIdx = cIdx !== -1 ? rows[i][cIdx] : null;
      const isUnk    = cUnk !== -1 ? String(rows[i][cUnk]) : "";

      if (isUnk === "1") {
        pending.push({
          stimulus_id: stimId,
          kimariji:    cKim !== -1 ? rows[i][cKim] : "",
          rep:         cRep !== -1 ? rows[i][cRep] : null,
          trial_index: trialIdx
        });
      } else {
        // trial_index で照合（同じ曲の別コピーを誤って削除しない）
        const idx = pending.findIndex(p => String(p.trial_index) === String(trialIdx));
        if (idx !== -1) pending.splice(idx, 1);
      }
    }
    return pending;
  }


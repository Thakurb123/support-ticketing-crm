const CONFIG = {
  SPREADSHEET_ID: '18LnsfTPne-Q_c6c8y1DGL6TVWGewtmWr1gCK4V23YkM',
  SHEETS: {
    TICKETS: 'Tickets',
    CUSTOMERS: 'Customers',
    ORDERS: 'Orders',
    TEAM: 'Team',
    ESCALATIONS: 'EscalationHistory',
    TRANSCRIPTS: 'Transcripts',
    ATTACHMENTS: 'Attachments'
  },
  STATUSES: ['Pending', 'In Progress', 'Waiting on Third Party', 'Waiting on Customer', 'Resolved'],
  CHANNELS: ['WhatsApp', 'Instagram', 'Facebook', 'Email', 'Call'],
  ESCALATION_LEVELS: ['None', 'L1', 'L2', 'L3', 'Critical']
};

const HEADERS = {
  Tickets: [
    'TicketID', 'CreatedAt', 'UpdatedAt', 'CustomerID', 'CustomerName', 'Email', 'Phone',
    'OrderID', 'Channel', 'Status', 'EscalationLevel', 'AssignedTo', 'Department',
    'QueryTheme', 'ActionTaken', 'IssueDescription', 'ResolutionNotes', 'DueDate', 'Tags'
  ],
  Customers: ['CustomerID', 'Name', 'Email', 'Phone', 'City', 'LifetimeValue', 'CreatedAt'],
  Orders: ['OrderID', 'CustomerID', 'OrderDate', 'Product', 'Amount', 'PaymentStatus', 'FulfillmentStatus', 'TrackingLink'],
  Team: ['MemberID', 'Name', 'Department', 'Email', 'Active'],
  EscalationHistory: ['HistoryID', 'TicketID', 'Timestamp', 'FromAssignee', 'ToAssignee', 'Department', 'Level', 'Reason'],
  Transcripts: ['TranscriptID', 'TicketID', 'Timestamp', 'Channel', 'MessageFrom', 'MessageText'],
  Attachments: ['AttachmentID', 'TicketID', 'Timestamp', 'FileName', 'FileUrl', 'FileType']
};

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Support Ticketing CRM')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function setupDatabase() {
  const ss = getSpreadsheet_();
  Object.keys(HEADERS).forEach((sheetName) => {
    const sheet = getOrCreateSheet_(ss, sheetName);
    sheet.clear();
    sheet.getRange(1, 1, 1, HEADERS[sheetName].length).setValues([HEADERS[sheetName]]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS[sheetName].length).setFontWeight('bold').setBackground('#eef2ff');
  });
  PropertiesService.getScriptProperties().setProperty('ticketCounter', '1000');
  return success_('Database setup complete.');
}

function getInitialData(filters) {
  try {
    const tickets = getTickets(filters || {});
    return {
      ok: true,
      tickets,
      team: readObjects_(CONFIG.SHEETS.TEAM),
      statuses: CONFIG.STATUSES,
      channels: CONFIG.CHANNELS,
      escalationLevels: CONFIG.ESCALATION_LEVELS,
      metrics: buildMetrics_(tickets)
    };
  } catch (error) {
    return failure_(error);
  }
}

function getTickets(filters) {
  const tickets = readObjects_(CONFIG.SHEETS.TICKETS);
  const orders = indexBy_(readObjects_(CONFIG.SHEETS.ORDERS), 'OrderID');
  const transcripts = groupBy_(readObjects_(CONFIG.SHEETS.TRANSCRIPTS), 'TicketID');
  const attachments = groupBy_(readObjects_(CONFIG.SHEETS.ATTACHMENTS), 'TicketID');
  const escalations = groupBy_(readObjects_(CONFIG.SHEETS.ESCALATIONS), 'TicketID');

  return tickets
    .filter((ticket) => matchesFilters_(ticket, filters || {}))
    .map((ticket) => ({
      ...ticket,
      Order: orders[ticket.OrderID] || null,
      Transcripts: transcripts[ticket.TicketID] || [],
      Attachments: attachments[ticket.TicketID] || [],
      EscalationHistory: escalations[ticket.TicketID] || []
    }))
    .sort((a, b) => new Date(b.UpdatedAt) - new Date(a.UpdatedAt));
}

function createTicket(payload) {
  try {
    validateTicket_(payload);
    const now = new Date().toISOString();
    const customerId = payload.CustomerID || upsertCustomer_(payload);
    const ticket = {
      TicketID: generateTicketId_(),
      CreatedAt: now,
      UpdatedAt: now,
      CustomerID: customerId,
      CustomerName: payload.CustomerName,
      Email: payload.Email,
      Phone: payload.Phone,
      OrderID: payload.OrderID || '',
      Channel: payload.Channel,
      Status: payload.Status || 'Pending',
      EscalationLevel: payload.EscalationLevel || 'None',
      AssignedTo: payload.AssignedTo || '',
      Department: payload.Department || '',
      QueryTheme: payload.QueryTheme || '',
      ActionTaken: payload.ActionTaken || '',
      IssueDescription: payload.IssueDescription,
      ResolutionNotes: payload.ResolutionNotes || '',
      DueDate: payload.DueDate || '',
      Tags: payload.Tags || ''
    };
    appendObject_(CONFIG.SHEETS.TICKETS, ticket);
    if (payload.InitialMessage) {
      addTranscript({
        TicketID: ticket.TicketID,
        Channel: ticket.Channel,
        MessageFrom: ticket.CustomerName,
        MessageText: payload.InitialMessage
      });
    }
    return { ok: true, ticket: getTickets({ search: ticket.TicketID })[0] };
  } catch (error) {
    return failure_(error);
  }
}

function updateTicket(ticketId, updates) {
  try {
    if (!ticketId) throw new Error('Ticket ID is required.');
    const allowed = HEADERS.Tickets.filter((header) => !['TicketID', 'CreatedAt'].includes(header));
    const cleanUpdates = {};
    allowed.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(updates, field)) cleanUpdates[field] = updates[field];
    });
    cleanUpdates.UpdatedAt = new Date().toISOString();
    updateObjectById_(CONFIG.SHEETS.TICKETS, 'TicketID', ticketId, cleanUpdates);
    return { ok: true, ticket: getTickets({ search: ticketId })[0] };
  } catch (error) {
    return failure_(error);
  }
}

function addEscalation(payload) {
  try {
    if (!payload.TicketID || !payload.ToAssignee || !payload.Level) {
      throw new Error('TicketID, ToAssignee, and Level are required for escalation.');
    }
    const ticket = getTickets({ search: payload.TicketID })[0];
    appendObject_(CONFIG.SHEETS.ESCALATIONS, {
      HistoryID: Utilities.getUuid(),
      TicketID: payload.TicketID,
      Timestamp: new Date().toISOString(),
      FromAssignee: ticket ? ticket.AssignedTo : '',
      ToAssignee: payload.ToAssignee,
      Department: payload.Department || '',
      Level: payload.Level,
      Reason: payload.Reason || ''
    });
    updateTicket(payload.TicketID, {
      AssignedTo: payload.ToAssignee,
      Department: payload.Department || '',
      EscalationLevel: payload.Level,
      Status: 'In Progress'
    });
    return { ok: true, ticket: getTickets({ search: payload.TicketID })[0] };
  } catch (error) {
    return failure_(error);
  }
}

function addTranscript(payload) {
  try {
    appendObject_(CONFIG.SHEETS.TRANSCRIPTS, {
      TranscriptID: Utilities.getUuid(),
      TicketID: payload.TicketID,
      Timestamp: new Date().toISOString(),
      Channel: payload.Channel || '',
      MessageFrom: payload.MessageFrom || '',
      MessageText: payload.MessageText || ''
    });
    return success_('Transcript added.');
  } catch (error) {
    return failure_(error);
  }
}

function exportTicketsCsv(filters) {
  const tickets = getTickets(filters || {});
  const headers = HEADERS.Tickets;
  const rows = [headers].concat(tickets.map((ticket) => headers.map((header) => ticket[header] || '')));
  return rows.map((row) => row.map(csvEscape_).join(',')).join('\n');
}

function getSpreadsheet_() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.indexOf('PASTE_') === 0) {
    throw new Error('Open Code.gs and replace CONFIG.SPREADSHEET_ID with your Google Sheet ID.');
  }
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function readObjects_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => headers.reduce((obj, header, index) => {
      obj[header] = normalizeCell_(row[index]);
      return obj;
    }, {}));
}

function appendObject_(sheetName, object) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  const headers = HEADERS[sheetName];
  sheet.appendRow(headers.map((header) => object[header] || ''));
}

function updateObjectById_(sheetName, idField, idValue, updates) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIndex = headers.indexOf(idField);
  const rowIndex = values.findIndex((row, index) => index > 0 && String(row[idIndex]) === String(idValue));
  if (rowIndex === -1) throw new Error(`${idField} ${idValue} was not found.`);
  Object.keys(updates).forEach((field) => {
    const colIndex = headers.indexOf(field);
    if (colIndex !== -1) sheet.getRange(rowIndex + 1, colIndex + 1).setValue(updates[field]);
  });
}

function upsertCustomer_(payload) {
  const customers = readObjects_(CONFIG.SHEETS.CUSTOMERS);
  const existing = customers.find((customer) =>
    customer.Email === payload.Email || String(customer.Phone) === String(payload.Phone)
  );
  if (existing) return existing.CustomerID;
  const customerId = `CUS-${Utilities.getUuid().slice(0, 8).toUpperCase()}`;
  appendObject_(CONFIG.SHEETS.CUSTOMERS, {
    CustomerID: customerId,
    Name: payload.CustomerName,
    Email: payload.Email,
    Phone: payload.Phone,
    City: payload.City || '',
    LifetimeValue: '',
    CreatedAt: new Date().toISOString()
  });
  return customerId;
}

function generateTicketId_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const current = Number(props.getProperty('ticketCounter') || '1000') + 1;
    props.setProperty('ticketCounter', String(current));
    return `TCK-${current}`;
  } finally {
    lock.releaseLock();
  }
}

function validateTicket_(payload) {
  ['CustomerName', 'Email', 'Phone', 'Channel', 'IssueDescription'].forEach((field) => {
    if (!payload[field]) throw new Error(`${field} is required.`);
  });
  if (!CONFIG.CHANNELS.includes(payload.Channel)) throw new Error('Invalid communication channel.');
  if (payload.Status && !CONFIG.STATUSES.includes(payload.Status)) throw new Error('Invalid ticket status.');
}

function matchesFilters_(ticket, filters) {
  const search = String(filters.search || '').toLowerCase().trim();
  const haystack = [
    ticket.TicketID, ticket.CustomerName, ticket.OrderID, ticket.Phone, ticket.Email,
    ticket.QueryTheme, ticket.AssignedTo, ticket.Department
  ].join(' ').toLowerCase();
  if (search && !haystack.includes(search)) return false;
  if (filters.status && ticket.Status !== filters.status) return false;
  if (filters.channel && ticket.Channel !== filters.channel) return false;
  if (filters.escalation && ticket.EscalationLevel !== filters.escalation) return false;
  if (filters.assignedTo && ticket.AssignedTo !== filters.assignedTo) return false;
  if (filters.activeOnly && ticket.Status === 'Resolved') return false;
  if (filters.fromDate && new Date(ticket.CreatedAt) < new Date(filters.fromDate)) return false;
  if (filters.toDate && new Date(ticket.CreatedAt) > new Date(`${filters.toDate}T23:59:59`)) return false;
  return true;
}

function buildMetrics_(tickets) {
  return {
    total: tickets.length,
    active: tickets.filter((ticket) => ticket.Status !== 'Resolved').length,
    resolved: tickets.filter((ticket) => ticket.Status === 'Resolved').length,
    critical: tickets.filter((ticket) => ticket.EscalationLevel === 'Critical').length
  };
}

function indexBy_(rows, key) {
  return rows.reduce((map, row) => {
    map[row[key]] = row;
    return map;
  }, {});
}

function groupBy_(rows, key) {
  return rows.reduce((map, row) => {
    if (!map[row[key]]) map[row[key]] = [];
    map[row[key]].push(row);
    return map;
  }, {});
}

function normalizeCell_(value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function csvEscape_(value) {
  const text = String(value == null ? '' : value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function success_(message) {
  return { ok: true, message };
}

function failure_(error) {
  return { ok: false, message: error.message || String(error) };
}

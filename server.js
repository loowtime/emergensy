const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

const overviewData = {
  timestamp: new Date().toISOString(),
  overview: {
    incidents: 12,
    criticalRisks: 4,
    deployedUnits: 87,
    safeRoutes: 6,
    responseRate: 88,
    shelterCapacity: 9200,
    affectedPopulation: 18400,
    evacuationProgress: 71
  },
  liveFeed: [
    { type: 'alert', label: 'Warnung', text: 'Waldbrand Nordost: 3 km Radius mit steigender Windgeschwindigkeit.' },
    { type: 'status', label: 'Einsatz', text: 'Löschzug 4 hat die Rückzugszone erreicht und beginnt mit der Kühlung.' },
    { type: 'info', label: 'Ressource', text: '14 Einsatzkräfte wurden für die Evakuierung der Siedlung Birkach verlegt.' },
    { type: 'alert', label: 'Risiko', text: 'Hochwasserwarnung für das Flusstal wurde auf Stufe 2 erhöht.' }
  ],
  resources: [
    { name: 'Einsatzleitung', type: 'Command', available: 5, total: 6, status: 'bereit' },
    { name: 'Feuerwehr', type: 'Branchen', available: 18, total: 22, status: 'im Einsatz' },
    { name: 'Rettungsdienst', type: 'Medical', available: 15, total: 19, status: 'bereit' },
    { name: 'Technische Hilfe', type: 'Logistics', available: 9, total: 14, status: 'mobilisiert' },
    { name: 'Katastrophenschutz', type: 'Support', available: 22, total: 26, status: 'vor Ort' }
  ],
  riskMatrix: [
    { region: 'Nordwest', flood: 62, fire: 82, wind: 74, medical: 48 },
    { region: 'Zentrum', flood: 51, fire: 55, wind: 60, medical: 68 },
    { region: 'Südost', flood: 76, fire: 71, wind: 66, medical: 54 },
    { region: 'Flussufer', flood: 89, fire: 40, wind: 55, medical: 58 }
  ],
  evacuationPlan: [
    { route: 'A1 - Flussufer', progress: 82, status: 'offen' },
    { route: 'B3 - Westliche Altstadt', progress: 69, status: 'in Arbeit' },
    { route: 'C7 - Industriegebiet', progress: 58, status: 'vorbereitet' },
    { route: 'D2 - Stadtrand', progress: 91, status: 'gesichert' }
  ],
  scenarios: [
    { id: 's1', label: 'Waldbrand Nordost', phase: 'Vorsicht', impact: 'hoch', progress: 34 },
    { id: 's2', label: 'Hochwasserwarnung', phase: 'Koordinierung', impact: 'kritisch', progress: 58 },
    { id: 's3', label: 'Stromnetzstörung', phase: 'Stabilisierung', impact: 'mittel', progress: 72 }
  ]
};

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJson(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/overview') {
    overviewData.timestamp = new Date().toISOString();
    sendJson(res, overviewData);
    return;
  }

  if (url.pathname === '/') {
    serveFile(res, path.join(publicDir, 'index.html'));
    return;
  }

  const requestedPath = path.normalize(path.join(publicDir, url.pathname));
  if (requestedPath.startsWith(publicDir) && fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
    serveFile(res, requestedPath);
    return;
  }

  serveFile(res, path.join(publicDir, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Emergensy dashboard is running on http://localhost:${PORT}`);
});

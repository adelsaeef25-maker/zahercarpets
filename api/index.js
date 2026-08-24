const fs = require('fs');
const path = require('path');
const url = require('url');

// Data directory resolution
const DATA_DIR = path.join(process.cwd(), 'data');

// In-memory fallback in case of serverless read-only filesystem
let memoryStore = {
  carpets: null,
  reviews: null,
  inquiries: null,
  settings: null
};

function readJson(filename, defaultVal = []) {
  const key = filename.replace('.json', '');
  if (memoryStore[key]) return memoryStore[key];

  const filePath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      memoryStore[key] = parsed;
      return parsed;
    }
  } catch (err) {
    console.error('Read error:', err);
  }
  memoryStore[key] = defaultVal;
  return defaultVal;
}

function writeJson(filename, data) {
  const key = filename.replace('.json', '');
  memoryStore[key] = data;

  const filePath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    // In serverless environments with read-only filesystem, memory store retains it
    console.log('Serverless memory write:', key);
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    if (req.body && typeof req.body === 'string') {
      try { return resolve(JSON.parse(req.body)); } catch (e) { return resolve(req.body); }
    }
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname || '/';
  
  // Normalize pathname so /api/carpets and /carpets both match /api/carpets
  if (!pathname.startsWith('/api')) {
    pathname = '/api' + (pathname.startsWith('/') ? pathname : '/' + pathname);
  }

  // 1. CARPETS API
  if (pathname === '/api/carpets' && req.method === 'GET') {
    return sendJson(res, 200, readJson('carpets.json', []));
  }

  if (pathname === '/api/carpets' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const carpets = readJson('carpets.json', []);
      const imagesArr = Array.isArray(body.images) && body.images.length > 0
        ? body.images
        : (body.image ? [body.image] : ['images/carpet-07-carpet-completed.jpeg']);

      const newCarpet = {
        id: 'carpet-' + Date.now(),
        nameAr: body.nameAr || 'تحفة حريرية جديدة',
        nameEn: body.nameEn || 'New Silk Carpet',
        category: body.category || 'حرير توت خالص',
        categoryEn: body.categoryEn || 'Pure Silk',
        kpsi: body.kpsi || '1,200 KPSI',
        dimensions: body.dimensions || '3.00 × 2.00 م',
        materialAr: body.materialAr || 'حرير توت خالص ١٠٠٪',
        materialEn: body.materialEn || '100% Pure Mulberry Silk',
        densityAr: body.densityAr || (body.kpsi ? body.kpsi + ' عقدة / بوصة²' : '١,٢٠٠ عقدة / بوصة²'),
        densityEn: body.densityEn || (body.kpsi ? body.kpsi + ' Micro-Knots / in²' : '1,200 Micro-Knots / in²'),
        durationAr: body.durationAr || '٢٤ شهرًا نسج يدوي',
        durationEn: body.durationEn || '24 Months Hand-Tied',
        guildAr: body.guildAr || 'نول زاهر سالمان الملكي',
        guildEn: body.guildEn || 'Zaher Salman Royal Guild',
        image: body.image || imagesArr[0],
        images: imagesArr,
        descriptionAr: body.descriptionAr || '',
        descriptionEn: body.descriptionEn || '',
        price: body.price || 'عند الطلب',
        featured: body.featured !== undefined ? body.featured : true,
        createdAt: new Date().toISOString()
      };
      carpets.unshift(newCarpet);
      writeJson('carpets.json', carpets);
      return sendJson(res, 201, { success: true, carpet: newCarpet });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname.indexOf('/api/carpets/') === 0 && req.method === 'PUT') {
    const id = pathname.replace('/api/carpets/', '');
    try {
      const body = await parseBody(req);
      const carpets = readJson('carpets.json', []);
      const index = carpets.findIndex(c => c.id === id);
      if (index === -1) return sendJson(res, 404, { error: 'Not found' });
      carpets[index] = Object.assign({}, carpets[index], body, { id });
      writeJson('carpets.json', carpets);
      return sendJson(res, 200, { success: true, carpet: carpets[index] });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname.indexOf('/api/carpets/') === 0 && req.method === 'DELETE') {
    const id = pathname.replace('/api/carpets/', '');
    try {
      let carpets = readJson('carpets.json', []);
      carpets = carpets.filter(c => c.id !== id);
      writeJson('carpets.json', carpets);
      return sendJson(res, 200, { success: true });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 2. IMAGE UPLOAD API
  if (pathname === '/api/upload' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (Array.isArray(body.images) && body.images.length > 0) {
        return sendJson(res, 200, {
          success: true,
          imageUrls: body.images,
          imageUrl: body.images[0]
        });
      }
      if (body.imageData) {
        return sendJson(res, 200, {
          success: true,
          imageUrl: body.imageData,
          imageUrls: [body.imageData]
        });
      }
      return sendJson(res, 400, { error: 'No image data' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 3. REVIEWS API
  if (pathname === '/api/reviews' && req.method === 'GET') {
    return sendJson(res, 200, readJson('reviews.json', []));
  }

  if (pathname === '/api/reviews' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const reviews = readJson('reviews.json', []);
      const newReview = {
        id: 'rev-' + Date.now(),
        nameAr: body.nameAr || 'عميل VIP',
        nameEn: body.nameEn || 'VIP Patron',
        titleAr: body.titleAr || 'قصر / فيلا فاخرة',
        titleEn: body.titleEn || 'Private Estate',
        avatar: body.avatar || '⚜',
        rating: body.rating || 5,
        quoteAr: body.quoteAr || '',
        quoteEn: body.quoteEn || '',
        pieceAcquiredAr: body.pieceAcquiredAr || 'سجاد حرير مخصص',
        pieceAcquiredEn: body.pieceAcquiredEn || 'Bespoke Silk Carpet',
        verified: true
      };
      reviews.unshift(newReview);
      writeJson('reviews.json', reviews);
      return sendJson(res, 201, { success: true, review: newReview });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname.indexOf('/api/reviews/') === 0 && req.method === 'DELETE') {
    const id = pathname.replace('/api/reviews/', '');
    try {
      let reviews = readJson('reviews.json', []);
      reviews = reviews.filter(r => r.id !== id);
      writeJson('reviews.json', reviews);
      return sendJson(res, 200, { success: true });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 4. INQUIRIES API
  if (pathname === '/api/inquiries' && req.method === 'GET') {
    return sendJson(res, 200, readJson('inquiries.json', []));
  }

  if (pathname === '/api/inquiries' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const inquiries = readJson('inquiries.json', []);
      const newInquiry = {
        id: 'inq-' + Date.now(),
        name: body.name || 'عميل مميز',
        email: body.email || '',
        phone: body.phone || '',
        dimensions: body.dimensions || '',
        palette: body.palette || '',
        notes: body.notes || '',
        pieceName: body.pieceName || 'استشارة عامة',
        date: new Date().toISOString().replace('T', ' ').substring(0, 16),
        status: 'جديد'
      };
      inquiries.unshift(newInquiry);
      writeJson('inquiries.json', inquiries);
      return sendJson(res, 201, { success: true, inquiry: newInquiry });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname.indexOf('/api/inquiries/') === 0 && req.method === 'DELETE') {
    const id = pathname.replace('/api/inquiries/', '');
    try {
      let inquiries = readJson('inquiries.json', []);
      inquiries = inquiries.filter(i => i.id !== id);
      writeJson('inquiries.json', inquiries);
      return sendJson(res, 200, { success: true });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 5. SETTINGS API
  if (pathname === '/api/settings' && req.method === 'GET') {
    return sendJson(res, 200, readJson('settings.json', {}));
  }

  if (pathname === '/api/settings' && req.method === 'PUT') {
    try {
      const body = await parseBody(req);
      const settings = readJson('settings.json', {});
      const updated = Object.assign({}, settings, body);
      writeJson('settings.json', updated);
      return sendJson(res, 200, { success: true, settings: updated });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  return sendJson(res, 404, { error: 'Endpoint not found' });
};

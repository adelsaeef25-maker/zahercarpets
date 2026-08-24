const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const UPLOADS_DIR = path.join(BASE_DIR, 'uploads');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ico': 'image/x-icon'
};

// Helper to read JSON files safely
function readJson(filename, defaultVal) {
  if (defaultVal === undefined) defaultVal = [];
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2), 'utf-8');
      return defaultVal;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading ' + filename + ':', err);
    return defaultVal;
  }
}

// Helper to write JSON files safely
function writeJson(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Helper to parse request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 80 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve(body);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

// Helper to save a single base64 image string
function saveBase64Image(base64String) {
  const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return null;
  }
  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');

  let ext = '.jpg';
  if (mimeType.indexOf('png') !== -1) ext = '.png';
  else if (mimeType.indexOf('webp') !== -1) ext = '.webp';
  else if (mimeType.indexOf('jpeg') !== -1) ext = '.jpeg';

  const filename = 'carpet_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + ext;
  const filePath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return 'uploads/' + filename;
}

// Static File Server
function serveStatic(req, res, pathname) {
  let relativePath = pathname === '/' ? 'index.html' : pathname;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(relativePath);
  } catch (e) {
    decodedPath = relativePath;
  }

  if (decodedPath.startsWith('/') || decodedPath.startsWith('\\')) {
    decodedPath = decodedPath.substring(1);
  }

  const filePath = path.join(BASE_DIR, decodedPath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const total = stats.size;
    const range = req.headers.range;

    if (range && contentType.startsWith('video/')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const chunksize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
      });

      fs.createReadStream(filePath).pipe(res);
    }
  });
}

const server = http.createServer(async (req, res) => {
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
  const pathname = parsedUrl.pathname;

  // ==========================================
  // REST API ENDPOINTS
  // ==========================================

  // 0. AUTHENTICATION API
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const username = (body.username || '').trim().toLowerCase();
      const password = (body.password || '').trim();

      const validUsers = {
        'kamel': { pass: 'kamel2026', nameAr: 'أ/ كامل', nameEn: 'Mr. Kamel', role: 'مدير النظام التنفيذي' },
        'adham': { pass: 'adham2026', nameAr: 'أ/ أدهم', nameEn: 'Mr. Adham', role: 'مدير النظام التنفيذي' }
      };

      if (validUsers[username] && validUsers[username].pass === password) {
        const u = validUsers[username];
        const token = 'zaher_auth_' + Buffer.from(username + '_' + Date.now()).toString('base64');
        return sendJson(res, 200, {
          success: true,
          token: token,
          user: {
            username: username,
            nameAr: u.nameAr,
            nameEn: u.nameEn,
            role: u.role
          }
        });
      } else {
        return sendJson(res, 401, {
          success: false,
          error: 'اسم المستخدم أو كلمة المرور غير صحيحة'
        });
      }
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 1. CARPETS API
  if (pathname === '/api/carpets' && req.method === 'GET') {
    const carpets = readJson('carpets.json', []);
    return sendJson(res, 200, carpets);
  }

  if (pathname === '/api/carpets' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const carpets = readJson('carpets.json', []);
      
      const imagesArr = Array.isArray(body.images) && body.images.length > 0
        ? body.images
        : (body.image ? [body.image] : ['images/carpet-07-carpet-completed.jpeg']);

      const mainImg = body.image || imagesArr[0];

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
        image: mainImg,
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
      if (index === -1) return sendJson(res, 404, { error: 'Carpet not found' });
      
      const imagesArr = Array.isArray(body.images) && body.images.length > 0
        ? body.images
        : (body.image ? [body.image] : (carpets[index].images || [carpets[index].image]));

      const mainImg = body.image || imagesArr[0];

      carpets[index] = Object.assign({}, carpets[index], body, {
        id: id,
        image: mainImg,
        images: imagesArr
      });

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
      return sendJson(res, 200, { success: true, message: 'Deleted successfully' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 2. IMAGE UPLOAD API (Accepts single imageData OR array of images in body.images)
  if (pathname === '/api/upload' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      
      // If multiple images are provided
      if (Array.isArray(body.images) && body.images.length > 0) {
        const savedUrls = [];
        for (let i = 0; i < body.images.length; i++) {
          const imgStr = body.images[i];
          if (imgStr.startsWith('data:')) {
            const urlPath = saveBase64Image(imgStr);
            if (urlPath) savedUrls.push(urlPath);
          } else {
            savedUrls.push(imgStr); // already a URL
          }
        }
        return sendJson(res, 200, {
          success: true,
          imageUrls: savedUrls,
          imageUrl: savedUrls[0] || ''
        });
      }

      // Single image fallback
      if (body.imageData) {
        const urlPath = saveBase64Image(body.imageData);
        if (!urlPath) {
          return sendJson(res, 400, { error: 'Invalid Base64 format' });
        }
        return sendJson(res, 200, {
          success: true,
          imageUrl: urlPath,
          imageUrls: [urlPath]
        });
      }

      return sendJson(res, 400, { error: 'No image data provided' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 3. REVIEWS API
  if (pathname === '/api/reviews' && req.method === 'GET') {
    const reviews = readJson('reviews.json', []);
    return sendJson(res, 200, reviews);
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
    const inquiries = readJson('inquiries.json', []);
    return sendJson(res, 200, inquiries);
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

  if (pathname.indexOf('/api/inquiries/') === 0 && req.method === 'PUT') {
    const id = pathname.replace('/api/inquiries/', '');
    try {
      const body = await parseBody(req);
      const inquiries = readJson('inquiries.json', []);
      const index = inquiries.findIndex(i => i.id === id);
      if (index === -1) return sendJson(res, 404, { error: 'Inquiry not found' });
      inquiries[index] = Object.assign({}, inquiries[index], body, { id: id });
      writeJson('inquiries.json', inquiries);
      return sendJson(res, 200, { success: true, inquiry: inquiries[index] });
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
    const settings = readJson('settings.json', {});
    return sendJson(res, 200, settings);
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

  // Default: Serve static files
  serveStatic(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[ZAHER SALMAN SERVER] Running on http://localhost:' + PORT);
});

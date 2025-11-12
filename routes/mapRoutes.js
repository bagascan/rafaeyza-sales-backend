const express = require('express');
const axios = require('axios');
const router = express.Router();

// Proxy untuk Reverse Geocoding (koordinat -> alamat)
router.get('/reverse', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({ msg: 'Latitude dan longitude diperlukan.' });
    }

    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        format: 'json',
        lat: lat,
        lon: lon,
      },
      headers: {
        // Backend BISA mengatur header ini tanpa masalah
        'User-Agent': `RafaeyzaSalesApp/1.0 (${process.env.ADMIN_EMAIL || 'admin@example.com'})`
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Nominatim reverse proxy error:', error.message);
    res.status(500).json({ msg: 'Gagal menghubungi layanan peta.' });
  }
});

// Proxy untuk Geocoding (alamat -> koordinat)
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ msg: 'Query alamat diperlukan.' });
    }

    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: q,
        format: 'json',
        limit: 1,
      },
      headers: {
        'User-Agent': `RafaeyzaSalesApp/1.0 (${process.env.ADMIN_EMAIL || 'admin@example.com'})`
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Nominatim search proxy error:', error.message);
    res.status(500).json({ msg: 'Gagal menghubungi layanan peta.' });
  }
});

module.exports = router;
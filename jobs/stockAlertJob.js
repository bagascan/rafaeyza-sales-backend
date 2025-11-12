const cron = require('node-cron');
const webpush = require('web-push');
const User = require('../models/User');
const Visit = require('../models/Visit');
const Product = require('../models/Product');

const checkLowStock = async () => {
  console.log('Menjalankan tugas pengecekan stok rendah...');

  try {
    // 1. Agregasi untuk mendapatkan stok terakhir dari setiap produk di setiap pelanggan
    const latestStockPerCustomer = await Visit.aggregate([
      { $sort: { customer: 1, product: 1, createdAt: -1 } },
      {
        $group: {
          _id: { customer: '$customer', product: '$inventory.product' },
          lastVisit: { $first: '$$ROOT' }
        }
      },
      { $unwind: '$_id.product' },
      {
        $project: {
          productId: '$_id.product',
          finalStock: {
            $let: {
              vars: {
                item: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$lastVisit.inventory',
                        as: 'inv',
                        cond: { $eq: ['$$inv.product', '$_id.product'] }
                      }
                    }, 0
                  ]
                }
              },
              in: '$$item.finalStock'
            }
          }
        }
      }
    ]);

    // 2. Hitung total stok untuk setiap produk
    const totalStockByProduct = latestStockPerCustomer.reduce((acc, item) => {
      const productId = item.productId.toString();
      acc[productId] = (acc[productId] || 0) + item.finalStock;
      return acc;
    }, {});

    // 3. Dapatkan semua admin yang berlangganan notifikasi
    const admins = await User.find({ role: 'admin', pushSubscription: { $ne: null } });
    if (admins.length === 0) {
      console.log('Tidak ada admin yang berlangganan notifikasi. Tugas selesai.');
      return;
    }

     // --- NEW: Get the low stock threshold from settings ---
    const settings = await Settings.getSettings();
    const LOW_STOCK_THRESHOLD = settings.lowStockThreshold;


    // 4. Kirim notifikasi untuk setiap produk yang stoknya rendah
    for (const productId in totalStockByProduct) {
      if (totalStockByProduct[productId] < LOW_STOCK_THRESHOLD) {
        const product = await Product.findById(productId);
        if (product) {
          console.log(`Peringatan: Stok ${product.name} menipis (${totalStockByProduct[productId]} pcs).`);

          const payload = JSON.stringify({
            title: 'Peringatan Stok Rendah',
            body: `Stok untuk '${product.name}' menipis. Tersisa ${totalStockByProduct[productId]} pcs di semua pelanggan.`,
            icon: '/logo192.png',
          });

          for (const admin of admins) {
            webpush.sendNotification(admin.pushSubscription, payload).catch(error => {
              console.error(`Gagal mengirim notifikasi stok rendah ke ${admin.name}:`, error.message);
            });
          }
        }
      }
    }

  } catch (error) {
    console.error('Error saat menjalankan tugas pengecekan stok:', error);
  }
};

// Jadwalkan tugas untuk berjalan setiap 1 jam
const scheduleStockAlert = () => {
  cron.schedule('0 * * * *', () => { // '0 * * * *' berarti "pada menit ke-0 setiap jam"
    checkLowStock();
  }, {
    scheduled: true,
    timezone: "Asia/Jakarta"
  });

  console.log('Tugas pengecekan stok rendah terjadwal setiap jam.');
};

module.exports = scheduleStockAlert;

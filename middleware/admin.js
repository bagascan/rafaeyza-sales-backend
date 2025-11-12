// Middleware untuk memeriksa apakah pengguna adalah admin

module.exports = function (req, res, next) {
  // Middleware 'auth' harus sudah berjalan sebelumnya,
  // sehingga kita memiliki akses ke req.user

  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ msg: 'Akses ditolak. Hanya untuk admin.' });
  }

  // Jika pengguna adalah admin, lanjutkan ke handler rute berikutnya
  next();
};

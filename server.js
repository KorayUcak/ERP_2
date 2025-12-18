const express = require('express');
const cors = require('cors');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const db = require('./config/db');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));
app.use(session({
  secret: 'simya-erp-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const authMiddleware = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  next();
};

const adminMiddleware = (req, res, next) => {
  if (req.session.role !== 'admin') {
    return res.status(403).send('Yetkisiz erişim');
  }
  next();
};

const personelMiddleware = (req, res, next) => {
  if (req.session.role !== 'personel') {
    return res.status(403).send('Yetkisiz erişim');
  }
  next();
};

const personelRoutes = require('./routes/personel')(db);
app.use('/personel', personelRoutes);

app.get('/', (req, res) => {
  if (req.session.userId) {
    if (req.session.role === 'admin') {
      return res.redirect('/admin');
    } else if (req.session.role === 'personel') {
      return res.redirect('/personel');
    }
  }
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('Giriş denemesi - Kullanıcı adı:', username);
    
    const [[user]] = await db.query(
      'SELECT * FROM kullanicilar WHERE KullaniciAdi = ?',
      [username]
    );
    
    if (!user) {
      console.log('Kullanıcı bulunamadı!');
      return res.render('login', { error: 'Kullanıcı adı veya şifre hatalı!' });
    }
    
    console.log('Veritabanından gelen şifre:', user.SifreHash);
    console.log('Girilen şifre:', password);
    
    if (user.SifreHash !== password) {
      console.log('Şifre eşleşmedi!');
      return res.render('login', { error: 'Kullanıcı adı veya şifre hatalı!' });
    }
    
    console.log('Şifre doğru! Kullanıcı ID:', user.KullaniciID);
    
    const [[minUser]] = await db.query('SELECT MIN(KullaniciID) as minId FROM kullanicilar');
    const [[maxUser]] = await db.query('SELECT MAX(KullaniciID) as maxId FROM kullanicilar');
    
    console.log('Min ID:', minUser.minId, 'Max ID:', maxUser.maxId, 'Giriş yapan ID:', user.KullaniciID);
    
    req.session.userId = user.KullaniciID;
    req.session.username = user.KullaniciAdi;
    
    if (user.KullaniciID === minUser.minId) {
      req.session.role = 'admin';
      console.log('Admin olarak yönlendiriliyor...');
      return res.redirect('/admin');
    } else if (user.KullaniciID === maxUser.maxId) {
      req.session.role = 'personel';
      console.log('Personel olarak yönlendiriliyor...');
      return res.redirect('/personel');
    } else {
      console.log('Yetkisiz kullanıcı!');
      return res.render('login', { error: 'Yetkisiz kullanıcı!' });
    }
    
  } catch (error) {
    console.error('Login Hatası:', error);
    res.render('login', { error: 'Giriş sırasında bir hata oluştu!' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.get('/admin', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [[stats]] = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM siparisler) as toplam_siparis,
        (SELECT COUNT(*) FROM siparisdetay sd LEFT JOIN kalitekontrolcikis kkc ON sd.SiparisDetayID = kkc.SiparisDetayID WHERE kkc.KcCikisID IS NULL) as aktif_siparis,
        (SELECT COUNT(*) FROM siparisler WHERE TerminTarihi = CURDATE()) as bugun_termin,
        (SELECT COUNT(*) FROM siparisler s JOIN siparisdetay sd ON s.SiparisID = sd.SiparisID LEFT JOIN kalitekontrolcikis kkc ON sd.SiparisDetayID = kkc.SiparisDetayID WHERE s.TerminTarihi < CURDATE() AND kkc.KcCikisID IS NULL) as geciken,
        (SELECT COUNT(*) FROM operatorler) as toplam_operator,
        (SELECT COUNT(*) FROM hareketler WHERE BitisZamani IS NULL) as aktif_islem,
        (SELECT COUNT(*) FROM kimyasalstok ks JOIN kimyasallar k ON ks.KimyasalID = k.KimyasalID WHERE ks.MevcutMiktar < k.AsgariStokSeviyesi) as kritik_stok
    `);
    
    const [stokUyari] = await db.query(`
      SELECT k.KimyasalAdi, ks.MevcutMiktar as mevcut_miktar, k.AsgariStokSeviyesi as asgari_seviye, 
             (k.AsgariStokSeviyesi - ks.MevcutMiktar) as eksik_miktar
      FROM kimyasalstok ks
      JOIN kimyasallar k ON ks.KimyasalID = k.KimyasalID
      WHERE ks.MevcutMiktar < k.AsgariStokSeviyesi
    `);
    
    const asgariStokAlti = stokUyari.length;
    
    const [aktifSiparisler] = await db.query(`
      SELECT sd.SiparisDetayID as id, m.MusteriAdi as musteri_adi, sd.ParcaAdi as urun_adi, 
             CASE WHEN kkc.KcCikisID IS NULL THEN 'Devam Ediyor' ELSE 'Tamamlandı' END as durum,
             s.TerminTarihi as teslim_tarihi,
             DATEDIFF(s.TerminTarihi, CURDATE()) as kalan_gun
      FROM siparisdetay sd
      JOIN siparisler s ON sd.SiparisID = s.SiparisID
      JOIN musteriler m ON s.MusteriID = m.MusteriID
      LEFT JOIN kalitekontrolcikis kkc ON sd.SiparisDetayID = kkc.SiparisDetayID
      WHERE kkc.KcCikisID IS NULL
      ORDER BY s.TerminTarihi ASC
      LIMIT 10
    `);
    
    const [customers] = await db.query('SELECT MusteriID, MusteriAdi FROM musteriler ORDER BY MusteriAdi ASC');
    
    res.render('admin/dashboard', { 
      username: req.session.username, 
      stats: { ...stats, asgari_stok_alti: asgariStokAlti },
      stokUyari,
      aktifSiparisler,
      arananSiparis: null,
      musteriSiparisler: null,
      musteriler: [],
      kimyasallar: [],
      customers,
      success: null,
      error: null
    });
  } catch (error) {
    console.error('Admin Dashboard Hatası:', error);
    res.render('admin/dashboard', { 
      username: req.session.username, 
      stats: {},
      stokUyari: [],
      aktifSiparisler: [],
      arananSiparis: null,
      musteriSiparisler: null,
      musteriler: [],
      kimyasallar: [],
      customers: [],
      success: null,
      error: 'Dashboard yüklenirken hata oluştu!'
    });
  }
});

app.post('/admin/siparis-ara', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { siparis_id } = req.body;
    const [[arananSiparis]] = await db.query('SELECT * FROM siparisdetay WHERE SiparisDetayID = ?', [siparis_id]);
    
    const [[stats]] = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM siparisler) as toplam_siparis,
        (SELECT COUNT(*) FROM siparisdetay sd LEFT JOIN kalitekontrolcikis kkc ON sd.SiparisDetayID = kkc.SiparisDetayID WHERE kkc.KcCikisID IS NULL) as aktif_siparis,
        (SELECT COUNT(*) FROM siparisler WHERE TerminTarihi = CURDATE()) as bugun_termin,
        (SELECT COUNT(*) FROM siparisler s JOIN siparisdetay sd ON s.SiparisID = sd.SiparisID LEFT JOIN kalitekontrolcikis kkc ON sd.SiparisDetayID = kkc.SiparisDetayID WHERE s.TerminTarihi < CURDATE() AND kkc.KcCikisID IS NULL) as geciken,
        (SELECT COUNT(*) FROM operatorler) as toplam_operator,
        (SELECT COUNT(*) FROM hareketler WHERE BitisZamani IS NULL) as aktif_islem,
        (SELECT COUNT(*) FROM kimyasalstok ks JOIN kimyasallar k ON ks.KimyasalID = k.KimyasalID WHERE ks.MevcutMiktar < k.AsgariStokSeviyesi) as kritik_stok
    `);
    
    const [stokUyari] = await db.query(`
      SELECT k.KimyasalAdi, ks.MevcutMiktar as mevcut_miktar, k.AsgariStokSeviyesi as asgari_seviye, 
             (k.AsgariStokSeviyesi - ks.MevcutMiktar) as eksik_miktar
      FROM kimyasalstok ks
      JOIN kimyasallar k ON ks.KimyasalID = k.KimyasalID
      WHERE ks.MevcutMiktar < k.AsgariStokSeviyesi
    `);
    
    const [aktifSiparisler] = await db.query(`
      SELECT sd.SiparisDetayID as id, m.MusteriAdi as musteri_adi, sd.ParcaAdi as urun_adi, 
             CASE WHEN kkc.KcCikisID IS NULL THEN 'Devam Ediyor' ELSE 'Tamamlandı' END as durum,
             s.TerminTarihi as teslim_tarihi,
             DATEDIFF(s.TerminTarihi, CURDATE()) as kalan_gun
      FROM siparisdetay sd
      JOIN siparisler s ON sd.SiparisID = s.SiparisID
      JOIN musteriler m ON s.MusteriID = m.MusteriID
      LEFT JOIN kalitekontrolcikis kkc ON sd.SiparisDetayID = kkc.SiparisDetayID
      WHERE kkc.KcCikisID IS NULL
      ORDER BY s.TerminTarihi ASC
      LIMIT 10
    `);
    
    const [customers] = await db.query('SELECT MusteriID, MusteriAdi FROM musteriler ORDER BY MusteriAdi ASC');
    
    res.render('admin/dashboard', { 
      username: req.session.username, 
      stats: { ...stats, asgari_stok_alti: stokUyari.length },
      stokUyari,
      aktifSiparisler,
      arananSiparis,
      musteriSiparisler: null,
      musteriler: [],
      kimyasallar: [],
      customers,
      success: arananSiparis ? null : null,
      error: arananSiparis ? null : 'Sipariş bulunamadı!'
    });
  } catch (error) {
    console.error('Sipariş Arama Hatası:', error);
    res.redirect('/admin');
  }
});

app.post('/admin/musteri-siparisler', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { musteri_adi } = req.body;
    const [musteriSiparisler] = await db.query(
      `SELECT sd.*, m.MusteriAdi, s.TerminTarihi 
       FROM siparisdetay sd 
       JOIN siparisler s ON sd.SiparisID = s.SiparisID 
       JOIN musteriler m ON s.MusteriID = m.MusteriID
       LEFT JOIN kalitekontrolcikis kkc ON sd.SiparisDetayID = kkc.SiparisDetayID 
       WHERE m.MusteriAdi = ? AND kkc.KcCikisID IS NULL 
       ORDER BY s.TerminTarihi ASC`,
      [musteri_adi]
    );
    
    const [[stats]] = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM siparisler) as toplam_siparis,
        (SELECT COUNT(*) FROM siparisdetay sd LEFT JOIN kalitekontrolcikis kkc ON sd.SiparisDetayID = kkc.SiparisDetayID WHERE kkc.KcCikisID IS NULL) as aktif_siparis,
        (SELECT COUNT(*) FROM siparisler WHERE TerminTarihi = CURDATE()) as bugun_termin,
        (SELECT COUNT(*) FROM siparisler s JOIN siparisdetay sd ON s.SiparisID = sd.SiparisID LEFT JOIN kalitekontrolcikis kkc ON sd.SiparisDetayID = kkc.SiparisDetayID WHERE s.TerminTarihi < CURDATE() AND kkc.KcCikisID IS NULL) as geciken,
        (SELECT COUNT(*) FROM operatorler) as toplam_operator,
        (SELECT COUNT(*) FROM hareketler WHERE BitisZamani IS NULL) as aktif_islem,
        (SELECT COUNT(*) FROM kimyasalstok ks JOIN kimyasallar k ON ks.KimyasalID = k.KimyasalID WHERE ks.MevcutMiktar < k.AsgariStokSeviyesi) as kritik_stok
    `);
    
    const [stokUyari] = await db.query(`
      SELECT k.KimyasalAdi, ks.MevcutMiktar as mevcut_miktar, k.AsgariStokSeviyesi as asgari_seviye, 
             (k.AsgariStokSeviyesi - ks.MevcutMiktar) as eksik_miktar
      FROM kimyasalstok ks
      JOIN kimyasallar k ON ks.KimyasalID = k.KimyasalID
      WHERE ks.MevcutMiktar < k.AsgariStokSeviyesi
    `);
    
    const [aktifSiparisler] = await db.query(`
      SELECT sd.SiparisDetayID as id, m.MusteriAdi as musteri_adi, sd.ParcaAdi as urun_adi, 
             CASE WHEN kkc.KcCikisID IS NULL THEN 'Devam Ediyor' ELSE 'Tamamlandı' END as durum,
             s.TerminTarihi as teslim_tarihi,
             DATEDIFF(s.TerminTarihi, CURDATE()) as kalan_gun
      FROM siparisdetay sd
      JOIN siparisler s ON sd.SiparisID = s.SiparisID
      JOIN musteriler m ON s.MusteriID = m.MusteriID
      LEFT JOIN kalitekontrolcikis kkc ON sd.SiparisDetayID = kkc.SiparisDetayID
      WHERE kkc.KcCikisID IS NULL
      ORDER BY s.TerminTarihi ASC
      LIMIT 10
    `);
    
    const [customers] = await db.query('SELECT MusteriID, MusteriAdi FROM musteriler ORDER BY MusteriAdi ASC');
    
    res.render('admin/dashboard', { 
      username: req.session.username, 
      stats: { ...stats, asgari_stok_alti: stokUyari.length },
      stokUyari,
      aktifSiparisler,
      arananSiparis: null,
      musteriSiparisler,
      musteriler: [],
      kimyasallar: [],
      customers,
      success: null,
      error: null
    });
  } catch (error) {
    console.error('Müşteri Sipariş Arama Hatası:', error);
    res.redirect('/admin');
  }
});

app.get('/admin/stok-yenile', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [kimyasallar] = await db.query(`
      SELECT 
        k.KimyasalID as id,
        k.KimyasalAdi as kimyasal_adi,
        k.Birim as birim,
        ks.MevcutMiktar as stok_miktar,
        k.AsgariStokSeviyesi as asgari_seviye
      FROM kimyasallar k
      LEFT JOIN kimyasalstok ks ON k.KimyasalID = ks.KimyasalID
      ORDER BY k.KimyasalAdi ASC
    `);
    res.render('admin/stok-yenile', { username: req.session.username, kimyasallar, success: null, error: null });
  } catch (error) {
    console.error('Stok Yenileme Hatası:', error);
    res.render('admin/stok-yenile', { username: req.session.username, kimyasallar: [], success: null, error: 'Veri yüklenirken hata oluştu!' });
  }
});

app.post('/admin/stok-yenile', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { kimyasal_id, giris_miktar } = req.body;
    
    await db.query(
      'INSERT INTO kimyasalstokgiris (KimyasalID, Miktar, GirisTarihi) VALUES (?, ?, NOW())',
      [kimyasal_id, giris_miktar]
    );
    
    await db.query(
      'UPDATE kimyasalstok SET MevcutMiktar = MevcutMiktar + ? WHERE KimyasalID = ?',
      [giris_miktar, kimyasal_id]
    );
    
    const [kimyasallar] = await db.query(`
      SELECT 
        k.KimyasalID as id,
        k.KimyasalAdi as kimyasal_adi,
        k.Birim as birim,
        ks.MevcutMiktar as stok_miktar,
        k.AsgariStokSeviyesi as asgari_seviye
      FROM kimyasallar k
      LEFT JOIN kimyasalstok ks ON k.KimyasalID = ks.KimyasalID
      ORDER BY k.KimyasalAdi ASC
    `);
    res.render('admin/stok-yenile', { username: req.session.username, kimyasallar, success: 'Stok başarıyla güncellendi!', error: null });
  } catch (error) {
    console.error('Stok Güncelleme Hatası:', error);
    const [kimyasallar] = await db.query(`
      SELECT 
        k.KimyasalID as id,
        k.KimyasalAdi as kimyasal_adi,
        k.Birim as birim,
        ks.MevcutMiktar as stok_miktar,
        k.AsgariStokSeviyesi as asgari_seviye
      FROM kimyasallar k
      LEFT JOIN kimyasalstok ks ON k.KimyasalID = ks.KimyasalID
      ORDER BY k.KimyasalAdi ASC
    `);
    res.render('admin/stok-yenile', { username: req.session.username, kimyasallar, success: null, error: 'Stok güncellenirken hata oluştu!' });
  }
});

app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1');
    res.json({
      success: true,
      message: 'Veritabanı bağlantısı başarılı!',
      data: rows
    });
  } catch (error) {
    console.error('DB Hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Veritabanı bağlantı hatası',
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor...`);
});

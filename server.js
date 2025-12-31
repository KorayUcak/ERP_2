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
app.use('/cizimler', express.static('cizimler'));
app.use(express.static('public'));
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

// Kimyasal Tüketim Raporu
app.get('/admin/kimyasal-tuketim', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { start, end, operator_id, kimyasal_id } = req.query;

    const [operators] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
    const [chemicals] = await db.query('SELECT KimyasalID, KimyasalAdi FROM kimyasallar ORDER BY KimyasalAdi');

    const where = [];
    const params = [];

    if (start) {
      where.push('kt.TuketimTarihi >= ?');
      params.push(`${start} 00:00:00`);
    }

    if (end) {
      where.push('kt.TuketimTarihi <= ?');
      params.push(`${end} 23:59:59`);
    }

    if (operator_id) {
      where.push('kt.OperatorID = ?');
      params.push(operator_id);
    }

    if (kimyasal_id) {
      where.push('kt.KimyasalID = ?');
      params.push(kimyasal_id);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [records] = await db.query(
      `SELECT 
        kt.TuketimID,
        kt.TuketimTarihi,
        kt.TuketilenMiktar,
        o.AdSoyad as OperatorAdi,
        k.KimyasalAdi,
        k.Birim
      FROM kimyasaltuketim kt
      LEFT JOIN operatorler o ON kt.OperatorID = o.OperatorID
      LEFT JOIN kimyasallar k ON kt.KimyasalID = k.KimyasalID
      ${whereSql}
      ORDER BY kt.TuketimTarihi DESC
      LIMIT 500`,
      params
    );

    const [[ozet]] = await db.query(
      `SELECT 
        COUNT(*) as toplam_kayit,
        COALESCE(SUM(kt.TuketilenMiktar), 0) as toplam_tuketim
      FROM kimyasaltuketim kt
      ${whereSql}`,
      params
    );

    res.render('admin/kimyasal-tuketim', {
      username: req.session.username,
      operators,
      chemicals,
      records,
      ozet: ozet || { toplam_kayit: 0, toplam_tuketim: 0 },
      filters: {
        start: start || '',
        end: end || '',
        operator_id: operator_id || '',
        kimyasal_id: kimyasal_id || ''
      }
    });
  } catch (error) {
    console.error('Kimyasal Tüketim Raporu Hatası:', error);
    res.render('admin/kimyasal-tuketim', {
      username: req.session.username,
      operators: [],
      chemicals: [],
      records: [],
      ozet: { toplam_kayit: 0, toplam_tuketim: 0 },
      filters: { start: '', end: '', operator_id: '', kimyasal_id: '' }
    });
  }
});

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
        (SELECT COUNT(DISTINCT sd.SiparisDetayID) 
         FROM siparisdetay sd 
         JOIN siparisler s ON sd.SiparisID = s.SiparisID
         LEFT JOIN islem_adim_kayitlari iak ON sd.SiparisDetayID = iak.SiparisDetayID AND iak.AdimKodu = 'MAL_KABUL'
         LEFT JOIN kalitekontrolcikis kkc ON sd.SiparisDetayID = kkc.SiparisDetayID 
         LEFT JOIN iadeler i ON s.SiparisID = i.SiparisID
         WHERE kkc.KcCikisID IS NULL AND iak.KayitID IS NOT NULL AND i.IadeID IS NULL) as aktif_siparis,
        (SELECT COUNT(*) FROM siparisler WHERE TerminTarihi = CURDATE()) as bugun_termin,
        (SELECT COUNT(DISTINCT sd.SiparisDetayID) 
         FROM siparisler s 
         JOIN siparisdetay sd ON s.SiparisID = sd.SiparisID 
         LEFT JOIN islem_adim_kayitlari iak ON sd.SiparisDetayID = iak.SiparisDetayID AND iak.AdimKodu = 'MAL_KABUL'
         LEFT JOIN kalitekontrolcikis kkc ON sd.SiparisDetayID = kkc.SiparisDetayID 
         LEFT JOIN iadeler i ON s.SiparisID = i.SiparisID
         WHERE s.TerminTarihi < CURDATE() AND kkc.KcCikisID IS NULL AND iak.KayitID IS NOT NULL AND i.IadeID IS NULL) as geciken,
        (SELECT COUNT(*) FROM operatorler) as toplam_operator,
        (SELECT COUNT(*) FROM hareketler WHERE BitisZamani IS NULL) as aktif_islem,
        (SELECT COUNT(*) FROM kimyasalstok ks JOIN kimyasallar k ON ks.KimyasalID = k.KimyasalID WHERE ks.MevcutMiktar < k.AsgariStokSeviyesi) as kritik_stok
    `);
    
    const [stokUyari] = await db.query(`
      SELECT k.KimyasalAdi as kimyasal_adi, ks.MevcutMiktar as mevcut_miktar, k.AsgariStokSeviyesi as asgari_seviye, 
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
      LEFT JOIN iadeler i ON s.SiparisID = i.SiparisID
      LEFT JOIN sevkiyatlar sv ON sd.SiparisDetayID = sv.SiparisDetayID
      WHERE i.IadeID IS NULL AND sv.SevkiyatID IS NULL
      ORDER BY CASE WHEN s.TerminTarihi IS NULL THEN 1 ELSE 0 END, s.TerminTarihi ASC
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
      SELECT k.KimyasalAdi as kimyasal_adi, ks.MevcutMiktar as mevcut_miktar, k.AsgariStokSeviyesi as asgari_seviye, 
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
      LEFT JOIN iadeler i ON s.SiparisID = i.SiparisID
      WHERE i.IadeID IS NULL
      ORDER BY CASE WHEN s.TerminTarihi IS NULL THEN 1 ELSE 0 END, s.TerminTarihi ASC
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
      SELECT k.KimyasalAdi as kimyasal_adi, ks.MevcutMiktar as mevcut_miktar, k.AsgariStokSeviyesi as asgari_seviye, 
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
      LEFT JOIN iadeler i ON s.SiparisID = i.SiparisID
      WHERE i.IadeID IS NULL
      ORDER BY CASE WHEN s.TerminTarihi IS NULL THEN 1 ELSE 0 END, s.TerminTarihi ASC
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
    console.log('Stok Yenile Request:', { kimyasal_id, giris_miktar });
    
    // Trigger (stok_ekle_trigger) otomatik olarak kimyasalstok tablosunu güncelliyor
    // Bu yüzden sadece kimyasalstokgiris'e INSERT yapmak yeterli
    await db.query(
      'INSERT INTO kimyasalstokgiris (KimyasalID, Miktar, GirisTarihi, BirimMaliyet) VALUES (?, ?, CURDATE(), 0)',
      [kimyasal_id, giris_miktar]
    );
    console.log('kimyasalstokgiris INSERT başarılı - trigger stoku güncelledi');
    
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

// Raporlar Sayfası
app.get('/admin/raporlar', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // İade Özeti (Son 30 gün)
    const [iadeOzetResult] = await db.query(`
      SELECT 
        COUNT(DISTINCT i.IadeID) as toplam_iade,
        COALESCE(SUM(id.IadeMiktari), 0) as toplam_iade_miktari,
        SUM(CASE WHEN i.TekrarIslemYapilacakMi = 1 THEN 1 ELSE 0 END) as tekrar_islem_sayisi
      FROM iadeler i
      LEFT JOIN iadedetay id ON i.IadeID = id.IadeID
      WHERE i.IadeTarihi >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `);
    const iadeOzet = iadeOzetResult[0] || { toplam_iade: 0, toplam_iade_miktari: 0, tekrar_islem_sayisi: 0 };
    
    // Son 5 İade (İade bazlı)
    const [sonIadeler] = await db.query(`
      SELECT 
        i.IadeID,
        i.IadeTarihi,
        i.IadeNedeni,
        i.TekrarIslemYapilacakMi,
        s.SiparisKodu,
        m.MusteriAdi,
        COALESCE(SUM(id.IadeMiktari), 0) as ToplamIadeMiktari
      FROM iadeler i
      JOIN siparisler s ON i.SiparisID = s.SiparisID
      JOIN musteriler m ON s.MusteriID = m.MusteriID
      LEFT JOIN iadedetay id ON i.IadeID = id.IadeID
      GROUP BY i.IadeID, i.IadeTarihi, i.IadeNedeni, i.TekrarIslemYapilacakMi, s.SiparisKodu, m.MusteriAdi
      ORDER BY i.IadeTarihi DESC, i.IadeID DESC
      LIMIT 5
    `);
    
    // Adım bazlı kayıp özeti
    const [adimKayiplar] = await db.query(`
      SELECT AdimKodu, SUM(KayipMiktar) as ToplamKayip
      FROM islem_adim_kayitlari
      GROUP BY AdimKodu
      ORDER BY AdimKodu
    `);
    
    // Adım/Operatör detay listesi
    const [adimKayitlar] = await db.query(`
      SELECT 
        iak.KayitID,
        iak.AdimKodu,
        iak.ToplamMiktar,
        iak.KayipMiktar,
        iak.KayitTarihi,
        iak.Aciklama,
        s.SiparisKodu,
        sd.ParcaAdi,
        COALESCE(o.AdSoyad, '-') as OperatorAdi
      FROM islem_adim_kayitlari iak
      JOIN siparisdetay sd ON iak.SiparisDetayID = sd.SiparisDetayID
      JOIN siparisler s ON sd.SiparisID = s.SiparisID
      LEFT JOIN operatorler o ON iak.OperatorID = o.OperatorID
      ORDER BY iak.KayitTarihi DESC
      LIMIT 50
    `);
    
    // Sipariş bazlı miktar takibi
    const [siparisMiktarlar] = await db.query(`
      SELECT 
        s.SiparisKodu,
        sd.ParcaAdi,
        sd.Miktar as BaslangicMiktar,
        MAX(CASE WHEN iak.AdimKodu = 'MAL_KABUL' THEN iak.ToplamMiktar END) as MalKabulMiktar,
        MAX(CASE WHEN iak.AdimKodu = 'MAL_KABUL' THEN iak.KayipMiktar END) as MalKabulKayip,
        MAX(CASE WHEN iak.AdimKodu = 'GIRIS_KALITE' THEN iak.ToplamMiktar END) as GirisKaliteMiktar,
        MAX(CASE WHEN iak.AdimKodu = 'GIRIS_KALITE' THEN iak.KayipMiktar END) as GirisKaliteKayip,
        MAX(CASE WHEN iak.AdimKodu = 'OPERATOR_PROSES' THEN iak.ToplamMiktar END) as OperatorMiktar,
        MAX(CASE WHEN iak.AdimKodu = 'OPERATOR_PROSES' THEN iak.KayipMiktar END) as OperatorKayip,
        MAX(CASE WHEN iak.AdimKodu = 'CIKIS_KALITE' THEN iak.ToplamMiktar END) as CikisKaliteMiktar,
        MAX(CASE WHEN iak.AdimKodu = 'CIKIS_KALITE' THEN iak.KayipMiktar END) as CikisKaliteKayip,
        SUM(iak.KayipMiktar) as ToplamKayip
      FROM siparisdetay sd
      JOIN siparisler s ON sd.SiparisID = s.SiparisID
      LEFT JOIN islem_adim_kayitlari iak ON sd.SiparisDetayID = iak.SiparisDetayID
      WHERE iak.KayitID IS NOT NULL
      GROUP BY sd.SiparisDetayID, s.SiparisKodu, sd.ParcaAdi, sd.Miktar
      ORDER BY s.SiparisKodu DESC
      LIMIT 50
    `);
    
    res.render('admin/raporlar', {
      username: req.session.username,
      iadeOzet,
      sonIadeler,
      adimKayiplar,
      adimKayitlar,
      siparisMiktarlar
    });
  } catch (error) {
    console.error('Raporlar Hatası:', error);
    res.render('admin/raporlar', {
      username: req.session.username,
      iadeOzet: { toplam_iade: 0, toplam_iade_miktari: 0, tekrar_islem_sayisi: 0 },
      sonIadeler: [],
      adimKayiplar: [],
      adimKayitlar: [],
      siparisMiktarlar: []
    });
  }
});

// Operatör Süreleri Sayfası
app.get('/admin/operator-sureleri', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Operatör bazlı toplam süre özeti
    const [operatorOzet] = await db.query(`
      SELECT 
        o.AdSoyad as OperatorAdi,
        SUM(h.HarcananSureDk) as ToplamSure,
        COUNT(h.HareketID) as IslemSayisi
      FROM hareketler h
      JOIN operatorler o ON h.OperatorID = o.OperatorID
      WHERE h.BitisZamani IS NOT NULL
      GROUP BY h.OperatorID, o.AdSoyad
      ORDER BY ToplamSure DESC
    `);
    
    // Operatör banyo adımı detayları
    const [banyoSureleri] = await db.query(`
      SELECT 
        o.AdSoyad as OperatorAdi,
        s.SiparisKodu,
        p.ProsesAdi,
        sba.BanyoAdi,
        sba.SureDkMin,
        sba.SureDkMax,
        h.BaslangicZamani,
        h.BitisZamani,
        h.HarcananSureDk
      FROM hareketler h
      JOIN operatorler o ON h.OperatorID = o.OperatorID
      JOIN uretimplanlama up ON h.PlanID = up.PlanID
      JOIN siparisdetay sd ON up.SiparisDetayID = sd.SiparisDetayID
      JOIN siparisler s ON sd.SiparisID = s.SiparisID
      LEFT JOIN prosesler p ON h.ProsesID = p.ProsesID
      LEFT JOIN standardbanyoadimlari sba ON h.BanyoAdimID = sba.BanyoAdimID
      ORDER BY h.BaslangicZamani DESC
      LIMIT 50
    `);
    
    // Operatör bazlı banyo süre ortalamaları
    const [banyoOrtalama] = await db.query(`
      SELECT 
        o.AdSoyad as OperatorAdi,
        sba.BanyoAdi,
        COUNT(h.HareketID) as IslemSayisi,
        AVG(h.HarcananSureDk) as OrtalamaSure,
        MIN(h.HarcananSureDk) as MinSure,
        MAX(h.HarcananSureDk) as MaxSure
      FROM hareketler h
      JOIN operatorler o ON h.OperatorID = o.OperatorID
      LEFT JOIN standardbanyoadimlari sba ON h.BanyoAdimID = sba.BanyoAdimID
      WHERE h.BitisZamani IS NOT NULL AND h.HarcananSureDk > 0
      GROUP BY h.OperatorID, o.AdSoyad, h.BanyoAdimID, sba.BanyoAdi
      ORDER BY o.AdSoyad, sba.BanyoAdi
    `);
    
    res.render('admin/operator-sureleri', {
      username: req.session.username,
      operatorOzet,
      banyoSureleri,
      banyoOrtalama
    });
  } catch (error) {
    console.error('Operatör Süreleri Hatası:', error);
    res.render('admin/operator-sureleri', {
      username: req.session.username,
      operatorOzet: [],
      banyoSureleri: [],
      banyoOrtalama: []
    });
  }
});

// Bildirimler Sayfası
app.get('/admin/bildirimler', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [bildirimler] = await db.query(
      'SELECT * FROM bildirimler WHERE Aktif = TRUE ORDER BY OlusturmaTarihi DESC'
    );
    res.render('admin/bildirimler', {
      username: req.session.username,
      bildirimler,
      success: null,
      error: null
    });
  } catch (error) {
    console.error('Bildirimler Hatası:', error);
    res.render('admin/bildirimler', {
      username: req.session.username,
      bildirimler: [],
      success: null,
      error: 'Bildirimler yüklenirken hata oluştu!'
    });
  }
});

// Bildirim Ekleme
app.post('/admin/bildirimler/ekle', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { mesaj } = req.body;
    
    if (!mesaj || mesaj.trim() === '') {
      const [bildirimler] = await db.query(
        'SELECT * FROM bildirimler WHERE Aktif = TRUE ORDER BY OlusturmaTarihi DESC'
      );
      return res.render('admin/bildirimler', {
        username: req.session.username,
        bildirimler,
        success: null,
        error: 'Lütfen bir mesaj giriniz!'
      });
    }
    
    await db.query(
      'INSERT INTO bildirimler (Mesaj) VALUES (?)',
      [mesaj.trim()]
    );
    
    const [bildirimler] = await db.query(
      'SELECT * FROM bildirimler WHERE Aktif = TRUE ORDER BY OlusturmaTarihi DESC'
    );
    
    res.render('admin/bildirimler', {
      username: req.session.username,
      bildirimler,
      success: 'Bildirim başarıyla eklendi!',
      error: null
    });
  } catch (error) {
    console.error('Bildirim Ekleme Hatası:', error);
    const [bildirimler] = await db.query(
      'SELECT * FROM bildirimler WHERE Aktif = TRUE ORDER BY OlusturmaTarihi DESC'
    );
    res.render('admin/bildirimler', {
      username: req.session.username,
      bildirimler,
      success: null,
      error: 'Bildirim eklenirken hata oluştu!'
    });
  }
});

// Bildirim Silme
app.post('/admin/bildirimler/sil/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.query(
      'UPDATE bildirimler SET Aktif = FALSE WHERE BildirimID = ?',
      [id]
    );
    
    const [bildirimler] = await db.query(
      'SELECT * FROM bildirimler WHERE Aktif = TRUE ORDER BY OlusturmaTarihi DESC'
    );
    
    res.render('admin/bildirimler', {
      username: req.session.username,
      bildirimler,
      success: 'Bildirim başarıyla kaldırıldı!',
      error: null
    });
  } catch (error) {
    console.error('Bildirim Silme Hatası:', error);
    const [bildirimler] = await db.query(
      'SELECT * FROM bildirimler WHERE Aktif = TRUE ORDER BY OlusturmaTarihi DESC'
    );
    res.render('admin/bildirimler', {
      username: req.session.username,
      bildirimler,
      success: null,
      error: 'Bildirim kaldırılırken hata oluştu!'
    });
  }
});

// Sipariş Durumu Sorgulama API
app.post('/admin/siparis-durumu', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('=== Sipariş Durumu Sorgulama Başladı ===');
    const { siparis_kodu } = req.body;
    console.log('Aranan sipariş kodu:', siparis_kodu);
    
    if (!siparis_kodu) {
      return res.json({ success: false, error: 'Sipariş kodu giriniz!' });
    }
    
    // Sipariş bilgilerini al
    console.log('Sipariş bilgileri sorgulanıyor...');
    const [[siparis]] = await db.query(`
      SELECT 
        s.*,
        m.MusteriAdi,
        m.Email,
        m.Telefon,
        m.Adres
      FROM siparisler s
      JOIN musteriler m ON s.MusteriID = m.MusteriID
      WHERE s.SiparisKodu = ?
    `, [siparis_kodu]);
    
    if (!siparis) {
      console.log('Sipariş bulunamadı!');
      return res.json({ success: false, error: 'Sipariş bulunamadı!' });
    }
    
    console.log('Sipariş bulundu:', siparis.SiparisID, siparis.SiparisKodu);
    
    // Sipariş detaylarını al
    const [siparisDetaylar] = await db.query(`
      SELECT 
        sd.*
      FROM siparisdetay sd
      WHERE sd.SiparisID = ?
    `, [siparis.SiparisID]);
    
    // Her detay için işlem durumlarını kontrol et
    for (let detay of siparisDetaylar) {
      try {
        // Debug: Görsel yollarını kontrol et
        console.log('Sipariş Detay ID:', detay.SiparisDetayID);
        console.log('CizimDosyaYolu:', detay.CizimDosyaYolu);
        console.log('UrunFotografi:', detay.UrunFotografi);
        
        // Proses bilgilerini uretimplanlama üzerinden al
        let prosesInfo = null;
        try {
          const [[result]] = await db.query(`
            SELECT p.ProsesAdi, p.Aciklama as ProsesAciklama
            FROM uretimplanlama up
            LEFT JOIN prosesler p ON up.ProsesID = p.ProsesID
            WHERE up.SiparisDetayID = ?
            LIMIT 1
          `, [detay.SiparisDetayID]);
          prosesInfo = result;
        } catch (err) {
          console.error('Proses bilgisi sorgu hatası:', err.message);
        }
        
        detay.ProsesAdi = prosesInfo?.ProsesAdi || null;
        detay.ProsesAciklama = prosesInfo?.ProsesAciklama || null;
        
        // Mal Kabul durumu
        let malKabul = null;
        try {
          const [[result]] = await db.query(`
            SELECT * FROM islem_adim_kayitlari 
            WHERE SiparisDetayID = ? AND AdimKodu = 'MAL_KABUL'
            ORDER BY KayitTarihi DESC LIMIT 1
          `, [detay.SiparisDetayID]);
          malKabul = result;
        } catch (err) {
          console.error('Mal kabul sorgu hatası:', err.message);
        }
        
        // Giriş Kalite durumu
        let girisKalite = null;
        try {
          const [[result]] = await db.query(`
            SELECT * FROM islem_adim_kayitlari 
            WHERE SiparisDetayID = ? AND AdimKodu = 'GIRIS_KALITE'
            ORDER BY KayitTarihi DESC LIMIT 1
          `, [detay.SiparisDetayID]);
          girisKalite = result;
        } catch (err) {
          console.error('Giriş kalite sorgu hatası:', err.message);
        }
        
        // Operatör İşlemi durumu
        let operatorIslem = null;
        try {
          const [[result]] = await db.query(`
            SELECT * FROM islem_adim_kayitlari 
            WHERE SiparisDetayID = ? AND AdimKodu = 'OPERATOR_PROSES'
            ORDER BY KayitTarihi DESC LIMIT 1
          `, [detay.SiparisDetayID]);
          operatorIslem = result;
        } catch (err) {
          console.error('Operatör işlem sorgu hatası:', err.message);
        }
        
        // Çıkış Kalite durumu
        let cikisKalite = null;
        try {
          const [[result]] = await db.query(`
            SELECT * FROM kalitekontrolcikis 
            WHERE SiparisDetayID = ?
            ORDER BY KontrolTarihi DESC LIMIT 1
          `, [detay.SiparisDetayID]);
          cikisKalite = result;
        } catch (err) {
          console.error('Çıkış kalite sorgu hatası:', err.message);
        }
        
        // Sevkiyat durumu
        let sevkiyat = null;
        try {
          const [[result]] = await db.query(`
            SELECT * FROM sevkiyatlar 
            WHERE SiparisDetayID = ?
            ORDER BY SevkiyatTarihi DESC LIMIT 1
          `, [detay.SiparisDetayID]);
          sevkiyat = result;
        } catch (err) {
          console.error('Sevkiyat sorgu hatası:', err.message);
        }
        
        // İade durumu
        let iade = null;
        try {
          const [[result]] = await db.query(`
            SELECT i.* FROM iadeler i
            WHERE i.SiparisID = ?
            ORDER BY i.IadeTarihi DESC LIMIT 1
          `, [siparis.SiparisID]);
          iade = result;
        } catch (err) {
          console.error('İade sorgu hatası:', err.message);
        }
        
        // Operatör hareketleri
        let hareketler = [];
        try {
          const [result] = await db.query(`
            SELECT 
              h.*,
              o.AdSoyad as OperatorAdi,
              sba.BanyoAdi,
              p.ProsesAdi
            FROM hareketler h
            JOIN operatorler o ON h.OperatorID = o.OperatorID
            JOIN uretimplanlama up ON h.PlanID = up.PlanID
            LEFT JOIN standardbanyoadimlari sba ON h.BanyoAdimID = sba.BanyoAdimID
            LEFT JOIN prosesler p ON h.ProsesID = p.ProsesID
            WHERE up.SiparisDetayID = ?
            ORDER BY h.BaslangicZamani DESC
          `, [detay.SiparisDetayID]);
          hareketler = result;
        } catch (err) {
          console.error('Hareketler sorgu hatası:', err.message);
        }
        
        // Durumu belirle
        let durum = 'Beklemede';
        if (iade) {
          durum = 'İade Edildi';
        } else if (sevkiyat) {
          durum = 'Sevkiyatı Tamamlandı';
        } else if (cikisKalite) {
          durum = 'Tamamlandı';
        } else if (operatorIslem) {
          durum = 'Operatör İşleminde';
        } else if (girisKalite) {
          durum = 'Giriş Kalite Kontrolünde';
        } else if (malKabul) {
          durum = 'Mal Kabul Yapıldı';
        }
        
        detay.durum = durum;
        detay.malKabul = malKabul;
        detay.girisKalite = girisKalite;
        detay.operatorIslem = operatorIslem;
        detay.cikisKalite = cikisKalite;
        detay.sevkiyat = sevkiyat;
        detay.iade = iade;
        detay.hareketler = hareketler;
        detay.FaturaTutari = siparis.FaturaTutari;
      } catch (detayError) {
        console.error('Detay işleme hatası:', detayError.message);
        // Hata olsa bile detayı ekle, sadece boş değerlerle
        detay.durum = 'Hata';
        detay.malKabul = null;
        detay.girisKalite = null;
        detay.operatorIslem = null;
        detay.cikisKalite = null;
        detay.sevkiyat = null;
        detay.iade = null;
        detay.hareketler = [];
        detay.FaturaTutari = siparis.FaturaTutari;
      }
    }
    
    console.log('Sipariş sorgusu başarılı, detay sayısı:', siparisDetaylar.length);
    console.log('Sipariş bilgisi:', siparis.SiparisKodu);
    
    res.json({ 
      success: true, 
      siparis: siparis,
      detaylar: siparisDetaylar
    });
    
  } catch (error) {
    console.error('Sipariş Durumu Sorgulama Hatası:', error);
    console.error('Error Stack:', error.stack);
    console.error('Error Message:', error.message);
    res.json({ success: false, error: 'Sorgu sırasında hata oluştu: ' + error.message });
  }
});

// Sevkiyat Tamamlama
app.post('/admin/sevkiyat-tamamla', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { siparisDetayID } = req.body;
    
    // Sipariş detaylarını al
    const [[siparisDetay]] = await db.query(`
      SELECT sd.*, s.SiparisKodu, s.SiparisID, s.MusteriID, s.TerminTarihi
      FROM siparisdetay sd
      JOIN siparisler s ON sd.SiparisID = s.SiparisID
      WHERE sd.SiparisDetayID = ?
    `, [siparisDetayID]);
    
    if (!siparisDetay) {
      return res.status(404).json({ success: false, error: 'Sipariş bulunamadı' });
    }
    
    // Sevkiyat tablosuna kaydet (SevkEdilenMiktar = Miktar)
    await db.query(`
      INSERT INTO sevkiyatlar (SiparisDetayID, SevkiyatTarihi, SevkEdilenMiktar)
      VALUES (?, NOW(), ?)
    `, [siparisDetayID, siparisDetay.Miktar]);
    
    res.json({ success: true, message: 'Sevkiyat başarıyla tamamlandı' });
  } catch (error) {
    console.error('Sevkiyat Tamamlama Hatası:', error);
    res.status(500).json({ success: false, error: 'Sevkiyat tamamlanırken hata oluştu' });
  }
});

// Sevkiyatı Tamamlananlar Sayfası
app.get('/admin/sevkiyat-tamamlananlar', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [sevkiyatlar] = await db.query(`
      SELECT 
        sv.SevkiyatID,
        sv.SevkiyatTarihi,
        sd.SiparisDetayID,
        sd.ParcaAdi,
        sd.Miktar,
        s.SiparisKodu,
        s.TerminTarihi,
        m.MusteriAdi
      FROM sevkiyatlar sv
      JOIN siparisdetay sd ON sv.SiparisDetayID = sd.SiparisDetayID
      JOIN siparisler s ON sd.SiparisID = s.SiparisID
      JOIN musteriler m ON s.MusteriID = m.MusteriID
      ORDER BY sv.SevkiyatTarihi DESC
    `);
    
    res.render('admin/sevkiyat-tamamlananlar', {
      username: req.session.username,
      sevkiyatlar
    });
  } catch (error) {
    console.error('Sevkiyat Listesi Hatası:', error);
    res.render('admin/sevkiyat-tamamlananlar', {
      username: req.session.username,
      sevkiyatlar: []
    });
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

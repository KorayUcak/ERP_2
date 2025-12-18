const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

const authMiddleware = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  next();
};

const personelMiddleware = (req, res, next) => {
  if (req.session.role !== 'personel') {
    return res.redirect('/');
  }
  next();
};

module.exports = (db) => {
  
  router.get('/', authMiddleware, personelMiddleware, (req, res) => {
    res.render('personel/dashboard', { username: req.session.username });
  });

  router.get('/mal-kabul', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const [operatorler] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
      
      const [orders] = await db.query(`
        SELECT 
          sd.SiparisDetayID, 
          s.SiparisKodu, 
          m.MusteriAdi, 
          sd.ParcaAdi, 
          sd.Miktar 
        FROM siparisdetay sd
        JOIN siparisler s ON sd.SiparisID = s.SiparisID
        JOIN musteriler m ON s.MusteriID = m.MusteriID
        WHERE sd.SiparisDetayID NOT IN (SELECT SiparisDetayID FROM kalitekontrolgiris)
        ORDER BY s.SiparisKodu DESC
      `);
      
      res.render('personel/mal-kabul', { 
        username: req.session.username, 
        operators: operatorler,
        orders,
        success: null, 
        error: null 
      });
    } catch (error) {
      console.error('Mal Kabul GET Hatası:', error);
      res.render('personel/mal-kabul', { 
        username: req.session.username, 
        operators: [],
        orders: [],
        success: null, 
        error: 'Veri yüklenirken hata oluştu!' 
      });
    }
  });

  router.post('/mal-kabul', authMiddleware, personelMiddleware, upload.single('fotograf'), async (req, res) => {
    try {
      const { siparis_id, operator_id, toplam_miktar } = req.body;
      const fotografYolu = req.file ? req.file.filename : null;
      
      await db.query(
        'UPDATE siparisdetay SET Miktar = ?, CizimDosyaYolu = ? WHERE SiparisDetayID = ?',
        [toplam_miktar, fotografYolu, siparis_id]
      );
      
      const [operatorler] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
      const [orders] = await db.query(`
        SELECT 
          sd.SiparisDetayID, 
          s.SiparisKodu, 
          m.MusteriAdi, 
          sd.ParcaAdi, 
          sd.Miktar 
        FROM siparisdetay sd
        JOIN siparisler s ON sd.SiparisID = s.SiparisID
        JOIN musteriler m ON s.MusteriID = m.MusteriID
        WHERE sd.SiparisDetayID NOT IN (SELECT SiparisDetayID FROM kalitekontrolgiris)
        ORDER BY s.SiparisKodu DESC
      `);
      
      res.render('personel/mal-kabul', { 
        username: req.session.username, 
        operators: operatorler,
        orders,
        success: 'Mal kabul işlemi tamamlandı!', 
        error: null 
      });
    } catch (error) {
      console.error('Mal Kabul POST Hatası:', error);
      const [operatorler] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
      const [orders] = await db.query(`
        SELECT 
          sd.SiparisDetayID, 
          s.SiparisKodu, 
          m.MusteriAdi, 
          sd.ParcaAdi, 
          sd.Miktar 
        FROM siparisdetay sd
        JOIN siparisler s ON sd.SiparisID = s.SiparisID
        JOIN musteriler m ON s.MusteriID = m.MusteriID
        WHERE sd.SiparisDetayID NOT IN (SELECT SiparisDetayID FROM kalitekontrolgiris)
        ORDER BY s.SiparisKodu DESC
      `);
      res.render('personel/mal-kabul', { 
        username: req.session.username, 
        operators: operatorler,
        orders,
        success: null, 
        error: 'Mal kabul kaydedilirken hata oluştu!' 
      });
    }
  });

  router.get('/giris-kalite', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const [operatorler] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
      
      const [orders] = await db.query(`
        SELECT 
          sd.SiparisDetayID, 
          s.SiparisKodu, 
          m.MusteriAdi, 
          sd.ParcaAdi, 
          sd.Miktar 
        FROM siparisdetay sd
        JOIN siparisler s ON sd.SiparisID = s.SiparisID
        JOIN musteriler m ON s.MusteriID = m.MusteriID
        WHERE sd.SiparisDetayID NOT IN (SELECT SiparisDetayID FROM kalitekontrolgiris)
        ORDER BY s.SiparisKodu DESC
      `);
      
      res.render('personel/giris-kalite', { 
        username: req.session.username, 
        operators: operatorler,
        orders,
        success: null, 
        error: null 
      });
    } catch (error) {
      console.error('Giriş Kalite GET Hatası:', error);
      res.render('personel/giris-kalite', { 
        username: req.session.username, 
        operators: [],
        orders: [],
        success: null, 
        error: 'Veri yüklenirken hata oluştu!' 
      });
    }
  });

  router.post('/giris-kalite', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const { siparis_id, operator_id, kayip_miktar, kayip_aciklama } = req.body;
      
      if (kayip_miktar && parseFloat(kayip_miktar) > 0) {
        await db.query(
          'INSERT INTO kayipurunler (SiparisDetayID, OperatorID, KayipMiktar, Aciklama, KayitTarihi) VALUES (?, ?, ?, ?, NOW())',
          [siparis_id, operator_id, kayip_miktar, kayip_aciklama]
        );
      }
      
      await db.query(
        'INSERT INTO kalitekontrolgiris (SiparisDetayID, KontrolTarihi) VALUES (?, NOW())',
        [siparis_id]
      );
      
      res.redirect('/personel/giris-kalite');
    } catch (error) {
      console.error('Giriş Kalite POST Hatası:', error);
      res.redirect('/personel/giris-kalite?error=' + encodeURIComponent('Kalite kontrolü kaydedilirken hata oluştu!'));
    }
  });

  router.get('/uretim-planlama', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const [orders] = await db.query(`
        SELECT 
          sd.SiparisDetayID, 
          s.SiparisKodu, 
          sd.ParcaAdi, 
          sd.Miktar,
          COALESCE(m.MusteriAdi, 'Müşteri Bilgisi Yok') as MusteriAdi
        FROM siparisdetay sd
        JOIN siparisler s ON sd.SiparisID = s.SiparisID
        LEFT JOIN musteriler m ON s.MusteriID = m.MusteriID
        WHERE sd.SiparisDetayID IN (SELECT SiparisDetayID FROM kalitekontrolgiris)
        AND sd.SiparisDetayID NOT IN (SELECT SiparisDetayID FROM uretimplanlama)
        ORDER BY s.SiparisKodu DESC
      `);
      
      console.log('Üretim Planlama Bekleyen Sipariş Sayısı:', orders.length);
      
      const [prosesler] = await db.query('SELECT ProsesID, ProsesAdi FROM prosesler ORDER BY ProsesAdi');
      
      const [banyolar] = await db.query('SELECT BanyoAdimID, BanyoAdi FROM standardbanyoadimlari ORDER BY SiraNo ASC');
      
      res.render('personel/uretim-planlama', { 
        username: req.session.username, 
        orders,
        processes: prosesler,
        baths: banyolar,
        success: null, 
        error: null 
      });
    } catch (error) {
      console.error('Üretim Planlama GET Hatası:', error);
      res.render('personel/uretim-planlama', { 
        username: req.session.username, 
        orders: [],
        processes: [],
        baths: [],
        success: null, 
        error: 'Veri yüklenirken hata oluştu!' 
      });
    }
  });

  router.post('/uretim-planlama', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const { 
        siparis_id, 
        asama1, asama2, asama3, asama4, asama5,
        banyo1, banyo2, banyo3, banyo4, banyo5
      } = req.body;
      
      const asamalar = [
        { proses: asama1, banyo: banyo1 },
        { proses: asama2, banyo: banyo2 },
        { proses: asama3, banyo: banyo3 },
        { proses: asama4, banyo: banyo4 },
        { proses: asama5, banyo: banyo5 }
      ].filter(a => a.proses && a.proses !== '');
      
      for (let i = 0; i < asamalar.length; i++) {
        await db.query(
          'INSERT INTO uretimplanlama (SiparisDetayID, ProsesID, BanyoAdimID, Sira) VALUES (?, ?, ?, ?)',
          [siparis_id, asamalar[i].proses, asamalar[i].banyo || null, i + 1]
        );
      }
      
      if (!req.session.uretimPlanlamalari) {
        req.session.uretimPlanlamalari = {};
      }
      
      const [prosesAdlari] = await db.query(
        'SELECT ProsesAdi FROM prosesler WHERE ProsesID IN (?)',
        [asamalar]
      );
      
      req.session.uretimPlanlamalari[siparis_id] = {
        asamalar: prosesAdlari.map(p => p.ProsesAdi)
      };
      
      
      
      const [siparisler] = await db.query(`
        SELECT sd.SiparisDetayID, sd.SiparisID, sd.ParcaAdi, sd.ParcaTuru, m.MusteriAdi
        FROM siparisdetay sd
        JOIN siparisler s ON sd.SiparisID = s.SiparisID
        JOIN musteriler m ON s.MusteriID = m.MusteriID
        JOIN kalitekontrolgiris kkg ON sd.SiparisDetayID = kkg.SiparisDetayID
        LEFT JOIN uretimplanlama up ON sd.SiparisDetayID = up.SiparisDetayID
        WHERE up.PlanID IS NULL
        ORDER BY sd.SiparisDetayID DESC
      `);
      
      const [prosesler] = await db.query('SELECT ProsesID, ProsesAdi FROM prosesler ORDER BY ProsesAdi');
      
      const [banyolar] = await db.query('SELECT BanyoAdimID, BanyoAdi FROM standardbanyoadimlari ORDER BY BanyoAdi ASC');
      
      res.render('personel/uretim-planlama', { 
        username: req.session.username, 
        siparisler,
        processes: prosesler,
        baths: banyolar,
        success: 'Üretim planlaması kaydedildi!', 
        error: null 
      });
    } catch (error) {
      console.error('Üretim Planlama POST Hatası:', error);
      const [siparisler] = await db.query(`
        SELECT sd.SiparisDetayID, sd.SiparisID, sd.ParcaAdi, sd.ParcaTuru, m.MusteriAdi
        FROM siparisdetay sd
        JOIN siparisler s ON sd.SiparisID = s.SiparisID
        JOIN musteriler m ON s.MusteriID = m.MusteriID
        JOIN kalitekontrolgiris kkg ON sd.SiparisDetayID = kkg.SiparisDetayID
        LEFT JOIN uretimplanlama up ON sd.SiparisDetayID = up.SiparisDetayID
        WHERE up.PlanID IS NULL
        ORDER BY sd.SiparisDetayID DESC
      `);
      const [prosesler] = await db.query('SELECT ProsesID, ProsesAdi FROM prosesler ORDER BY ProsesAdi');
      const [banyolar] = await db.query('SELECT BanyoAdimID, BanyoAdi FROM standardbanyoadimlari ORDER BY BanyoAdi ASC');
      res.render('personel/uretim-planlama', { 
        username: req.session.username, 
        siparisler,
        processes: prosesler,
        baths: banyolar,
        success: null, 
        error: 'Planlama kaydedilirken hata oluştu!' 
      });
    }
  });

  router.get('/operator', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const [operatorler] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
      
      const [siparisler] = await db.query(`
        SELECT sd.SiparisDetayID, sd.SiparisID, sd.ParcaAdi, sd.CizimDosyaYolu, m.MusteriAdi
        FROM siparisdetay sd
        JOIN siparisler s ON sd.SiparisID = s.SiparisID
        JOIN musteriler m ON s.MusteriID = m.MusteriID
        JOIN uretimplanlama up ON sd.SiparisDetayID = up.SiparisDetayID
        WHERE up.Durum != 'Tamamlandı'
        GROUP BY sd.SiparisDetayID
        ORDER BY sd.SiparisDetayID DESC
      `);
      
      const plans = {};
      for (const siparis of siparisler) {
        const [planlar] = await db.query(`
          SELECT 
            up.PlanID,
            up.Sira,
            p.ProsesAdi,
            sba.BanyoAdi as HedefBanyoAdi,
            sba.SureDkMin,
            sba.SureDkMax,
            up.BanyoAdimID
          FROM uretimplanlama up
          JOIN prosesler p ON up.ProsesID = p.ProsesID
          LEFT JOIN standardbanyoadimlari sba ON up.BanyoAdimID = sba.BanyoAdimID
          WHERE up.SiparisDetayID = ?
          ORDER BY up.Sira ASC
        `, [siparis.SiparisDetayID]);
        
        plans[siparis.SiparisDetayID] = planlar;
      }
      
      res.render('personel/operator', { 
        username: req.session.username, 
        operators: operatorler,
        siparisler,
        plans,
        success: null, 
        error: null 
      });
    } catch (error) {
      console.error('Operatör GET Hatası:', error);
      console.error('Hata Detayı:', error.message);
      console.error('Stack:', error.stack);
      res.render('personel/operator', { 
        username: req.session.username, 
        operators: [],
        siparisler: [],
        plans: {},
        success: null, 
        error: 'Veri yüklenirken hata oluştu: ' + error.message 
      });
    }
  });

  router.post('/operator/baslat', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const { siparis_id, operator_id, plan_id, banyo_adi } = req.body;
      
      await db.query(
        'INSERT INTO hareketler (SiparisDetayID, OperatorID, PlanID, BanyoAdi, BaslangicZamani) VALUES (?, ?, ?, ?, NOW())',
        [siparis_id, operator_id, plan_id, banyo_adi]
      );
      
      if (!req.session.operatorIslemler) {
        req.session.operatorIslemler = {};
      }
      
      const key = `${siparis_id}_${plan_id}`;
      req.session.operatorIslemler[key] = {
        baslangic: new Date()
      };
      
      res.json({ success: true });
    } catch (error) {
      console.error('Operatör Başlat Hatası:', error);
      res.json({ success: false, error: error.message });
    }
  });

  router.post('/operator/bitir', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const { siparis_id, plan_id } = req.body;
      
      const key = `${siparis_id}_${plan_id}`;
      const baslangic = req.session.operatorIslemler?.[key]?.baslangic;
      const bitis = new Date();
      const gecenSure = Math.floor((bitis - new Date(baslangic)) / 1000);
      const gecenDakika = Math.floor(gecenSure / 60);
      
      await db.query(
        'UPDATE hareketler SET BitisZamani = NOW(), HarcananSureDk = ? WHERE PlanID = ? AND BitisZamani IS NULL',
        [gecenDakika, plan_id]
      );
      
      if (req.session.operatorIslemler) {
        delete req.session.operatorIslemler[key];
      }
      
      res.json({ success: true, gecen_sure: gecenSure });
    } catch (error) {
      console.error('Operatör Bitir Hatası:', error);
      res.json({ success: false, error: error.message });
    }
  });

  router.get('/cikis-kalite', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const [pendingQc] = await db.query(`
        SELECT DISTINCT sd.SiparisDetayID, sd.ParcaAdi, sd.ParcaNumarasi, sd.Miktar, s.SiparisKodu, m.MusteriAdi
        FROM siparisdetay sd
        JOIN siparisler s ON sd.SiparisID = s.SiparisID
        JOIN musteriler m ON s.MusteriID = m.MusteriID
        JOIN uretimplanlama up ON sd.SiparisDetayID = up.SiparisDetayID
        WHERE up.Durum = 'Tamamlandı'
        AND sd.SiparisDetayID NOT IN (SELECT SiparisDetayID FROM kalitekontrolcikis)
        ORDER BY s.SiparisKodu DESC
      `);
      
      res.render('personel/cikis-kalite', { 
        username: req.session.username, 
        pendingQc,
        success: null, 
        error: null 
      });
    } catch (error) {
      console.error('Çıkış Kalite GET Hatası:', error);
      res.render('personel/cikis-kalite', { 
        username: req.session.username, 
        pendingQc: [],
        success: null, 
        error: 'Veri yüklenirken hata oluştu!' 
      });
    }
  });

  router.post('/cikis-kalite-kaydet', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const { siparis_detay_id, durum, hata_kodu, aciklama } = req.body;
      
      const hataVarMi = durum === 'hata' ? 1 : 0;
      const hataKoduFinal = hataVarMi ? hata_kodu : null;
      const aciklamaFinal = aciklama || null;
      
      await db.query(
        'INSERT INTO kalitekontrolcikis (SiparisDetayID, KontrolTarihi, HataVarMi, HataKodu, HataAciklamasi) VALUES (?, NOW(), ?, ?, ?)',
        [siparis_detay_id, hataVarMi, hataKoduFinal, aciklamaFinal]
      );
      
      const [pendingQc] = await db.query(`
        SELECT DISTINCT sd.SiparisDetayID, sd.ParcaAdi, sd.ParcaNumarasi, sd.Miktar, s.SiparisKodu, m.MusteriAdi
        FROM siparisdetay sd
        JOIN siparisler s ON sd.SiparisID = s.SiparisID
        JOIN musteriler m ON s.MusteriID = m.MusteriID
        JOIN uretimplanlama up ON sd.SiparisDetayID = up.SiparisDetayID
        WHERE up.Durum = 'Tamamlandı'
        AND sd.SiparisDetayID NOT IN (SELECT SiparisDetayID FROM kalitekontrolcikis)
        ORDER BY s.SiparisKodu DESC
      `);
      
      res.render('personel/cikis-kalite', { 
        username: req.session.username, 
        pendingQc,
        success: 'Kalite kontrolü başarıyla kaydedildi!', 
        error: null 
      });
    } catch (error) {
      console.error('Çıkış Kalite Kaydet Hatası:', error);
      const [pendingQc] = await db.query(`
        SELECT DISTINCT sd.SiparisDetayID, sd.ParcaAdi, sd.ParcaNumarasi, sd.Miktar, s.SiparisKodu, m.MusteriAdi
        FROM siparisdetay sd
        JOIN siparisler s ON sd.SiparisID = s.SiparisID
        JOIN musteriler m ON s.MusteriID = m.MusteriID
        JOIN uretimplanlama up ON sd.SiparisDetayID = up.SiparisDetayID
        WHERE up.Durum = 'Tamamlandı'
        AND sd.SiparisDetayID NOT IN (SELECT SiparisDetayID FROM kalitekontrolcikis)
        ORDER BY s.SiparisKodu DESC
      `);
      res.render('personel/cikis-kalite', { 
        username: req.session.username, 
        pendingQc,
        success: null, 
        error: 'Kalite kontrolü kaydedilirken hata oluştu!' 
      });
    }
  });

  router.get('/iade-yonetimi', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const [operatorler] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
      res.render('personel/iade-yonetimi', { 
        username: req.session.username, 
        operatorler, 
        siparis: null, 
        success: null, 
        error: null 
      });
    } catch (error) {
      console.error('İade Yönetimi GET Hatası:', error);
      res.render('personel/iade-yonetimi', { 
        username: req.session.username, 
        operatorler: [], 
        siparis: null, 
        success: null, 
        error: 'Veri yüklenirken hata oluştu!' 
      });
    }
  });

  router.post('/iade-yonetimi/siparis-ara', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const { siparis_kodu } = req.body;
      
      const [[siparis]] = await db.query(`
        SELECT sd.*, m.MusteriAdi
        FROM siparisdetay sd
        JOIN siparisler s ON sd.SiparisID = s.SiparisID
        JOIN musteriler m ON s.MusteriID = m.MusteriID
        WHERE sd.SiparisDetayID = ?
      `, [siparis_kodu]);
      
      const [operatorler] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
      
      if (!siparis) {
        return res.render('personel/iade-yonetimi', { 
          username: req.session.username, 
          operatorler, 
          siparis: null, 
          success: null, 
          error: 'Sipariş bulunamadı!' 
        });
      }
      
      res.render('personel/iade-yonetimi', { 
        username: req.session.username, 
        operatorler, 
        siparis, 
        success: null, 
        error: null 
      });
    } catch (error) {
      console.error('İade Sipariş Arama Hatası:', error);
      const [operatorler] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
      res.render('personel/iade-yonetimi', { 
        username: req.session.username, 
        operatorler, 
        siparis: null, 
        success: null, 
        error: 'Sipariş aranırken hata oluştu!' 
      });
    }
  });

  router.post('/iade-yonetimi', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const { siparis_id, operator_id, iade_nedeni, iade_miktar, aciklama } = req.body;
      
      await db.query(
        'INSERT INTO iadeler (SiparisDetayID, OperatorID, IadeNedeni, IadeMiktar, Aciklama, IadeTarihi) VALUES (?, ?, ?, ?, ?, NOW())',
        [siparis_id, operator_id, iade_nedeni, iade_miktar, aciklama]
      );
      
      const [operatorler] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
      res.render('personel/iade-yonetimi', { 
        username: req.session.username, 
        operatorler, 
        siparis: null, 
        success: 'İade kaydı başarıyla oluşturuldu!', 
        error: null 
      });
    } catch (error) {
      console.error('İade Kaydetme Hatası:', error);
      const [operatorler] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
      res.render('personel/iade-yonetimi', { 
        username: req.session.username, 
        operatorler, 
        siparis: null, 
        success: null, 
        error: 'İade kaydedilirken hata oluştu!' 
      });
    }
  });

  router.get('/kimyasal-tuketim', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const [operatorler] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
      
      const [kimyasallar] = await db.query(`
        SELECT k.KimyasalID, k.KimyasalAdi, k.Birim, ks.MevcutMiktar as StokMiktar
        FROM kimyasallar k
        LEFT JOIN kimyasalstok ks ON k.KimyasalID = ks.KimyasalID
        ORDER BY k.KimyasalAdi
      `);
      
      res.render('personel/kimyasal-tuketim', { 
        username: req.session.username, 
        operators: operatorler, 
        chemicals: kimyasallar, 
        success: null, 
        error: null 
      });
    } catch (error) {
      console.error('Kimyasal Tüketim GET Hatası:', error);
      res.render('personel/kimyasal-tuketim', { 
        username: req.session.username, 
        operators: [], 
        chemicals: [], 
        success: null, 
        error: 'Veri yüklenirken hata oluştu!' 
      });
    }
  });

  router.post('/kimyasal-tuketim', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const { operator_id, kimyasal_id, tuketim_miktar } = req.body;
      
      const [[stok]] = await db.query(
        'SELECT MevcutMiktar FROM kimyasalstok WHERE KimyasalID = ?',
        [kimyasal_id]
      );
      
      if (!stok || stok.MevcutMiktar < parseFloat(tuketim_miktar)) {
        const [operatorler] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
        const [kimyasallar] = await db.query(`
          SELECT k.KimyasalID, k.KimyasalAdi, k.Birim, ks.MevcutMiktar as StokMiktar
          FROM kimyasallar k
          LEFT JOIN kimyasalstok ks ON k.KimyasalID = ks.KimyasalID
          ORDER BY k.KimyasalAdi
        `);
        return res.render('personel/kimyasal-tuketim', { 
          username: req.session.username, 
          operators: operatorler, 
          chemicals: kimyasallar, 
          success: null, 
          error: 'Yetersiz stok!' 
        });
      }
      
      await db.query(
        'UPDATE kimyasalstok SET MevcutMiktar = MevcutMiktar - ? WHERE KimyasalID = ?',
        [tuketim_miktar, kimyasal_id]
      );
      
      const [operatorler] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
      const [kimyasallar] = await db.query(`
        SELECT k.KimyasalID, k.KimyasalAdi, k.Birim, ks.MevcutMiktar as StokMiktar
        FROM kimyasallar k
        LEFT JOIN kimyasalstok ks ON k.KimyasalID = ks.KimyasalID
        ORDER BY k.KimyasalAdi
      `);
      
      res.render('personel/kimyasal-tuketim', { 
        username: req.session.username, 
        operators: operatorler, 
        chemicals: kimyasallar, 
        success: 'Kimyasal tüketimi kaydedildi!', 
        error: null 
      });
    } catch (error) {
      console.error('Kimyasal Tüketim POST Hatası:', error);
      const [operatorler] = await db.query('SELECT OperatorID, AdSoyad FROM operatorler ORDER BY AdSoyad');
      const [kimyasallar] = await db.query(`
        SELECT k.KimyasalID, k.KimyasalAdi, k.Birim, ks.MevcutMiktar as StokMiktar
        FROM kimyasallar k
        LEFT JOIN kimyasalstok ks ON k.KimyasalID = ks.KimyasalID
        ORDER BY k.KimyasalAdi
      `);
      res.render('personel/kimyasal-tuketim', { 
        username: req.session.username, 
        operators: operatorler, 
        chemicals: kimyasallar, 
        success: null, 
        error: 'Tüketim kaydedilirken hata oluştu!' 
      });
    }
  });

  router.get('/siparis-olustur', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      res.render('personel/siparis-olustur', { 
        username: req.session.username, 
        success: null, 
        error: null 
      });
    } catch (error) {
      console.error('Sipariş Oluştur GET Hatası:', error);
      res.render('personel/siparis-olustur', { 
        username: req.session.username, 
        success: null, 
        error: 'Veri yüklenirken hata oluştu!' 
      });
    }
  });

  router.get('/api/kimyasal-bilgi/:id', authMiddleware, personelMiddleware, async (req, res) => {
    try {
      const kimyasalId = req.params.id;
      
      const [kimyasalBilgi] = await db.query(`
        SELECT 
          k.KimyasalID,
          k.KimyasalAdi,
          k.Birim,
          k.AsgariStokSeviyesi,
          COALESCE(ks.MevcutMiktar, 0) as MevcutMiktar
        FROM kimyasallar k
        LEFT JOIN kimyasalstok ks ON k.KimyasalID = ks.KimyasalID
        WHERE k.KimyasalID = ?
      `, [kimyasalId]);
      
      if (kimyasalBilgi.length === 0) {
        return res.status(404).json({ error: 'Kimyasal bulunamadı' });
      }
      
      res.json(kimyasalBilgi[0]);
    } catch (error) {
      console.error('Kimyasal Bilgi API Hatası:', error);
      res.status(500).json({ error: 'Veri alınırken hata oluştu' });
    }
  });

  router.post('/siparis-olustur', authMiddleware, personelMiddleware, upload.single('CizimDosyaYolu'), async (req, res) => {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const { 
        musteriAdi, 
        FaturaTutari,
        TerminTarihi,
        ParcaAdi, 
        ParcaTuru, 
        Miktar, 
        ParcaNumarasi, 
        CizimRevizyonu, 
        KaplamaStandardiKodu 
      } = req.body;
      
      if (!req.file) {
        throw new Error('Çizim dosyası yüklenmedi!');
      }
      
      const cizimDosyaYolu = req.file.filename;
      
      let musteriID;
      const [existingMusteri] = await connection.query(
        'SELECT MusteriID FROM musteriler WHERE MusteriAdi = ?',
        [musteriAdi]
      );
      
      if (existingMusteri.length > 0) {
        musteriID = existingMusteri[0].MusteriID;
      } else {
        const generatedMusteriKodu = 'M-' + Date.now().toString().slice(-6);
        const [newMusteri] = await connection.query(
          'INSERT INTO musteriler (MusteriAdi, MusteriKodu) VALUES (?, ?)',
          [musteriAdi, generatedMusteriKodu]
        );
        musteriID = newMusteri.insertId;
      }
      
      const siparisKodu = 'SIP-' + Date.now();
      
      const [siparisResult] = await connection.query(
        `INSERT INTO siparisler (MusteriID, SiparisKodu, OlusturmaTarihi, TerminTarihi, FaturaTutari) 
         VALUES (?, ?, NOW(), ?, ?)`,
        [musteriID, siparisKodu, TerminTarihi, FaturaTutari]
      );
      
      const siparisID = siparisResult.insertId;
      
      await connection.query(
        `INSERT INTO siparisdetay (
          SiparisID, 
          ParcaAdi, 
          ParcaTuru, 
          Miktar, 
          ParcaNumarasi, 
          CizimDosyaYolu,
          CizimRevizyonu, 
          KaplamaStandardiKodu
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          siparisID,
          ParcaAdi,
          ParcaTuru,
          Miktar,
          ParcaNumarasi || null,
          cizimDosyaYolu,
          CizimRevizyonu || null,
          KaplamaStandardiKodu || null
        ]
      );
      
      await connection.commit();
      
      res.render('personel/siparis-olustur', { 
        username: req.session.username, 
        success: `Sipariş başarıyla oluşturuldu! Sipariş Kodu: ${siparisKodu} | Dosya: ${cizimDosyaYolu}`, 
        error: null 
      });
      
    } catch (error) {
      await connection.rollback();
      console.error('Sipariş Oluşturma Hatası:', error);
      
      res.render('personel/siparis-olustur', { 
        username: req.session.username, 
        success: null, 
        error: 'Sipariş oluşturulurken hata oluştu: ' + error.message 
      });
    } finally {
      connection.release();
    }
  });

  return router;
};

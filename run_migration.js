const db = require('./config/db');

async function runMigration() {
  try {
    console.log('Migration başlatılıyor...');
    
    // islem_adim_kayitlari tablosunu oluştur
    await db.query(`
      CREATE TABLE IF NOT EXISTS islem_adim_kayitlari (
        KayitID INT AUTO_INCREMENT PRIMARY KEY,
        SiparisDetayID INT NOT NULL,
        AdimKodu VARCHAR(50) NOT NULL COMMENT 'SIPARIS_OLUSTURMA, MAL_KABUL, GIRIS_KALITE, URETIM_PLANLAMA, OPERATOR_PROSES, CIKIS_KALITE, IADE',
        OperatorID INT NULL COMMENT 'İşlemi yapan operatör',
        ToplamMiktar INT NULL COMMENT 'O adımda beyan edilen toplam miktar',
        KayipMiktar INT DEFAULT 0 COMMENT 'O adımda kaybedilen/eksik miktar',
        Aciklama TEXT NULL,
        KayitTarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (SiparisDetayID) REFERENCES siparisdetay(SiparisDetayID) ON DELETE CASCADE,
        FOREIGN KEY (OperatorID) REFERENCES operatorler(OperatorID) ON DELETE SET NULL,
        
        INDEX idx_siparis_detay (SiparisDetayID),
        INDEX idx_adim_kodu (AdimKodu),
        INDEX idx_operator (OperatorID),
        INDEX idx_kayit_tarihi (KayitTarihi)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('✅ islem_adim_kayitlari tablosu oluşturuldu!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration hatası:', error.message);
    process.exit(1);
  }
}

runMigration();

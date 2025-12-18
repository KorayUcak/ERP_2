require('dotenv').config();
const mysql = require('mysql2/promise');

async function resetPasswords() {
  let connection;
  
  try {
    console.log('Veritabanına bağlanılıyor...');
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });
    
    console.log('Bağlantı başarılı!');
    console.log('Şifreler güncelleniyor...');
    
    const [result] = await connection.query(
      "UPDATE kullanicilar SET SifreHash = '123456'"
    );
    
    console.log('✅ Şifreler güncellendi!');
    console.log(`Etkilenen kayıt sayısı: ${result.affectedRows}`);
    console.log('Tüm kullanıcılar için şifre: 123456');
    
  } catch (error) {
    console.error('❌ Hata oluştu:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Veritabanı bağlantısı kapatıldı.');
    }
    process.exit(0);
  }
}

resetPasswords();
